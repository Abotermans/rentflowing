# Multi-unit lease refactor

A lease becomes a contract-level container that holds 1..N units through a dedicated `LeaseUnitAssignment` history table. Exactly one assignment is primary, all assigned units belong to the same property, and ancillary units (parking / cellar / storage) are tracked without inflating residential occupancy KPIs.

## 1. Data model

### `LeaseUnitAssignment` (new, in `src/types/index.ts`)

```text
id, leaseId, unitId,
assignmentType: 'primary' | 'ancillary' | 'parking' | 'cellar'
              | 'storage'  | 'office-secondary' | 'commercial-addon' | 'other',
isPrimary: boolean,
startDate, endDate?: string | null,
rentShare?: number | null,        // optional internal split
chargesShare?: number | null,
notes: string,
createdAt, updatedAt
```

Helper: an assignment is "active on date D" when `startDate <= D` and (`endDate` is null or `endDate >= D`).

### `Lease` changes (`src/types/index.ts`)

- Deprecate `unitId` on the type but keep it readable for the migration step (marked `@deprecated`, populated from the primary assignment for backwards compatibility during transition, then removed from writes).
- Add contract-level pricing fields, kept in sync with existing `monthlyRent` / `monthlyCharges`:
  - `baseMonthlyRentTotal`, `baseMonthlyChargesTotal`
  - `effectiveMonthlyRentTotal`, `effectiveMonthlyChargesTotal`, `effectiveMonthlyDueTotal` (computed via a `getLeasePricing(lease, assignments)` helper in a new `src/lib/leasePricing.ts`).
- Keep `propertyId` on the lease — it is the single property all assignments must belong to.

### Unit classification

Add `isAncillaryUnitType(unitType)` in `src/lib/occupancy.ts` returning true for `parking | storage` (and any unit whose lease assignment type is non-primary residential). Used everywhere occupancy reporting needs to exclude ancillaries.

## 2. State & migration (`src/context/AppContext.tsx`, `src/data/mockData.ts`)

- Add `leaseUnitAssignments: LeaseUnitAssignment[]` to `AppContext` with CRUD: `addLeaseUnitAssignment`, `updateLeaseUnitAssignment`, `removeLeaseUnitAssignment`, plus `setLeaseUnits(leaseId, [{unitId, assignmentType, isPrimary, rentShare, chargesShare}])` used by the form.
- Migration on load: for every existing lease, if no assignments exist yet, seed one row from `lease.unitId` with `assignmentType: 'primary'`, `isPrimary: true`, `startDate = lease.startDate`, `endDate = lease.endDate` (or null when active).
- Extend `IntegrityState` (`src/lib/integrity/types.ts`) and `use-integrity-state.ts` with `leaseUnitAssignments`.
- Seed data: edit `src/data/mockData.ts` to produce realistic scenarios — (a) apt only, (b) apt + parking, (c) apt + cellar + storage, (d) office + 2 parking.

## 3. Integrity & validation (`src/lib/integrity/`)

New module `leaseUnitAssignmentIntegrity.ts` with `validateLeaseUnits(leaseId, draftAssignments, state)`:

Blockers:
- 0 units, no `isPrimary`, more than one `isPrimary`.
- Units span multiple properties or property mismatch with the lease.
- Same unit listed twice in the same lease with overlapping active periods.
- Unit already covered by another active lease whose assignment window overlaps.

Warnings:
- Only ancillary types present (no clear primary rentable).
- Sum of `rentShare` / `chargesShare` does not equal contract total (when split is used).
- Selected unit is `reserved` / `unavailable`.

Refactor existing integrity helpers to read assignments instead of `lease.unitId`:
- `leaseIntegrity.ts`: overlap detection iterates `leaseUnitAssignments`.
- `unitIntegrity.ts`: `canDeleteUnit` / `canChangeUnitStatus` check active assignments, not `l.unitId`.

## 4. Occupancy logic (`src/lib/occupancy.ts`)

Change `getDerivedOccupancy` signature to accept assignments (or be wrapped by a context-aware helper). A unit is considered held by a lease when an active assignment exists for it. The derived state stays the same per-unit, but:
- Primary residential/commercial units drive `occupied` KPIs.
- Ancillary units expose a new `occupancyRole: 'primary' | 'ancillary'` field on `OccupancyInfo` so KPI cards and Dashboard can exclude ancillaries from "homes occupied" counts.

