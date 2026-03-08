

# Rental Advance Payment Feature — Implementation Plan

## Overview

Add support for advance payments on leases that reduce future monthly rent/charges. The advance is an upfront payment that gets allocated over time, reducing the effective monthly amount due. This is distinct from deposits/guarantees.

## Data Model Changes

### Extend `Lease` type in `src/types/index.ts`

Rename existing `monthlyRent` → keep as-is but treat as `baseMonthlyRent` alias. Add new fields:

```typescript
// Advance payment fields on Lease
hasAdvancePayment: boolean;
advancePaymentAmount: number | null;
advancePaymentDate: string | null;
advanceAllocationMethod: 'spread-evenly' | 'fixed-monthly-reduction' | null;
advanceAppliedTo: 'rent' | 'charges' | 'rent-and-charges' | null;
advanceAllocationStartDate: string | null;
advanceAllocationDurationMonths: number | null;
fixedMonthlyReductionAmount: number | null;
```

Add new types and a pure computation function:

```typescript
type AdvanceAllocationMethod = 'spread-evenly' | 'fixed-monthly-reduction';
type AdvanceAppliedTo = 'rent' | 'charges' | 'rent-and-charges';
type AdvanceStatus = 'not-applicable' | 'scheduled' | 'active' | 'fully-consumed';

interface AdvancePricingResult {
  pricingAdjustmentPerMonth: number;
  effectiveMonthlyRent: number;
  effectiveMonthlyCharges: number;
  effectiveMonthlyDue: number;
  advanceConsumed: number;
  advanceRemaining: number;
  advanceStatus: AdvanceStatus;
  allocationEndDate: string | null;
  monthlySchedule: AdvanceScheduleRow[];
}
```

The function `computeAdvancePricing(lease, referenceDate?)` derives all effective values from the base fields. No stored derived fields — all computed at render time.

### Extend `LedgerLineType` 

Add `'advance-payment'` to the union. This keeps advance payments visually distinct from rent, charges, and deposit in ledger/payment views.

## Files to Change (10 files)

### 1. `src/types/index.ts`
- Add advance-related fields to `Lease` interface
- Add `AdvanceAllocationMethod`, `AdvanceAppliedTo`, `AdvanceStatus` types
- Add `'advance-payment'` to `LedgerLineType`
- Add `computeAdvancePricing()` pure function
- Add `AdvancePricingResult` and `AdvanceScheduleRow` interfaces
- Add `DEFAULT_ADVANCE_FIELDS` constant for lease initialization

### 2. `src/data/mockData.ts`
- Add advance fields (all `false`/`null`) to existing 5 leases
- Add lease `l6`: spread-evenly advance (€6,000 over 12 months on rent, tenant t2, unit u5, property p2)
- Add lease `l7`: fixed-monthly-reduction (€3,600, €150/month reduction on rent-and-charges, tenant t3, unit u9, property p3)
- Modify lease `l2`: add nearly-consumed advance (€2,400 spread over 12 months, 10 months consumed)
- Add corresponding ledger lines with `advance-payment` type for upfront payments
- Add monthly ledger lines showing effective (reduced) amounts for advance leases

### 3. `src/context/AppContext.ts`
- Update `emptyForm`-style defaults in `addLease` to include advance fields
- No new context methods needed — pricing is computed at render time

### 4. `src/pages/Leases.tsx`
- Add "Eff. Monthly" column to table showing effective due (computed) instead of base total when advance is active
- Add small badge/indicator "Advance" next to lease reference when `hasAdvancePayment`
- Add advance payment section to the lease create/edit Sheet form:
  - Toggle: Enable advance payment
  - Conditional fields: amount, date, method, applied-to, start date, duration, fixed reduction
  - Live preview panel showing computed effective pricing
  - Inline validation messages
- Update `emptyForm` with advance defaults
- Update `handleSave` validation for advance fields

### 5. `src/pages/LeaseDetail.tsx`
- Add new "Pricing Structure" section between Lease Summary and Financial Summary, containing 3 cards:
  1. **Contractual Pricing** — base rent, base charges, base monthly due
  2. **Advance Payment** — amount, date, method, applied-to, duration, adjustment/month, consumed, remaining, status badge
  3. **Effective Pricing** — effective rent, effective charges, effective due, reduction period, normal pricing resume date
- Add compact monthly schedule preview table below the 3 cards (month, base due, adjustment, effective due, advance remaining)
- Only show this section when `hasAdvancePayment` is true (otherwise show a single-line "No advance payment" note)
- Update the existing Lease Summary card to clarify labels as "Base monthly rent" / "Base monthly charges"

### 6. `src/pages/UnitDetail.tsx`
- When active lease has advance pricing, show badge "Advance pricing active" near status badges
- Add a pricing summary sub-section in the Occupancy card: base rent vs effective rent, base charges vs effective charges, effective monthly due, advance remaining, adjustment end date

### 7. `src/pages/Payments.tsx`
- Handle `advance-payment` ledger line type in display (label, styling)
- Show pricing adjustment column or note on monthly lines when advance applies
- Ensure advance-payment lines are visually distinct from rent/charges/deposit

### 8. `src/pages/Dashboard.tsx`
- Add to Financial or Leases KPI section:
  - "Advance pricing active" count
  - "Advances ending soon" count (within 30 days)
- Add small table at bottom: active advance leases with tenant, unit, advance amount, monthly reduction, effective due, end date

### 9. `src/i18n/translations.ts`
- Add ~50 translation keys for advance payment labels, form fields, status badges, validation messages, dashboard labels (both EN and FR)

### 10. `src/components/shared/StatusBadge.tsx`
- Add styling for advance status values: `scheduled`, `active`, `fully-consumed`, `not-applicable`

## Computation Logic (in `computeAdvancePricing`)

```
if (!hasAdvancePayment) → return base values, status "not-applicable"

if method === "spread-evenly":
  adjustmentPerMonth = advanceAmount / durationMonths

if method === "fixed-monthly-reduction":
  adjustmentPerMonth = fixedMonthlyReductionAmount
  impliedDuration = ceil(advanceAmount / adjustmentPerMonth)

Split adjustment across rent/charges based on advanceAppliedTo:
  - "rent": reduce rent only (clamped to 0)
  - "charges": reduce charges only (clamped to 0)  
  - "rent-and-charges": reduce combined, apply to rent first then charges

Derive status based on referenceDate vs allocation period:
  - before start → "scheduled"
  - within period → "active"  
  - after end → "fully-consumed"

Generate monthly schedule rows for the allocation period.
```

## Validation Rules (lease form)

- When advance enabled: amount > 0 required
- spread-evenly: duration > 0 required
- fixed-monthly-reduction: fixedMonthlyReductionAmount > 0 required
- Warn if adjustment > base rent + charges (cannot create negative effective due)
- Show computed end date and remaining amount in real-time

## Seed Data Summary

| Lease | Tenant | Method | Amount | Duration | Status |
|-------|--------|--------|--------|----------|--------|
| l1 | Marie | none | — | — | not-applicable |
| l2 | Jan | spread-evenly | €2,400 | 12mo | active (10/12 consumed) |
| l6 | new on u5 | spread-evenly | €6,000 | 12mo | active (2/12 consumed) |
| l7 | Fatima | fixed-reduction | €3,600 | €150/mo | active |
| l3,l4,l5 | — | none | — | — | not-applicable |

