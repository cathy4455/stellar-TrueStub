export interface TicketListingRiskInput {
  id?: string;
  eventName: string;
  eventDate?: string;
  section?: string;
  row?: string;
  seat?: string;
  sellerId: string;
  status?: string;
}

export interface ListingRiskMatch {
  id?: string;
  fingerprint: string;
  reason: string;
  confidence: number;
}

export interface ListingRiskResult {
  fingerprint: string;
  duplicate: boolean;
  riskLevel: "low" | "medium" | "high";
  warning?: string;
  matches: ListingRiskMatch[];
}

const ACTIVE_STATUSES = new Set(["active", "pending", "reserved"]);

function normalize(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSeat(value: string | undefined): string {
  return normalize(value).replace(/[^a-z0-9-]/g, "");
}

export function ticketListingFingerprint(listing: TicketListingRiskInput): string {
  const parts = [
    normalize(listing.eventName),
    normalize(listing.eventDate),
    normalizeSeat(listing.section),
    normalizeSeat(listing.row),
    normalizeSeat(listing.seat),
    normalize(listing.sellerId),
  ];

  return parts.join("|");
}

export function isActiveListing(listing: TicketListingRiskInput): boolean {
  return ACTIVE_STATUSES.has(normalize(listing.status) || "active");
}

/**
 * Assesses fraud risk for a candidate listing against a seller's existing
 * active listings.
 *
 * Match tiers (merged from fraud-detection.ts #371/#372):
 *  - exact fingerprint match       → high risk, duplicate=true,  confidence 0.95
 *  - same section+seller+event,
 *    different row/seat             → medium risk, duplicate=false, confidence 0.6
 *  - same event+seller, no section/
 *    seat overlap (e.g. season-
 *    ticket holder)                 → low risk, soft warning only, confidence 0.2
 */
export function assessListingRisk(
  candidate: TicketListingRiskInput,
  existingListings: TicketListingRiskInput[],
): ListingRiskResult {
  const fingerprint = ticketListingFingerprint(candidate);
  const actives = existingListings
    .filter((l) => l.id !== candidate.id)
    .filter(isActiveListing);

  // ── Tier 1: exact fingerprint match ───────────────────────────────────────
  const exactMatches: ListingRiskMatch[] = actives
    .map((l) => ({ listing: l, fp: ticketListingFingerprint(l) }))
    .filter(({ fp }) => fp === fingerprint)
    .map(({ listing, fp }) => ({
      id: listing.id,
      fingerprint: fp,
      reason: "same seller, event, section, row, and seat",
      confidence: 0.95,
    }));

  if (exactMatches.length > 0) {
    return {
      fingerprint,
      duplicate: true,
      riskLevel: "high",
      warning:
        "This ticket appears to match an active listing from the same seller. Review before publishing.",
      matches: exactMatches,
    };
  }

  // ── Tier 2: same event+seller+section, different row/seat ─────────────────
  const sectionMatches: ListingRiskMatch[] = actives
    .filter((l) => {
      const sameEvent = normalize(l.eventName) === normalize(candidate.eventName);
      const sameSeller = normalize(l.sellerId) === normalize(candidate.sellerId);
      const sameSection =
        normalizeSeat(l.section) !== "" &&
        normalizeSeat(l.section) === normalizeSeat(candidate.section);
      return sameEvent && sameSeller && sameSection;
    })
    .map((l) => ({
      id: l.id,
      fingerprint: ticketListingFingerprint(l),
      reason: "same seller, event, and section — different row or seat",
      confidence: 0.6,
    }));

  if (sectionMatches.length > 0) {
    return {
      fingerprint,
      duplicate: false,
      riskLevel: "medium",
      warning:
        "This ticket is from the same seller and section as an existing listing. Verify it is a different seat.",
      matches: sectionMatches,
    };
  }

  // ── Tier 3: same event+seller, no section/seat overlap ────────────────────
  const softMatches: ListingRiskMatch[] = actives
    .filter((l) => {
      const sameEvent = normalize(l.eventName) === normalize(candidate.eventName);
      const sameSeller = normalize(l.sellerId) === normalize(candidate.sellerId);
      return sameEvent && sameSeller;
    })
    .map((l) => ({
      id: l.id,
      fingerprint: ticketListingFingerprint(l),
      reason: "same seller and event — no section or seat overlap",
      confidence: 0.2,
    }));

  if (softMatches.length > 0) {
    return {
      fingerprint,
      duplicate: false,
      riskLevel: "low",
      warning:
        "This seller has other active listings for the same event. Likely legitimate but worth a quick review.",
      matches: softMatches,
    };
  }

  return {
    fingerprint,
    duplicate: false,
    riskLevel: "low",
    matches: [],
  };
}
