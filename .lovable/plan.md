## Problem

The amendment ("avenant") dialog forces the user to pick a single `AmendmentType` upfront (rent-change, charges-change, unit-addition, …). That type then gates which form sections are usable (`applies()` in `AmendmentDialog.tsx`). A real-world avenant often combines several changes at once (e.g. rent increase + term extension + add a unit), and the only way to express that today is to manually select "Mixed" — which most users won't think to do, and which still doesn't communicate *what* is mixed.

## Proposed change

Stop treating `amendmentType` as user input. Derive it from the changes the user actually enters in the dialog:

- 0 categories touched → keep current draft type (or default `rent-change`), no impact, save still allowed for draft.
- 1 category touched → that category (e.g. only rent edited → `rent-change`).
- 2+ categories touched → `mixed`.

Category mapping (one per group of related fields):
- `rent-change` ← `baseMonthlyRentTotal` or any `unitRentShare`
- `charges-change` ← `baseMonthlyChargesTotal` or any `unitChargesShare`
- `term-extension` / `term-shortening` ← `leaseEndDate` (compare new vs old to pick extension vs shortening)
- `deposit-change` ← `depositAmount`
- `notice-change` ← `noticePeriodText`
- `clause-change` ← `clauseSummary`
- `unit-addition` ← any `unitAssignments` add
- `unit-removal` ← any `unitAssignments` remove
- `tenant-addition` / `tenant-removal` ← `coTenantIds` add/remove

## UI changes (`src/components/amendments/AmendmentDialog.tsx`)

- Remove the "Type" `<Select>` at the top of the dialog.
- Replace it with a read-only summary line: "Detected changes: Rent change, Term extension, Unit added" (badges), plus a small helper text when 2+ → "This will be saved as a mixed amendment". Empty state → muted "No changes yet".
- Remove the `applies()` gate in `changesDraft` so every section is always editable in parallel. All sections (rent, charges, end date, deposit, notice, clauses, units, tenants) are shown unconditionally; the user simply fills the ones that apply.
- On save, compute `amendmentType` from `changesDraft` using the mapping above and pass it to `addAmendment` / `updateAmendment`. Drop the `type` state.

## Display / list (`AmendmentsSection.tsx`)

- Keep the existing "Type" column. For `mixed`, render a tooltip listing the categories actually present in `getAmendmentChanges(a.id)` (e.g. "Mixed: rent, term, units") so the row stays informative.
- Optional: show the same badge cluster in the row expansion if there's already one; otherwise skip.

## i18n (`src/i18n/translations.ts`)

- Add `amendments.detectedChanges`, `amendments.noChangesYet`, `amendments.mixedHint` (EN + FR).
- Keep existing `amendments.type.*` keys (still used for rendering badges).

## Data model

- No schema change. `AmendmentType` keeps its current union including `mixed`. Existing amendments keep their stored type; only newly saved ones are auto-derived.
- No migration of historical data.

## Out of scope

- Splitting one avenant into multiple records.
- Per-change approval workflow.
- Changing the validation rules in `validateAmendment` (they already operate on the changes list, not on the type).
