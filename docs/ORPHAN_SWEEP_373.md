# Orphan Sweep — Issue #373

Performed 2026-10-19. All orphaned modules and dead-code components identified
during the sweep are listed below with their disposition.

---

## Backend orphans

| File | Status | Reason | Disposition |
|------|--------|--------|-------------|
| `apps/backend/src/lib/fraud-detection.ts` | **Deleted** | Never imported in production code. Duplicate of `listing-fraud.service.ts` which is the route-wired canonical implementation. Its best logic (confidence scoring, section-level matches, soft same-event warnings) was merged into `listing-fraud.service.ts` as part of #371/#372. | Deleted. Logic merged into `listing-fraud.service.ts`. |
| `apps/backend/src/lib/fraud-detection.test.ts` | **Deleted** | Test file for the deleted `fraud-detection.ts`. Tests for the merged logic are now in `listing-fraud.service.test.ts`. | Deleted. Tests migrated. |
| `apps/backend/src/lib/network-guard.ts` | **Wired** | `assertMainnetSubmissionAllowed` was never called anywhere — it guarded mainnet Stellar submissions but had no callers. | Wired into `TrustlessWorkRefundExecutor.execute()` in `refund.service.ts` before the `resolveDispute` call. |
| `apps/backend/src/routes/health.ts` (broken import) | **Fixed** | Imported from `../services/disputeResolverBalance` which does not exist. The real file is `../services/dispute-resolver-balance.service`. Additionally, the route checked `result.ok` but the real `DisputeResolverBalanceCheckResult` shape has `{ skipped, balance?, threshold?, low, error? }` — no `ok` field. | Fixed import path. Changed `result.ok ? 'ok' : 'low'` → `result.low ? 'low' : 'ok'`. |
| `apps/backend/src/services/notification.service.ts` | **Not orphaned** | Initially flagged as a candidate but IS imported — `webhooks.ts` calls `NotificationService.notifyEscrowStatusChange` as a static method, and `listing-alert.service.ts` also imports it. No action needed. | No change. |

---

## Frontend orphans

| File | Status | Reason | Disposition |
|------|--------|--------|-------------|
| `apps/frontend/src/components/dev/ApolloTestComponent.tsx` | **Deleted** | Dev-only Apollo debugging component. Never imported in any production code path. | Deleted. |
| `apps/frontend/src/components/dev/CacheInspector.tsx` | **Deleted** | Dev-only Apollo cache inspector. Never imported in any production code path. | Deleted. |
| `apps/frontend/src/components/dev/GraphQLDebugger.tsx` | **Deleted** | Dev-only GraphQL request debugger. Never imported in any production code path. | Deleted. |
| `apps/frontend/src/components/dev/QueryPerformance.tsx` | **Deleted** | Dev-only query performance monitor. Never imported in any production code path. | Deleted. |
| `apps/frontend/src/components/__dev__/ApolloTestComponent.tsx` | **Deleted** | Duplicate orphaned dev component in the `__dev__` folder. Never imported in any production code path. | Deleted. |

---

## Fraud detection consolidation (#371 / #372)

Two separate fraud-detection implementations existed side by side:

| Implementation | Location | Wired? | Key strengths |
|---------------|----------|--------|---------------|
| `fraud-detection.ts` | `apps/backend/src/lib/` | No — never imported | Confidence scoring (0.95/0.6/0.2), section-level match tier, soft same-event warning, status filtering |
| `listing-fraud.service.ts` | `apps/backend/src/services/` | **Yes** — imported by `listings.ts` route via `assessListingRisk` | `row` field in fingerprint, human-readable `eventName`, `riskLevel` enum, `warning` string, `ACTIVE_STATUSES` includes `pending` and `reserved` |

**Decision**: `listing-fraud.service.ts` is the canonical implementation because it is already wired
into the route. The strengths of `fraud-detection.ts` (confidence scoring and the two additional
match tiers) have been merged into it:

- **Tier 1** (exact fingerprint) → `riskLevel: 'high'`, `duplicate: true`, `confidence: 0.95`
- **Tier 2** (same section+seller+event, different row/seat) → `riskLevel: 'medium'`, `duplicate: false`, `confidence: 0.6`
- **Tier 3** (same event+seller, no section/seat overlap) → `riskLevel: 'low'`, `duplicate: false`, `confidence: 0.2`, with a soft warning

The `ListingRiskMatch` interface gained a `confidence: number` field. This is an additive change and
does not break the existing route response shape.

`fraud-detection.ts` and its test were deleted after the merge.

---

## Summary counts

| Category | Found | Deleted | Wired/Fixed | No action |
|----------|-------|---------|-------------|-----------|
| Backend orphans | 4 | 2 | 2 | 0 |
| Frontend orphans | 5 | 5 | 0 | 0 |
| **Total** | **9** | **7** | **2** | **0** |
