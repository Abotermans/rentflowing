## Why the two were different

Today the lease has **two parallel states** that get displayed side-by-side:

- `lease.leaseStatus` — a stored field with only 4 values: `draft | active | ended | terminated`.
- `getLeaseLifecycleStatus(lease)` — a derived view that *expands* `active` into `active | under-notice | ending-soon | overdue-end` based on `noticeGiven` and `endDate`.

So when notice is registered, the stored status stays `"active"` (because the lease is still legally running) while the derived view returns `"under-notice"`. The UI was rendering both, which is what made "Active + Under notice" appear at the same time.

That split was deliberate originally (notice/ending-soon/overdue-end are time-derived, not user-chosen), but the user-facing surface should expose **one** status. The fix is to collapse them into one state machine, store the user-chosen state, and derive only the time-based variants — then render that single value everywhere.

## Unified state machine

Single type used by every UI surface:

```text
LeaseStatus =
  draft
  | active           // running, no notice, end date far away
  | ending-soon      // running, no notice, endDate within 90 days   (derived)
  | overdue-end      // running, no notice, endDate already passed   (derived)
  | under-notice     // running, notice registered                   (stored flag)
  | ended            // closed normally
  | terminated       // closed early / forced
```

Transitions (all already exist in `AppContext`, just renamed/cleaned):

```text
draft ──activate──► active
active ──registerNotice──► under-notice
under-notice ──cancelNotice──► active
active | under-notice ──(time passes)──► ending-soon → overdue-end   (auto)
active | under-notice | ending-soon | overdue-end ──endLease──► ended
any-active-variant ──terminateLease──► terminated
ended | terminated ──reopen?──► (not supported, same as today)
```

Persisted on the lease:
- `lifecycleStage: "draft" | "active" | "ended" | "terminated"` (renamed from `leaseStatus`, holds only the user-chosen stages)
- `noticeGiven`, `noticeDate`, `intendedMoveOutDate`, `terminationReason`, `endDate`, `endReason` — unchanged

Derived getter `getLeaseStatus(lease): LeaseStatus` (replaces both `lease.leaseStatus` and `getLeaseLifecycleStatus`):

```text
if lifecycleStage in {draft, ended, terminated} → that value
if noticeGiven                                  → under-notice
if endDate < today                              → overdue-end
if endDate within 90 days                       → ending-soon
otherwise                                       → active
```

There is **never** a case where two statuses coexist, because the function returns exactly one value with a strict priority.

## Changes

### Types (`src/types/index.ts`)
- Rename stored field `Lease.leaseStatus` → `Lease.lifecycleStage` (type `"draft" | "active" | "ended" | "terminated"`).
- Remove the public `LeaseStatus = "draft" | "active" | "ended" | "terminated"` type.
- Rename `LeaseLifecycleStatus` → `LeaseStatus` with the 7 values above.
- Rename `getLeaseLifecycleStatus` → `getLeaseStatus`. Same logic, reads `lifecycleStage` instead of `leaseStatus`.

### Mock data (`src/data/mockData.ts`)
- Search/replace `leaseStatus:` → `lifecycleStage:` in every lease seed.

### Context (`src/context/AppContext.tsx`)
- Replace every `leaseStatus` read/write with `lifecycleStage`.
- Mutators `endLease`, `terminateLease`, `confirmMoveOut`, `renewLease`, notice register/cancel — only ever set `lifecycleStage` to `draft | active | ended | terminated`. Notice/dates handle the rest.

### Integrity (`src/lib/integrity/*.ts`)
- `leaseIntegrity.ts`, `unitIntegrity.ts`, `tenantIntegrity.ts`, `propertyIntegrity.ts`: replace `leaseStatus` reads with `lifecycleStage`. Public `canChangeLeaseStatus(target: "ended" | "terminated", …)` keeps its signature (the targets are still the stored stages).

### Pages and components
Every file in this list reads `lease.leaseStatus` or calls `getLeaseLifecycleStatus`. All switch to `getLeaseStatus(lease)` and stop reading the raw stage for display:

- `src/pages/LeaseDetail.tsx` — header badge already used the lifecycle value; just remove any remaining `leaseStatus` text. The summary card no longer needs a separate "stage" row (already removed last turn).
- `src/pages/Leases.tsx` — list badge uses `getLeaseStatus`; filters use the unified 7-value set.
- `src/pages/UnitDetail.tsx`, `src/pages/TenantDetail.tsx`, `src/pages/Tenants.tsx`, `src/pages/Units.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Reports.tsx`, `src/pages/Payments.tsx`, `src/lib/occupancy.ts` — replace `lease.leaseStatus === "active"` checks with `lease.lifecycleStage === "active"` (occupancy logic still needs the stored stage, not the derived label).
- `StatusBadge` — already supports all 7 keys, no change.

### Tests
- `src/lib/lifecycle.test.ts`, `src/lib/occupancy.test.ts` — update `leaseStatus:` → `lifecycleStage:` and `getLeaseLifecycleStatus` → `getLeaseStatus`.

### i18n
- No new keys; `status.*` keys for the 7 values already exist.

## Result

Anywhere a lease status is shown, exactly **one** badge appears, drawn from the unified 7-value `LeaseStatus`. Internally we still distinguish "user-chosen stage" (`lifecycleStage`) from "computed status" (`getLeaseStatus`), but that split is now invisible to the UI and to filters, so "Active" and "Under notice" can never appear together again.
