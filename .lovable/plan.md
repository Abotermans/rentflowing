## Completing the thought

You're correct on both points, and they reinforce each other:

### 1. Per-unit end date — already derivable, no new field needed

A unit's end date on a lease is fully determined by the amendments that touch it:

- **Unit removed by an avenant** → its end date is that avenant's `effectiveDate − 1 day` (or the `effectiveDate` itself depending on convention). The effective date already serves as the boundary, so storing a separate `endDate` would duplicate data and risk drift.
- **Unit still on the lease** → its end date is the lease's current end date, i.e. the latest `term-extension` / `term-shortening` amendment's new `leaseEndDate`, or the original `lease.endDate` if none.

So we don't need a new field on `LeaseUnitAssignment` or in the avenant modal. We just need a resolver (mirroring the per-unit start date and per-unit signed date logic already in place) and a new `End` column in the units table.

### 2. Effective date is the contract — mandatory fields must be marked

Because the effective date now drives three derived values per unit (start date for added units, end date for removed units, and rent/charges share boundaries), it must be:

- **Required** (already enforced in `canSubmit`, but not visually marked).
- **Marked with `*`** in the modal, same as `title`.

Other fields stay optional. `signedDate` is documentary only and remains optional.

## Plan

### A. Per-unit end date in the units table (`LeaseDetail.tsx`)

1. Add an **`End`** column after the new `Signed` column, before `Σ rent`.
2. Resolver `getUnitEndDate(assignment)`:
   - Look through active amendments (chronological) for a `unitAssignments` / `remove` change matching `metadata.unitId === assignment.unitId`. If found → return that amendment's `effectiveDate` (display as the last day covered, or the effective date itself — match whichever convention `lifecycle.test.ts` already uses).
   - Otherwise → return the current effective lease end date (`getCurrentLeaseTerms(...).endDate` or `lease.endDate`).
3. Footer row `colSpan` goes from 4 → 5.
4. Remove the lease-level `endDate` cell from the Summary grid (now per-unit, mirroring what we did for `startDate` and `signedDate`).

### B. Avenant modal — mark required fields (`AmendmentDialog.tsx`)

1. Add a small red `*` next to the labels of currently-required fields:
   - `amendments.titleField`
   - `amendments.effectiveDate`
2. Keep `canSubmit` logic as-is (already requires both).
3. No change to `signedDate`, `reason`, `notes`, `newEndDate`, etc.

### C. No data-model changes

- No new field on `LeaseUnitAssignment`, `Lease`, or `LeaseAmendment`.
- No new translation keys beyond `leases.col.end` (en `"End"`, fr `"Fin"`).

### Files to touch

- `src/pages/LeaseDetail.tsx` — add `End` column + resolver, remove lease-level end-date cell, bump footer `colSpan`.
- `src/components/amendments/AmendmentDialog.tsx` — add `*` markers on Title and Effective date labels.
- `src/i18n/translations.ts` — add `leases.col.end` (en/fr).

### Open question

Should a removed unit show its end date as **the avenant's effective date** (the day the removal takes effect, i.e. last day NOT covered) or as **effective date − 1 day** (last day covered)? I'll match whichever convention the existing lifecycle logic uses; if neither is established, I'll go with the **effective date** itself for consistency with how start dates are stored (a unit added on date X "starts" on X).
