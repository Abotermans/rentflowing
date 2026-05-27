# Flexible rent tiers for a unit

Today a unit stores three fixed rent fields: `baseRent` (monthly), `baseRentSixMonths`, `baseRentYearly`. The user wants a fully flexible **table of rent tiers** where each row is `{ advance period in months, monthly rent }`. Any number of rows, any duration (1, 2, 3, … 12, 18, 24, …).

## What changes on screen

**Unit detail → "Financial defaults" card** becomes a table:

| Advance period | Monthly rent | Total for the period |
|---|---|---|
| 1 month  | €1 350 | €1 350 |
| 6 months | €1 250 | €7 500 |
| 12 months | €1 150 | €13 800 |

- Always-visible columns; "Total" is computed (`monthlyRent × durationMonths`).
- Base monthly charges and currency stay shown next to the table (single read-only line below).
- The pencil button opens an edit dialog with the **same table, editable**:
  - Each row has a months input (integer ≥ 1) and a monthly-rent input.
  - "Add tier" button appends a new row.
  - Trash icon removes a row.
  - At least one row required, durations must be unique, all values > 0; rows auto-sort ascending by months on save.

## Data model

Add a new field on `Unit`:

```ts
rentTiers: { durationMonths: number; monthlyRent: number }[];
```

Drop `baseRentSixMonths` and `baseRentYearly`. Keep `baseRent` as a derived convenience (the `durationMonths === 1` tier's monthly rent) so existing list views and KPIs don't need a rewrite — populated automatically whenever `rentTiers` is saved.

Mock data migration: convert each existing unit's three legacy fields into a `rentTiers` array (only including the tiers that are non-null).

## Lease creation flow

`src/pages/Leases.tsx` currently hard-codes three `RentFormula` options. Replace the formula `Select` with a dynamic list built from the selected unit's `rentTiers`:

- Each option label: "1 month — €1 350", "6 months — €1 250", "12 months — €1 150", …
- Selecting a tier sets `monthlyRent = tier.monthlyRent` and, when `durationMonths > 1`, configures `hasAdvancePayment = true`, `advancePaymentAmount = monthlyRent × durationMonths`, `advanceAllocationMethod = 'spread-evenly'`, `advanceAllocationDurationMonths = durationMonths`. When `durationMonths === 1`, no advance.
- `RentFormula` type changes from `'monthly' | 'six-months' | 'yearly'` to `number` (the chosen duration in months) so any tier is representable. The lease's existing `rentFormula` field stores the months count.

Mock leases migration: map `'monthly' → 1`, `'six-months' → 6`, `'yearly' → 12`.

## Files touched

- `src/types/index.ts` — `Unit.rentTiers`, drop legacy tier fields, redefine `RentFormula = number`.
- `src/data/mockData.ts` — migrate units and any leases referencing the old formula strings.
- `src/pages/UnitDetail.tsx` — replace the financial-defaults grid with the read-only table; rebuild the financials edit dialog with the row editor.
- `src/pages/Units.tsx` and `src/pages/PropertyDetail.tsx` — replace the three rent inputs in the unit create/edit dialogs with the same row editor; list cells keep showing the 1-month rent via the derived `baseRent`.
- `src/pages/Leases.tsx` — dynamic tier select, updated save logic, removed hard-coded `formulaAvailability`.
- `src/i18n/translations.ts` — new keys: `units.rentTiers`, `units.advancePeriodMonths`, `units.monthlyRent`, `units.totalForPeriod`, `units.addTier`, `units.atLeastOneTier`, `units.duplicateDuration`.

## Out of scope

- `src/lib/advancePricing.ts` already operates on `lease.monthlyRent` + a duration — no change.
- No change to receivables generation, occupancy logic, or reporting.
- No backend/storage changes (mock data only).
