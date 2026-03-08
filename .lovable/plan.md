
# Detailed Implementation Plan: Advance Pricing Structure

Since the high-level plan was approved, here is the detailed technical breakdown of the changes we will implement for the Advance Pricing Structure.

## 1. Data Model Updates (`src/types/index.ts`)
- **Unit Interface**: Add `baseRentSixMonths: number | null` and `baseRentYearly: number | null` to the `Unit` interface.
- **Lease Interface**: Add `rentFormula: 'monthly' | 'six-months' | 'yearly'` to the `Lease` interface.
- **Mock Data**: Update `src/data/mockData.ts` to populate these new fields for existing units and leases.

## 2. Unit Management UI (`src/pages/Units.tsx` & `src/pages/UnitDetail.tsx`)
- **Units List/Sheet**: In the `Units.tsx` Add/Edit sheet, add two new input fields below "Base Rent (Monthly)":
  - "Base Rent (6-Month Advance)"
  - "Base Rent (1-Year Advance)"
- **Unit Detail**: In `UnitDetail.tsx`, update the Financial Information card to display all three base rent tiers if they are set.

## 3. Lease Management UI (`src/pages/Leases.tsx`)
- **Rent Formula Selector**: In the Add/Edit Lease sheet, add a `Select` component for "Rent Formula" with options for Monthly, 6-Month Advance, and 1-Year Advance.
- **Auto-computation Logic**: 
  - When "6-Month Advance" is selected: Fetch the unit's `baseRentSixMonths`, set it as the lease's `monthlyRent`, check `hasAdvancePayment`, set `advancePaymentAmount` to `6 * monthlyRent`, set `advanceAllocationDurationMonths` to `6`, and `advanceAllocationMethod` to `spread-evenly`.
  - When "1-Year Advance" is selected: Fetch the unit's `baseRentYearly`, set it as the lease's `monthlyRent`, check `hasAdvancePayment`, set `advancePaymentAmount` to `12 * monthlyRent`, set `advanceAllocationDurationMonths` to `12`, and `advanceAllocationMethod` to `spread-evenly`.
  - When "Monthly" is selected: Reset advance payment fields and set `monthlyRent` to the unit's standard `baseRent`.

## 4. Ledger & Schedule Updates (`src/pages/LeaseDetail.tsx` & `src/lib/advancePricing.ts`)
- **Advance Payment Schedule**: Modify the schedule UI in `LeaseDetail.tsx` to explicitly indicate when a month is "Paid via Advance". We will badge the rows in the Advance Payment card where `effectiveDue === 0` (or `adjustment === baseDue`) with a green "Paid" indicator.
- **Receivables Architecture**: The advance payment logic currently calculates `effectiveDue`. By ensuring the base rent and advance amount are properly linked to the formula, the existing ledger will show zero effective due for those covered months, naturally reflecting them as paid.
