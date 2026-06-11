
## Goal

On a lease's **Charges Reconciliation** section, display a structured table of every cost allocated to the lease's units during the lease period, with amounts pro-rated by:
1. The **cost's own period** vs the **unit-assignment window** (handles costs that span partly outside the lease).
2. The **allocation share** already produced by the allocation engine (handles costs shared across units in a property).
3. **Amendment-driven unit changes** (new units added mid-lease, units removed early) — naturally handled by reading `leaseUnitAssignments` rather than only `lease.unitId`.

Today the section only shows pro-rated lines *inside the reconciliation dialog*, scoped to the primary unit. This plan adds a permanent overview table on the section itself, scoped to **all** assigned units across the **full lease period**.

## Scope

```text
┌─ Charges Reconciliation ──────────────────────────────┐
│ [Provision + reconciliation]            [Run reconc.] │
├───────────────────────────────────────────────────────┤
│ Cost overview during lease (new)                      │
│ ┌──────────┬──────┬──────────┬───────┬───────┬──────┐ │
│ │ Cost     │ Unit │ Period   │ Alloc │ Over- │ Pro- │ │
│ │          │      │          │ share │ lap   │ rated│ │
│ ├──────────┼──────┼──────────┼───────┼───────┼──────┤ │
│ │ Insur.   │ A101 │ 01/01 →  │ 240 € │ 243/  │ 160 €│ │
│ │ 2026     │      │ 31/12/26 │       │ 365   │      │ │
│ │ Insur.   │ A102*│ same     │ 120 € │ 90/365│  30 €│ │
│ │ Water Q1 │ A101 │ Jan-Mar  │  60 € │ 90/90 │  60 €│ │
│ └──────────┴──────┴──────────┴───────┴───────┴──────┘ │
│ * added via amendment on 01/10/2026                   │
│ Totals: Recoverable 250 € · Owner burden 0 €          │
├───────────────────────────────────────────────────────┤
│ Past reconciliations table (unchanged)                │
└───────────────────────────────────────────────────────┘
```

## Approach

### 1. Extend `src/lib/chargesReconciliation.ts`

Add a new pure function that walks every `leaseUnitAssignment` for the lease and intersects each assignment's [start, end] window with each cost allocation's period.

```ts
computeLeaseCostOverview(
  lease, assignments, leases-end-fallback,
  allocations, costEntries,
  windowOverride?: { start; end }
): {
  lines: Array<{
    costEntryId; costLabel; costNature; recoveryType;
    unitId; unitName;
    assignmentStart; assignmentEnd;            // window used
    costPeriodStart; costPeriodEnd;
    allocatedAmount;                            // from allocation result
    recoverableAmount; ownerBurdenAmount;
    overlapDays; totalDays; proRataFactor;
    proRatedAllocated; proRatedRecoverable; proRatedOwnerBurden;
    addedByAmendment: boolean;                  // assignment.startDate > lease.startDate
    removedByAmendment: boolean;                // assignment.endDate && < lease.endDate
  }>;
  totals: { allocated; recoverable; ownerBurden };
}
```

Window per unit = intersection of:
- The cost allocation's `periodStart/periodEnd` (fallback to `costEntry.startDate/endDate`).
- The assignment's `startDate/endDate` (open-ended end → use `lease.endDate` or `today`).
- Optional override (for the dialog reuse).

Pro-rata factor = `overlapDays / costTotalDays` applied to the **already-allocation-split** `allocatedAmount` / `recoverableAmount` / `ownerBurdenAmount`. This naturally compounds property-level sharing (allocation engine) and time-based sharing (overlap days).

### 2. Reuse for the existing dialog

Refactor the dialog's `computeReconciliation` to call `computeLeaseCostOverview` under the hood with the dialog window, then sum `proRatedRecoverable` for `actualRecoverable`. This guarantees consistency between the overview table and the reconciliation breakdown, and also fixes the current bug where the dialog only considers the primary unit.

### 3. UI: add the overview table to `ChargesReconciliationSection.tsx`

- New `CardContent` block above the history table titled **"Costs during lease"**.
- Columns: Cost, Unit, Period, Allocated, Overlap (`days/totalDays · %`), Pro-rated recoverable.
- Rows grouped by cost, then by unit; small badge on the unit when `addedByAmendment` or `removedByAmendment`.
- Footer row with totals (pro-rated allocated, recoverable, owner burden) in the lease currency.
- Empty state: "No costs allocated to this lease's units during the lease period."
- Render the table for **both** billing modes (flat-rate and provision-reconciled) — under flat-rate it serves as a read-only owner-information view; the existing flat-rate info Alert stays above it.

Use existing `useAppData()` selectors: `leaseUnitAssignments`, `costAllocationResults`, `costEntries`, `units`. No state changes.

### 4. Translations

Add EN/FR keys to `src/i18n/translations.ts`:

- `reconciliation.overview.title`
- `reconciliation.overview.empty`
- `reconciliation.overview.col.cost / unit / period / allocated / overlap / prorated`
- `reconciliation.overview.totals`
- `reconciliation.overview.addedByAmendment` / `removedByAmendment`

## Technical notes

- **No DB / schema changes**, no migration. All data already exists (`lease_unit_assignments`, `cost_allocation_results`, `cost_entries`).
- **No business logic change** to allocations or to receivables — purely a derived read view.
- **Performance**: O(assignments × allocations) per lease; lease pages typically have <20 assignments and a few hundred allocations max. Fine to compute on render with `useMemo`.
- **Currency**: assume single currency per lease (existing assumption); display in `lease.currencyCode` like the rest of the section.
- **Lease period bounds**: use `lease.startDate` and `lease.endDate ?? lease.moveOutActualDate ?? today` so an open-ended lease still shows costs up to today.
- **Ancillary units** (parking, storage) are included automatically because they have their own assignment rows.

## Out of scope

- Editing allocations or recovery type from this view.
- Drill-down to cost entry detail (can be a follow-up).
- Multi-currency aggregation.
- Persisting the overview as a snapshot (it's always live).