Update consumers: `Dashboard.tsx`, `Reports.tsx`, `PropertyDetail.tsx`, `UnitDetail.tsx`, `Units.tsx`, `Tenants.tsx`, `TenantDetail.tsx`, `AppContext.getActiveLease`.

`getActiveLease(unitId)` becomes "find active assignment for unit, return its lease" — preserves existing API surface.

## 5. Lease create/edit flow (`src/pages/Leases.tsx` + lease form)

- Property select unchanged (one property per lease).
- Replace single Unit select with a **Units table editor**:
  - Add-row from a "units in this property not currently assigned to another active lease" picker.
  - Per row: unit, `assignmentType` select, `isPrimary` radio (exactly one), optional `rentShare`, `chargesShare`, `startDate`, `endDate`.
  - Inline validation surfaced via `StatusTransitionAlert` driven by `validateLeaseUnits`.
- Contract totals (`monthlyRent`, `monthlyCharges`) remain top-level inputs. If internal shares are provided, show a "sum vs total" delta with a warning if they disagree.
- Submit pipeline: save lease → diff assignments → call `setLeaseUnits` to insert/update/close rows (close = set `endDate` rather than delete, preserving history).

## 6. Lease detail (`src/pages/LeaseDetail.tsx`)

Add three sections:
1. **Contract summary** — reference, property, status, tenant(s), total rent, total charges, total due (from `getLeasePricing`).
2. **Assigned units table** — unit code, label, assignmentType, primary badge, start/end, rentShare, chargesShare, history rows greyed.
3. **Financial structure** — contract totals plus optional per-unit breakdown chart/table.
4. **Effective occupancy summary** — primary unit, ancillary list, active unit count.

Edit dialogs that currently rely on `lease.unitId` (move-in/out, etc.) operate on the primary assignment.

## 7. Unit & property surfaces

- `UnitDetail.tsx`: show current lease reference, role (primary/ancillary), assignmentType, lease-level monthly due, internal share if defined.
- `Units.tsx`: add columns/indicators for current lease reference and lease role.
- `PropertyDetail.tsx`: units table indicates "independent" vs "multi-unit lease" + lease reference + role.

## 8. Receivables & payments

Receivables stay lease-level — `src/data/receivablesMockData.ts` and `src/lib/reconciliation.ts` are not restructured. Only the display layer changes: where a receivable currently shows "Unit X", show the lease reference and "primary: Unit X (+N ancillary)". No per-unit reconciliation work in this step. Payments/guarantees untouched.

## 9. Reporting

- Dashboard occupancy KPI: count units with active **primary** assignment of a residential/commercial type. Ancillary assignments shown in a secondary "Ancillary units leased" stat.
- `Reports.tsx`: split "Leased units" into "Main" vs "Ancillary".

## Technical details

- New file: `src/lib/leasePricing.ts` (totals + share validation helpers).
- New file: `src/lib/integrity/leaseUnitAssignmentIntegrity.ts` + export from `src/lib/integrity/index.ts`.
- Touch list (read/edit): `src/types/index.ts`, `src/context/AppContext.tsx`, `src/hooks/use-integrity-state.ts`, `src/lib/integrity/{types,leaseIntegrity,unitIntegrity,index}.ts`, `src/lib/occupancy.ts`, `src/data/mockData.ts`, `src/pages/{Leases,LeaseDetail,Units,UnitDetail,PropertyDetail,Dashboard,Reports,Tenants,TenantDetail,Payments,Maintenance,MaintenanceDetail,VendorDetail}.tsx`, `src/lib/integrity/costIntegrity.ts` (only if it joins via unitId through leases — verify).
- Backwards compat shim: a `getLeasePrimaryUnitId(lease, assignments)` helper used everywhere the old `lease.unitId` was read, until call sites are migrated.
- i18n: add new translation keys (assignment types, "Primary unit", "Ancillary units", warning messages) to `src/i18n/translations.ts` in both EN and FR.
- Tests: update `src/lib/occupancy.test.ts` and `src/lib/lifecycle.test.ts` for the new assignment-based occupancy lookup; add a small test file for `validateLeaseUnits`.

## Out of scope (per the prompt)

Formal amendment workflow UI, per-unit payment reconciliation, per-unit deposit, cross-property leases, AI, advanced document generation, full sub-unit check-in/out.
