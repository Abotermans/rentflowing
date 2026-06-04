# Rework "Advance payment" on leases

## What's wrong today

After tracing `rentFormula`, `computeAdvancePricing`, and the receivables module:

- `rentFormula` only picks a **pricing tier** (a cheaper monthly rent when the tenant commits to 6 or 12 months). It has no effect on receivables or payments.
- Picking a formula > 1 month auto-fills `hasAdvancePayment = true` with amount = `monthlyRent × months`, then `computeAdvancePricing` treats it as a **discount spread over those months** (`effectiveMonthlyRent` becomes ~0). That's the wrong mental model — it looks like the landlord is gifting the rent, not like the tenant has prepaid it.
- Receivables (`receivableItems`) are pure mock data. Nothing reads `rentFormula` or the advance fields when producing receivables. There is no monthly receivable generator.
- There is no `CashReceipt` automatically created for the prepayment, and no auto-allocation against future months.
- The LeaseDetail "Advance" card shows a schedule with an "Allocation End", but never a clear **"Rent paid until DD/MM/YYYY"** statement, and the schedule is decoupled from real receivables/receipts the user sees on the Payments / Reconciliation pages.

In short: today the system stores the *intent* of an advance, not the *event* of the tenant paying it, and the receivables ledger doesn't reflect it.

## Target model

Treat the advance as **two distinct things**, both first-class:

1. **Pricing model** — `rentFormula` keeps selecting the monthly rent tier (unchanged). `monthlyRent` on the lease is the *effective* per-month price for the chosen formula.
2. **Prepayment event** — when the formula is > 1 month (or the user manually toggles "rent paid in advance"), the tenant has prepaid `monthlyRent × N` at lease start. This must be recorded as:
   - a **CashReceipt** dated `advancePaymentDate` (default = lease start), amount = `monthlyRent × N`, source = "advance prepayment", linked to the lease + primary tenant.
   - the **monthly rent receivables** for those N months are generated at the effective tier rent (charges remain monthly, billed normally).
   - the receipt is **auto-allocated** to those N rent receivables in chronological order, so they immediately show as **paid**.
   - any leftover (e.g. rounding, or method = `fixed-monthly-reduction`) stays as `unmatchedAmount` on the receipt.

This way the prepayment is real money in the ledger, the months it covers are visibly paid, and "rent paid until" is just a query on the last fully-allocated rent receivable.

## What to build

### 1. Lease-driven receivable generator (`src/lib/leaseReceivables.ts`)

```text
generateLeaseReceivables(lease, propertyCurrency)
  → { receivables: ReceivableItem[], prepaymentReceipt?: CashReceipt, allocations: ReceiptAllocation[] }
```

- For an active/draft lease, generate one rent receivable + one charges receivable per month between `startDate` and `endDate` (or first renewal anchor), using `lease.monthlyRent` and `lease.monthlyCharges` (already the tier price).
- If `hasAdvancePayment`:
  - Build the prepayment `CashReceipt` (date = `advancePaymentDate ?? startDate`, amount = `advancePaymentAmount`).
  - Auto-allocate against the first N months of rent (or rent+charges if `advanceAppliedTo === 'rent-and-charges'`) using the same priority logic as `autoAllocate`.
  - Leftover (if `fixed-monthly-reduction` over-prepays the last month) stays unmatched.

This function is the single source of truth. It's called:
- once when a lease is created or its financial terms change (rent, formula, dates, advance fields, amendments activated);
- by an amendment activation to generate forward-looking receivables under new terms (existing paid past receivables untouched — already a constraint in the amendment engine).

### 2. AppContext wiring (`src/context/AppContext.tsx`)

- After `addLease` / `updateLease` (when financial fields changed) / `activateAmendment`, diff existing receivables for the affected forward periods, replace only the unpaid future ones, and append the prepayment receipt + allocations if missing.
- Keep historical paid receivables and their allocations intact (never delete a paid line).
- Update `migrateLegacy…` helpers to backfill prepayment receipts for existing mock leases on first load so the demo data stays coherent.

### 3. Reframe `computeAdvancePricing` (`src/lib/advancePricing.ts`)

- Stop treating the advance as a per-month rent discount. `effectiveMonthlyRent` and `effectiveMonthlyCharges` should equal the base values (the tier already encodes the discount).
- Keep the function as a **read model**: it returns
  - `prepaidUntilDate` — last day covered by the prepayment (derived from the allocated rent receivables, not recomputed independently);
  - `monthsCovered`, `monthsRemaining`, `amountRemaining`;
  - the same monthly schedule, but each row now means "rent for this month is prepaid", not "rent is discounted this month".
- All consumers updated to the new field names. Remove the misleading "Effective Rent / Effective Total" KPIs on LeaseDetail.

### 4. LeaseDetail UI (`src/pages/LeaseDetail.tsx`)

- Rename the section to **"Rent prepayment"** (FR: "Loyer payé d'avance").
- Top line, large: **"Rent paid until DD/MM/YYYY"** + chip with months remaining.
- Secondary row: prepayment amount, payment date, linked CashReceipt (clickable → Payments page).
- Schedule table: month / rent due / status (Paid via prepayment / Current / Future) — sourced from real receivables, not from a parallel calculation.
- Remove the "Reduction / Month" and "Effective Rent" cards.

### 5. Lease form (`src/pages/Leases.tsx`)

- When the user picks a formula > 1 month, keep auto-filling the prepayment but reword the helper text: "Tenant prepays X for N months (rent paid until DD/MM/YYYY)".
- Allow the user to override the payment date, and to switch between `rent` / `rent-and-charges` for what the prepayment covers.
- Block save (integrity) if `hasAdvancePayment` and the resulting prepayment would conflict with already-paid receivables on the same months (only relevant for edits).

### 6. Integrity rules (`src/lib/integrity/leaseIntegrity.ts`)

- `LEASE_ADVANCE_AMOUNT_MISMATCH` (warning): `advancePaymentAmount` ≠ `monthlyRent × durationMonths` when method is `spread-evenly` and applied-to is `rent`.
- `LEASE_ADVANCE_OVERLAPS_PAID` (blocker): editing advance terms when one of the covered months is already allocated by another receipt.

### 7. Tests

Extend `src/lib/multiUnitLease.test.ts` and add `src/lib/leaseReceivables.test.ts`:
- 12-month formula generates 12 rent receivables, all paid by a single prepayment receipt; `prepaidUntilDate` = last day of month 12.
- 6-month formula on a 12-month lease: months 1–6 paid, months 7–12 outstanding.
- Mid-lease amendment changing rent doesn't touch already-paid months; new monthly amount applied from `effectiveDate`.
- `rent-and-charges` mode allocates against both line types in priority order.

## Out of scope

- Refunds of unused prepayment on early termination — handled separately when we wire the move-out balance flow.
- Indexation / renewal of the prepayment — covered by the amendments module already in place.
