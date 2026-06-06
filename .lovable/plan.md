## Why

The current Summary card shows a single contract-level `Signed date` (`lease.signedDate`). But each unit was signed onto the lease at a different moment:

- Units attached at lease creation were signed on `lease.signedDate`.
- Units added later by an avenant were signed on that avenant's `signedDate` (`LeaseAmendment.signedDate`).

This is the same shape as the start-date case we already fixed: the value is per-assignment, not per-lease, and showing one lease-level date hides the real story.

## Decision

Treat signature date as a per-unit fact in the Summary table, derived from the assignment's source (initial lease vs. the avenant that added the unit). Remove the lease-level `Signed date` cell from the Summary grid.

## Changes (all in `src/pages/LeaseDetail.tsx`)

1. **Add a `Signed` column to the units table**, immediately after `Start`.

2. **Resolve the signed date per assignment**:
   - If `assignment.startDate === lease.startDate` (i.e. the unit was on the lease at inception) → use `lease.signedDate`.
   - Otherwise, find the amendment that added this unit: an `amendmentChanges` row where `fieldName === "unitAssignments"`, `changeType === "add"`, and `metadata.unitId === assignment.unitId`. Resolve to that amendment and use its `signedDate`.
   - If nothing matches or the date is missing, render `—`.

3. **Update the footer row** `colSpan` from 3 to 4 to account for the new column.

4. **Remove the `signedDate` cell** at line 733 of the Summary grid (it's now in the table).

5. **No type, context, translation, or business-logic changes.** Reuse the existing `leases.signedDate` key for the column header (or add a short `leases.col.signed` key consistent with `leases.col.start` — minor i18n addition only if needed).

## Resulting table

```text
┌──────────┬─────────┬────────────┬────────────┬────────┬─────────┬────────┐
│ Unit     │ Role    │ Start      │ Signed     │ Rent   │ Charges │ Total  │
├──────────┼─────────┼────────────┼────────────┼────────┼─────────┼────────┤
│ A101 …   │ Primary │ 01/09/2024 │ 15/08/2024 │ 1 200 €│ 80 €    │ 1 280 €│
│ P12 …    │ Parking │ 01/03/2026 │ 18/02/2026 │ 80 €   │ 0 €     │ 80 €   │
├──────────┴─────────┴────────────┴────────────┼────────┼─────────┼────────┤
│ Σ                                            │ 1 280 €│ 80 €    │ 1 360 €│
└──────────────────────────────────────────────┴────────┴─────────┴────────┘
```

## Files touched
- `src/pages/LeaseDetail.tsx`
- `src/i18n/translations.ts` (only if a new `leases.col.signed` header key is added)
