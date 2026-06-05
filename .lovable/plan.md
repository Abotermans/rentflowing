# Amendment edit modal — rent source of truth, date layout, coverage warning

Scope: `src/components/amendments/AmendmentDialog.tsx` (+ a couple of i18n keys, + `getLeaseAmendments` already exists in `src/lib/amendments.ts`).

## 1. Unit rent/charges become the source of truth

Remove the two standalone fields **New rent** and **New charges** from the form. The lease-level `monthlyRent` / `monthlyCharges` are already recomputed from active assignment shares in `getEffectiveLeaseTerms` (see `src/lib/amendments.ts`), so they don't need a separate input.

Replace with: a read-only **Total rent / Total charges** summary line above the units table that lives-sums the editable per-unit shares (current units minus removed + added + edited).

Make every row in the units table editable for `rentShare` and `chargesShare`:
- Current units: today the table shows the assignment's existing `rentShare` / `chargesShare` as plain text. Convert them to `<Input type="number">` (matching the to-add rows' styling). Track edits in a new local map `editedShares: Record<unitId, { rentShare?: string; chargesShare?: string }>`.
- Removed-marked rows: keep inputs disabled.
- Added rows: unchanged (already editable).

`changesDraft` updates:
- Drop the `baseMonthlyRentTotal` and `baseMonthlyChargesTotal` blocks entirely.
- For each entry in `editedShares` that differs from the current assignment, emit a `unitRentShare` or `unitChargesShare` change with `metadata.unitId` and `newValue = Number`.

Activation side-effect — "modifying it on the avenant updates the unit itself":
- In `save()`, after the amendment is created/updated, if `status === "active"` walk the final per-unit shares (current edits + added rows' shares) and call `updateUnit` for each affected unit, setting `baseRent` to its new rentShare. This mirrors the rent back onto the unit so the unit page stays consistent. (Charges live on the assignment, not the unit, so we only sync rent.)

Derived-type logic in `deriveAmendmentType` already handles `unitRentShare` / `unitChargesShare`, no change needed.

## 2. Dates on one line

Wrap **Effective date**, **Signed date**, and **New end date** in a single `grid grid-cols-3 gap-3 col-span-2` row. Remove `newEndDate` from its current standalone slot lower in the form.

## 3. Coverage-gap warning

Add a soft warning (non-blocking, rendered in the existing live-validation alert area) when `effectiveDate` is strictly greater than the current coverage end:

- Coverage end = max(`lease.endDate`, latest active amendment's `effectiveDate`'s resulting `endDate`). Easiest: read `getCurrentLeaseTerms(lease.id, integrityState).endDate` — already imported pattern. Fallback to `lease.endDate`.
- If `effectiveDate > coverageEnd` and there is no `newEndDate` already extending past `effectiveDate`, push a warning entry into the alert list with key `amendments.warning.coverageGap` and a message like *"Effective date is after the current lease/amendment end date — there will be uncovered days. Extend the end date to cover the gap."*

Implementation: compute it in a local `useMemo` and render an extra `<li className="text-warning">` inside the existing `Alert` block (or render the Alert when only this warning exists). No backend / no `validateAmendment` change.

## 4. i18n

Add to `src/i18n/translations.ts`:
- `amendments.totalRent`, `amendments.totalCharges`
- `amendments.warning.coverageGap` (EN + FR)

## Out of scope

- `AmendmentsSection.tsx`, financial recompute logic, integrity layer, backend.
- Charges-on-unit modelling (charges remain on assignments).
- Hiding the rent/charges fields outside the amendment dialog.
