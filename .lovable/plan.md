

# Advance Payment Integration — Current State & Plan

## Current State

The `computeAdvancePricing` engine in `src/lib/advancePricing.ts` is fully built but **never used anywhere in the UI**. Specifically:

1. **Lease Summary card** (line 351-353) displays raw `lease.monthlyRent`, `lease.monthlyCharges`, and `totalMonthly` — no effective pricing shown even when an advance payment is active.
2. **No Advance Payment section** exists on LeaseDetail — there's no visibility into advance status, remaining balance, consumption schedule, or allocation method.
3. **Receivable amounts** in mock data are hardcoded (e.g., l6 shows 1700 rent instead of the base 2200 minus advance). The system has no dynamic link between advance pricing computation and receivable generation.

Two mock leases have advances configured: **l6** (spread-evenly, rent-only, 6000 over 12 months = 500/mo reduction) and **l7** (fixed-monthly-reduction, rent-and-charges, 300/mo).

## Plan

### 1. Add Advance Payment Summary Card to LeaseDetail
For leases with `hasAdvancePayment === true`, render a new card between Financial Summary and Deposit/Guarantee showing:
- Advance amount, method, applied-to, status badge (scheduled/active/fully-consumed)
- Effective monthly rent, charges, and total due (from `computeAdvancePricing`)
- Advance consumed vs remaining (with a progress bar)
- Allocation period (start → end date)

### 2. Show Effective Pricing in Lease Summary Card
When advance is active, augment the existing Lease Summary pricing row:
- Show base rent/charges as before (labeled "Base Rent", "Base Charges")
- Add a row below showing "Effective Rent" and "Effective Charges" with the advance reduction applied, using `computeAdvancePricing` output
- Show the effective total in the primary highlight slot instead of the raw total

### 3. Add Advance Allocation Schedule Table
Below the advance summary card, render a collapsible table from `monthlySchedule` showing per-month: base due, adjustment amount, effective due, and remaining advance balance. Highlight the current month row.

### 4. No changes to receivables model
The receivable items stay as monthly records with their amounts as-is. The advance payment itself is already represented as its own receivable item type (`"advance-payment"`). The effective pricing display is purely a UI concern computed at render time via `computeAdvancePricing` — this is consistent with the design decision documented in memory: "Effective pricing is computed dynamically at render time based on base contractual values and advance allocation rules, rather than being stored as derived fields."

## Files Changed

| File | Change |
|------|--------|
| `src/pages/LeaseDetail.tsx` | Import `computeAdvancePricing` and `ADVANCE_*_LABELS`. Add advance payment card with status, effective pricing, progress bar, and collapsible monthly schedule. Update Lease Summary card to show effective pricing when advance is active. |

Single file change. No new components, no data model changes, no new dependencies.

