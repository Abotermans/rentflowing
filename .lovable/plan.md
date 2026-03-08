`.

Wait, should I check `src/pages/Units.tsx` and `src/pages/UnitDetail.tsx` to see where the fields would go?
Yes, in `Units.tsx` there's a sheet for creating/editing units.
Lines 60-75 in `Units.tsx`:
`baseRent: number | null;`
`baseCharges: number | null;`
I will add the inputs for 6-months and yearly base rents.

In `Leases.tsx` there's a sheet for creating/editing leases.
I will add the "Rent Formula" dropdown.

Let's write the plan.
I will structure the plan as requested:

```markdown
<lov-plan>
# Advance Pricing Structure Integration Plan

## 1. Unit Model & UI Updates
- **Data Model**: Extend the `Unit` interface to include three distinct rent pricing tiers: `baseRent` (Monthly), `baseRentSixMonths` (6-Month Advance equivalent), and `baseRentYearly` (1-Year Advance equivalent).
- **Unit Form & Detail**: Update the `Units.tsx` edit sheet and `UnitDetail.tsx` page to allow property managers to define and view these three pricing options for each unit.

## 2. Lease Form Integration (Rent Formula)
- **Rent Formula Selector**: Add a "Rent Formula" dropdown (`monthly`, `six-months`, `yearly`) to the Lease creation/editing form.
- **Auto-Computation**: 
  - Selecting a formula automatically fetches the corresponding base rent from the unit and sets it as the lease's `monthlyRent`.
  - It automatically configures the Advance Payment settings. For example, selecting "1 Year Advance" will automatically check `hasAdvancePayment`, calculate `advancePaymentAmount` as 12 × the selected monthly rent, set allocation method to `spread-evenly` over `12` months, and apply it to `rent`.

## 3. Financials: Marking Future Months as Paid
- **UI Representation**: In the `LeaseDetail` Advance Payment schedule, months fully covered by the advance payment will be explicitly badged as "Paid via Advance".
- **Receivables Architecture Alignment**: The upfront payment of the advance creates an "Advance Payment" receivable. When paid, it generates an unapplied credit. As the system generates the future monthly rent receivables, they will automatically consume this credit (due to auto-allocation priorities), resulting in those months being marked as "paid" without requiring further action from the tenant.

## Files to Modify
- `src/types/index.ts`: Update `Unit` and `Lease` interfaces.
- `src/data/mockData.ts`: Add placeholder values for the new unit pricing tiers and lease formulas.
- `src/pages/Units.tsx` & `src/pages/UnitDetail.tsx`: Add the new pricing fields.
- `src/pages/Leases.tsx`: Add the "Rent Formula" selector and dynamic computation logic.
- `src/pages/LeaseDetail.tsx`: Enhance the schedule UI to mark covered months as "Paid via Advance".
