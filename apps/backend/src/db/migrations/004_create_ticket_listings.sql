-- =============================================================================
-- Migration: 004_create_ticket_listings.sql
-- Description: Ticket listings + offers backing /dashboard/listings.
--
-- Columns match what the frontend already queries (GET_TICKET_LISTINGS) plus
-- the fields collected by NewListingForm. listing_offers cascades on delete so
-- removing a listing also removes its offers.
--
-- Hasura permissions (role: user):
--   select  — all rows
--   insert  — check { owner_id: { _eq: X-Hasura-User-Id } }
--   delete  — filter: { owner_id: { _eq: X-Hasura-User-Id } }
-- Relationship: ticket_listings.listing_offers (array, listing_offers.listing_id)
-- =============================================================================

-- Up Migration

CREATE TABLE IF NOT EXISTS ticket_listings (
    id SERIAL PRIMARY KEY,
    owner_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    details TEXT,
    bedrooms INTEGER,
    bathrooms INTEGER,
    pet_friendly BOOLEAN NOT NULL DEFAULT FALSE,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    ticket_quantity INTEGER NOT NULL DEFAULT 1 CHECK (ticket_quantity >= 1),
    allow_partial_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    bundle_price NUMERIC(12, 2) CHECK (bundle_price >= 0),
    promotion_percent INTEGER NOT NULL DEFAULT 0
        CHECK (promotion_percent >= 0 AND promotion_percent <= 100),
    promoted BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'unavailable')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_offers (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL REFERENCES ticket_listings(id) ON DELETE CASCADE,
    buyer_name VARCHAR(255),
    buyer_phone VARCHAR(50),
    buyer_wallet_address VARCHAR(255),
    offer_date TIMESTAMPTZ,
    bid_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_listings_owner_id ON ticket_listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_ticket_listings_created_at ON ticket_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_offers_listing_id ON listing_offers(listing_id);

-- =============================================================================
-- Escrow price-lock enforcement (issue #406)
-- -----------------------------------------------------------------------------
-- A seller must not be able to retroactively change a listing's price/terms
-- once a buyer has committed funds to an escrow against it. This trigger is
-- the server-side guard: any UPDATE that changes price, bundle_price,
-- ticket_quantity, allow_partial_purchase, or promotion_percent on a listing
-- that has an active or completed escrow is rejected. Sellers must create a
-- new listing instead.
--
-- Escrows are matched by listing_id when present, falling back to the
-- listing's name (the identifier used by the escrow flow). The trigger is
-- defensive: if no escrow table exists yet, edits are allowed.
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_listing_price_lock()
RETURNS TRIGGER AS $$
DECLARE
    locked_escrows INTEGER := 0;
BEGIN
    -- Only guard edits that actually change escrow-relevant terms.
    IF NEW.price IS NOT DISTINCT FROM OLD.price
       AND NEW.bundle_price IS NOT DISTINCT FROM OLD.bundle_price
       AND NEW.ticket_quantity IS NOT DISTINCT FROM OLD.ticket_quantity
       AND NEW.allow_partial_purchase IS NOT DISTINCT FROM OLD.allow_partial_purchase
       AND NEW.promotion_percent IS NOT DISTINCT FROM OLD.promotion_percent THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'escrows'
    ) THEN
        EXECUTE $q$
            SELECT COUNT(*) FROM public.escrows AS e
            WHERE e.status IN ('active', 'in_progress', 'completed', 'released')
              AND (
                    (to_jsonb(e)->>'listing_id')::int = $1
                 OR (to_jsonb(e)->>'listing_name') = $2
              )
        $q$ INTO locked_escrows USING OLD.id, OLD.name;
    END IF;

    IF locked_escrows > 0 THEN
        RAISE EXCEPTION
            'Listing % has an active or completed escrow; price/terms cannot be edited. Create a new listing instead.',
            OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_listing_price_lock ON ticket_listings;
CREATE TRIGGER trg_enforce_listing_price_lock
    BEFORE UPDATE ON ticket_listings
    FOR EACH ROW
    EXECUTE FUNCTION enforce_listing_price_lock();

-- =============================================================================
-- SafeTrust-era `hotels` data-migration verification (issue #335)
-- -----------------------------------------------------------------------------
-- 002_rename_hotels_to_events.sql renames a carried-over public.hotels table
-- in place so existing rows survive. A rename alone does not prove those rows
-- are meaningful in the ticket-resale domain: hospitality-shaped rows can be
-- renamed into an events table without becoming valid ticket-resale events.
--
-- This pass is idempotent and safe on fresh databases (no legacy table => no
-- rows => nothing to do). It records a verification report so operators can
-- confirm whether any real environment actually carried pre-pivot data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS migration_verification_reports (
    id SERIAL PRIMARY KEY,
    migration VARCHAR(255) NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_rows INTEGER NOT NULL DEFAULT 0,
    suspicious_rows INTEGER NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

DO $$
DECLARE
    legacy_count INTEGER := 0;
    suspicious_count INTEGER := 0;
    legacy_table_exists BOOLEAN := FALSE;
BEGIN
    -- Detect whether a SafeTrust-era `hotels` table still exists (i.e. the
    -- rename in 002 has not run in this environment).
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'hotels'
    ) INTO legacy_table_exists;

    IF legacy_table_exists THEN
        EXECUTE 'SELECT COUNT(*) FROM public.hotels' INTO legacy_count;
    END IF;

    -- If the rename already happened, inspect the resulting events table for
    -- rows that still look hospitality-shaped rather than ticket-resale shaped.
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'events'
    ) THEN
        EXECUTE $q$
            SELECT COUNT(*) FROM public.events AS e
            WHERE (e.name IS NULL OR btrim(e.name) = '')
               OR COALESCE(
                    NULLIF(to_jsonb(e)->>'location', ''),
                    NULLIF(to_jsonb(e)->>'address', '')
               ) IS NULL
        $q$ INTO suspicious_count;
    END IF;

    INSERT INTO migration_verification_reports
        (migration, legacy_rows, suspicious_rows, details)
    VALUES (
        '002_rename_hotels_to_events',
        legacy_count,
        suspicious_count,
        jsonb_build_object(
            'legacy_hotels_table_present', legacy_table_exists,
            'note', 'Fresh databases report 0 legacy rows; nothing to backfill. Non-zero legacy_rows means pre-pivot SafeTrust data exists and must be reviewed before it is treated as ticket-resale events.'
        )
    );
END $$;

-- Down Migration

DROP TRIGGER IF EXISTS trg_enforce_listing_price_lock ON ticket_listings;
DROP FUNCTION IF EXISTS enforce_listing_price_lock();
DROP TABLE IF EXISTS migration_verification_reports;
DROP TABLE IF EXISTS listing_offers;
DROP TABLE IF EXISTS ticket_listings;
