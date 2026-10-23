-- =============================================================================
-- Migration: 008_create_mfa_recovery_codes.sql
-- Description: One-time 2FA recovery codes (#266). Only SHA-256 hashes are
-- stored; plaintext codes are shown to the user once at enrollment.
-- =============================================================================

-- Up Migration

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, code_hash)
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user
    ON mfa_recovery_codes(user_id);

-- Down Migration

DROP TABLE IF EXISTS mfa_recovery_codes;
