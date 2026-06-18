# Lease coexistence & date continuity

## Rule

Two leases on the same unit cannot cover the same day. Overlap = `a.start <= b.end && a.end >= b.start` (open end treated as +∞). Touching boundaries (end == next start) allowed.

- **Ignored**: leases with lifecycle `terminated`, `ended`, `expired`, `cancelled`, or `archived`.
- **Blocker, no override** for overlap with any other lease (draft, signed, scheduled, active).
- Gap between consecutive leases → informational warning only.

## Changes

1. **New** `src/lib/integrity/leaseDateOverlap.ts` — `findOverlappingLeases(leaseId, assignments, state)` returning `{ unitId, otherLeaseId, otherStage, range }[]`. Skips ignored lifecycle stages.
2. **`leaseUnitAssignmentIntegrity.ts`** — after the existing today-snapshot check, call the helper using each draft assignment's dates (falling back to the lease form dates). Emit a single blocker code `LUA_UNIT_OVERLAP` with `overrideAllowed: false`. Used by `LeaseAddDialog` and `LeaseEditDialog` save paths.
3. **`amendmentIntegrity.ts`** — when an amendment changes `leaseEndDate` or adds a unit, rebuild the effective assignments and run the helper. Emit `AMD_UNIT_OVERLAP` (no override).
4. **`AppContext.activateAmendment`** — re-run `validateAmendment` at activation and refuse on blockers.
5. **`leaseIntegrity.canRenewLease`** + `LeaseDetail` end/terminate/renew flows — call the helper with the new end date and block on overlap.
6. **Form UX** — `LeaseAddDialog` / `LeaseEditDialog`: inline message under start/end on blur, in addition to the save-time gate.
7. **i18n** — EN/FR strings for the blocker and the gap warning in `src/i18n/translations.ts`.

## Files

- new: `src/lib/integrity/leaseDateOverlap.ts`
- edit: `src/lib/integrity/leaseUnitAssignmentIntegrity.ts`, `amendmentIntegrity.ts`, `leaseIntegrity.ts`, `index.ts`
- edit: `src/context/AppContext.tsx`
- edit: `src/components/leases/LeaseAddDialog.tsx`, `LeaseEditDialog.tsx`, `src/pages/LeaseDetail.tsx`
- edit: `src/i18n/translations.ts`

## Verification

Manual: A active Jan–Dec; B same unit Jun–Aug → blocked, no override option. B Jan-next-year → allowed. Schedule B next year, amend A end into B → blocked. Terminate A → B becomes allowed.
