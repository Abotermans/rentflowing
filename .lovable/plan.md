
# Multi-unit Lease — Verification & Hardening

After tracing the data model, context, and pages, the foundation is sound (proper `LeaseUnitAssignment` table, integrity rules for primary/property/overlap, occupancy aware of assignment role). But several real flaws remain that can corrupt occupancy KPIs, silently leave ancillary units occupied after move-out, and bypass validation. Below is the focused fix list. No new features.

## Findings (verified in code)

### Blockers / correctness bugs

1. **`getPropertyStats` ignores assignments AND inflates occupancy** — `src/context/AppContext.tsx` ~L632. Uses `leases.some(l => l.unitId === u.id && active)`. Result: with a multi-unit lease, the property tile counts apartment + parking + cellar as 3 "occupied" homes. Occupancy rate is double-counted.

2. **`confirmMoveOut` doesn't vacate ancillary units** — `AppContext.tsx` L311. It updates only `units` where `id === lease.unitId` (legacy primary). Cellars / parkings stay marked `occupied` after move-out. Assignments are closed correctly, but `units.currentStatus` drifts.

3. **Lease form save bypasses full draft validation** — `src/pages/Leases.tsx` `handleSave`. Only the primary unit is re-checked via `getActiveLease(form.unitId)`. Extras rely on the dropdown `disabled` state, which is stale across renders / fast clicks. We never call `validateLeaseUnits(...)` before `setLeaseUnits`, so an extra in conflict can slip through.

4. **`updateLease` accepts a property change without re-validating assignments** — `AppContext.tsx` L279. If `propertyId` changes, every existing assignment becomes cross-property silently. `canActivateLease` would catch it later, but the data is already inconsistent.

5. **Status change to `ended` via the lease form does not close assignments** — only `confirmMoveOut` closes open assignments. A lease moved to `ended` through the dropdown leaves `endDate: null` rows behind, so `getActiveLeaseForUnit` keeps reporting the unit as still in this lease.

### Minor display / consistency issues

6. **Lease list shows only the primary unit** — `Leases.tsx` ~L355. Multi-unit leases look like single-unit. Add a `+N ancillary` chip.

7. **Rent Roll report uses `l.unitId`** — `Reports.tsx` L67. Acceptable (rent is lease-level) but should annotate ancillary count for clarity.

8. **Missing convenience helpers** the rest of the codebase keeps re-implementing inline: `getLeaseAssignedUnits`, `getPrimaryLeaseUnit`, `getAncillaryLeaseUnits`, `isUnitAssignedToActiveLease`. Centralise in `src/lib/leaseAssignments.ts` and reuse.

### Verified OK (no change needed)

- `LeaseUnitAssignment` is a first-class entity; no naive `unitIds[]`.
- Legacy `lease.unitId` is kept as a primary-sync mirror only and is rewritten by `setLeaseUnits`, which keeps existing pages (Tenants list, TenantDetail, VendorDetail, LeaseDetail header, Payments) compatible.
- `migrateLegacyLeaseAssignments` runs once in `useState` initializer and seeds one primary row per legacy lease.
- `canActivateLease` enforces: ≥1 unit, exactly one primary, same property, no active overlap.
- `validateLeaseUnits` enforces the same set on drafts (duplicate, multi-primary, property mismatch, overlap).
- `getDerivedOccupancy` is assignment-aware and sets `occupancyRole: 'primary' | 'ancillary'`.
- Dashboard occupancy already counts only primary in numerator and excludes ancillary from denominator.
- Receivables and cash receipts stay lease-scoped — no per-unit duplication.

## Planned fixes

### Data / business logic (`src/context/AppContext.tsx`, `src/lib/leaseAssignments.ts`)

- Rewrite `getPropertyStats` to use `leaseUnitAssignments`:
  - `occupied` = primary active assignments on units of the property
  - `ancillaryLeased` = non-primary active assignments
  - `vacant/reserved/unavailable` from `unit.currentStatus` for units without any active assignment
  - `occupancyRate = occupied / (total - ancillaryLeased)` (guard divide-by-zero)
  - Extend `PropertyStats` with `ancillaryLeased` (additive; existing consumers keep working).
