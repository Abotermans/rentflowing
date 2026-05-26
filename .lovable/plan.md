## Verification of Latest Implementation

I inspected the relevant files and confirmed the last approved plan is fully implemented:

- `src/types/index.ts` — `Unit.baseRentSixMonths`, `Unit.baseRentYearly`, `Lease.rentFormula` (`'monthly' | 'six-months' | 'yearly'`) are present.
- `src/data/mockData.ts` — all 18 units carry the 3 tiers (storage/parking units intentionally have `null` for 6-month/yearly), and every lease has a `rentFormula`. Lease `l6` already showcases the advance-payment flow.
- `src/pages/Leases.tsx` — Rent Formula selector auto-fills `monthlyRent` from the unit tier and configures `hasAdvancePayment`, `advancePaymentAmount`, `advanceAllocationMethod='spread-evenly'`, `advanceAppliedTo='rent'`, and `advanceAllocationDurationMonths` (6 or 12).
- `src/pages/LeaseDetail.tsx` — schedule rows display a green **Paid** badge for past/current covered months and a **Covered** badge for future covered months.
- `src/pages/Units.tsx`, `UnitDetail.tsx`, `PropertyDetail.tsx` — tier inputs/display in place.

Everything compiles and behaves as designed. Now planning the three open follow-ups.

---

## 1. End-to-end Verification in Preview

Use the browser tool to walk through the full flow on the live preview:

1. Navigate to `/leases`, open **Add Lease**.
2. Pick property `Paris`, unit `PAR-S01` (Studio 3e — has all 3 tiers), tenant, set start `2026-04-01` / end `2027-03-31`.
3. Select **Rent Formula = 1-Year Advance** → confirm monthly rent auto-fills to `750`, helper text shows `Advance: 9000 (12 months)`.
4. Save, open the new lease detail, scroll to the Advance Payment schedule and confirm 12 months show **Covered** badges with `effectiveDue = 0`.
5. Repeat with **6-Month Advance** on another draft lease to confirm the 6-tier path.
6. Capture a screenshot at the end summarising results. If any step fails, report findings; no code edits unless an actual bug surfaces.

## 2. Rent Formula Column in Leases Table

File: `src/pages/Leases.tsx`.

- Add a new `TableHead` labelled "Formula" between `leases.unit` and `leases.status` (keeps related lease setup info grouped).
- Add matching `TableCell` rendering a small `Badge`:
  - `monthly` → neutral/outline "Monthly"
  - `six-months` → secondary "6-Month"
  - `yearly` → primary "1-Year"
- Add translation keys `leases.formula`, `leases.formula.monthly`, `leases.formula.sixMonths`, `leases.formula.yearly` in `src/i18n/translations.ts` (English + any other locales present) and use them.
- No business-logic changes.

## 3. Tier-Availability Validation in Lease Form

File: `src/pages/Leases.tsx` (form sheet only).

Goal: prevent selecting a `rentFormula` that the chosen unit does not price.

- Derive `selectedUnit` from `form.unitId` in a `useMemo`.
- Compute `formulaAvailability`:
  - `monthly`: always available (requires `baseRent != null`, else disabled with reason "No base rent defined").
  - `six-months`: `selectedUnit?.baseRentSixMonths != null`.
  - `yearly`: `selectedUnit?.baseRentYearly != null`.
- In the Rent Formula `Select`:
  - Render all three `SelectItem`s but pass `disabled` when unavailable.
  - Append a muted suffix "(not defined for this unit)" on disabled items.
- When the user changes `unitId`, if the current `form.rentFormula` becomes unavailable for the new unit, auto-reset it to `'monthly'` and re-run the existing "monthly" branch logic (clear advance fields, set rent to new unit's `baseRent`). This avoids stale advance config.
- In `handleSave`, add a guard: if the selected formula's tier value is `null`, show a destructive toast ("Selected formula is not available for this unit") and abort.
- No changes to `src/lib/advancePricing.ts` or data model.

## Files Touched

- `src/pages/Leases.tsx` — table column + validation logic.
- `src/i18n/translations.ts` — new keys for the Formula column.
- (Verification step only uses the browser; no edits unless a bug is found.)