- `confirmMoveOut`: iterate every unit with an open assignment for this lease and set `currentStatus = vacant`, `availableFrom = moveOutDate`. Then close assignments (existing behavior).
- `updateLease`: if `propertyId` changes, refuse silently when any open assignment belongs to a different property; surface via toast at the call site (Leases.tsx form already shows status warnings — reuse same pattern with a blocker toast).
- Add a helper `closeOpenAssignmentsForLease(leaseId, endDate)` and call it from `updateLease` when `lifecycleStage` transitions to `ended` or `terminated`, plus also vacate the linked units (same logic as `confirmMoveOut`).
- Add helpers in `src/lib/leaseAssignments.ts`:
  - `getLeaseAssignedUnits(leaseId, assignments, units, { activeOnly })`
  - `getPrimaryLeaseUnit(leaseId, assignments, units)`
  - `getAncillaryLeaseUnits(leaseId, assignments, units)`
  - `isUnitAssignedToActiveLease(unitId, leases, assignments)`
  Expose through context as pass-through queries.

### Lease form (`src/pages/Leases.tsx`)

- Before calling `setLeaseUnits`, build the full draft (primary + extras) and run `validateLeaseUnits(editingLease?.id ?? null, propertyId, draft, totals, integrityState)`. Block on `blockers`; show warnings as a toast.
- Filter the primary unit dropdown to exclude units already chosen in `extraUnits` (mirror the inverse filter that already exists for extras).
- When user changes `form.propertyId` mid-edit, also clear `extraUnits` (currently only `unitId` is cleared).

### Display polish

- **Lease list (`Leases.tsx`)**: next to the unit cell, render a small `+N` chip when active ancillary assignments exist for the lease. Reuse the existing role badge styles.
- **Rent Roll (`Reports.tsx`)**: append `(+N ancillary)` to the unit column when assignments exist; keep CSV columns unchanged.
- **LeaseDetail header (`LeaseDetail.tsx` L144 area)**: keep the existing "Assigned units" card (already implemented); ensure header `unit` lookup still falls back to the primary assignment if `lease.unitId` is somehow stale (defensive).

## Tests

Extend `src/lib/occupancy.test.ts` and add cases in `src/lib/lifecycle.test.ts`:

- Scenario A: 1 lease / 1 apartment → primary, no ancillary, occupancy 1/1.
- Scenario B: apartment + parking → both occupied, primary only counted; rate ignores parking.
- Scenario C: apartment + cellar + storage → three units occupied, one primary, two ancillary.
- Scenario D: draft including a unit from another property → `validateLeaseUnits` blocks `LUA_PROPERTY_MISMATCH`.
- Scenario E: draft including a unit already in an active lease → blocks `LUA_UNIT_IN_OTHER_LEASE`.
- Scenario F/G: zero / two primary → blocks `LUA_NO_PRIMARY` / `LUA_MULTIPLE_PRIMARY`.
- Scenario H: migrated legacy single-unit lease → one primary assignment row, `getDerivedOccupancy` returns `occupied` + role `primary`, receivables untouched.
- Move-out cascade: lease with apartment + parking → `confirmMoveOut` closes both assignments AND sets both units to `vacant`.
- Status → `ended` via `updateLease`: assignments closed, units vacated.

## Out of scope (explicitly not touched)

- New UI for rent/charges share editing.
- Cross-property leases, lease amendments, per-unit receivables.
- Refactor of Tenants / TenantDetail / VendorDetail unit display (legacy `lease.unitId` mirror keeps these correct).
- Any styling overhaul.

## Files to change

- `src/context/AppContext.tsx` — `getPropertyStats`, `confirmMoveOut`, `updateLease`, new helpers.
- `src/lib/leaseAssignments.ts` — add `getLeaseAssignedUnits`, `getPrimaryLeaseUnit`, `getAncillaryLeaseUnits`, `isUnitAssignedToActiveLease`, `closeOpenAssignmentsForLease`.
- `src/pages/Leases.tsx` — full-draft validation, primary/extras exclusivity, clear extras on property change, +N chip in list.
- `src/pages/Reports.tsx` — annotate ancillary count in Rent Roll.
- `src/types/index.ts` — add `ancillaryLeased: number` to `PropertyStats`.
- `src/lib/occupancy.test.ts`, `src/lib/lifecycle.test.ts` — new scenarios.
