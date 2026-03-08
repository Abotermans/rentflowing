

## Receivables and Reconciliation Refactor Plan

This is a deep structural refactor of the financial model, replacing the flat Payment/LedgerLine system with a professional 3-layer receivables architecture.

---

### Part 1 — New Type Definitions (`src/types/receivables.ts`)

Create new file with three core types:

- **ReceivableItem**: Expected amounts (rent, charges, deposit, guarantee, advance-payment, adjustment, late-fee, repair-recharge, credit-note, other). Fields: id, leaseId?, tenantId?, propertyId?, unitId?, itemType, label, periodMonth?, dueDate, currencyCode, expectedAmount, allocatedAmount, outstandingAmount, status (open/partially-paid/paid/overdue/cancelled/disputed/written-off), priority, origin, notes, timestamps.

- **CashReceipt**: Actual money received. Fields: id, tenantId?, leaseId?, propertyId?, unitId?, sourceType (bank-transfer/instant-transfer/direct-debit/card/cash/cheque/manual), paymentDate, bookingDate?, valueDate?, amountReceived, currencyCode, payerName?, payerIban?, payerBic?, reference?, remittanceInformation?, endToEndReference?, status (imported/unmatched/partially-matched/matched/exception/reversed/refunded), unmatchedAmount, notes, importBatchId?, rawBankTransactionId?, timestamps.

- **ReceiptAllocation**: Explicit link between receipts and receivables. Fields: id, cashReceiptId, receivableItemId, allocatedAmount, allocationType (automatic/manual/rule-based/reallocation/reversal/write-off), allocationDate, notes, timestamps.

Also export helper functions: `computeReceivableStatus()`, `computeReceiptStatus()`, and the `ALLOCATION_PRIORITY_ORDER` constant for the auto-allocation policy.

---

### Part 2 — Auto-Allocation Engine (`src/lib/reconciliation.ts`)

Implements the default allocation policy as a pure function:

1. Oldest overdue rent
2. Oldest overdue charges
3. Current rent
4. Current charges
5. Adjustments / fees
6. Deposit / guarantee
7. Future items
8. Leftover remains as unmatchedAmount

Function signature: `autoAllocate(receipt: CashReceipt, openReceivables: ReceivableItem[]) => { allocations: Omit<ReceiptAllocation, 'id'|'timestamps'>[], updatedReceivables: ReceivableItem[], updatedReceipt: CashReceipt }`.

---

### Part 3 — Seed Data Migration (`src/data/receivablesMockData.ts`)

Convert existing `initialLedgerLines` → `initialReceivableItems`, `initialPayments` → `initialCashReceipts`, and generate explicit `initialAllocations`. Add new scenarios:

1. Marie (t1): rent-only payer, fully matched
2. Jan (t2): rent + charges combined receipts, one partial
3. Emma (t6): deposit paid separately, Feb/Mar overdue rent
4. Overpayment scenario: one receipt with €200 unapplied credit
5. Unmatched receipt: bank transfer with no tenant identified
6. Advance-payment receivable items for l6/l7
7. Adjustment receivable (repair recharge)

All EUR-denominated, Europe-first references.

---

### Part 4 — AppContext Refactor (`src/context/AppContext.tsx`)

Replace `ledgerLines`, `payments`, `addPayment` with:

**State**: `receivableItems`, `cashReceipts`, `allocations`

**New functions**:
- `createReceivableItem(...)` / `updateReceivableItem(...)` / `deleteReceivableItem(...)`
- `createCashReceipt(...)` — creates receipt, optionally auto-allocates
- `allocateCashReceipt(receiptId, allocations[])` — manual allocation
- `autoAllocateCashReceipt(receiptId)` — uses the engine from Part 2
- `getReceivableItemsByLease(leaseId)` / `getReceivableItemsByTenant(tenantId)`
- `getCashReceiptsByLease(leaseId)` / `getCashReceiptsByTenant(tenantId)`
- `getAllocationsByReceipt(receiptId)` / `getAllocationsByReceivableItem(itemId)`
- `getTenantOutstanding(tenantId)` — refactored to use receivableItems
- `getTenantUnappliedCredit(tenantId)` — sum of unmatchedAmount
- `getLeaseOutstanding(leaseId)` — refactored
- `getReceiptMatchingStatus(receiptId)`

Remove old `ledgerLines`, `payments`, `addPayment`, `getPaymentsByLease`, `getPaymentsByTenant`, `getLedgerByLease`, `getLeaseOutstanding` (replaced with new versions).

Backward-compatible: update all existing callers.

---

### Part 5 — Payments Page Refactor (`src/pages/Payments.tsx`)

Complete rewrite with 3 tabs:

**Tab 1 — Receivables**: Table with dueDate, tenant, leaseReference, property, unit, itemType, label, expectedAmount, allocatedAmount, outstandingAmount, status. Filters: property, tenant, itemType, status, overdue toggle.

**Tab 2 — Cash Receipts**: Table with paymentDate, payerName, tenant, lease, amountReceived, unmatchedAmount, sourceType, reference, status. Filters: property, tenant, sourceType, status, unmatched toggle.

**Tab 3 — Allocations**: Table with allocationDate, receipt reference, receivable label, receivable type, tenant, allocatedAmount, allocationType.

**KPIs** (top cards): Total open receivables, Total overdue, Unmatched receipts amount, Unapplied credit total.

**Add Cash Receipt Sheet**: sourceType, paymentDate, amountReceived, currencyCode, tenant (optional), lease (optional), reference, remittanceInformation, payerName, payerIban, notes. Toggle for auto-allocate. Creates explicit ReceiptAllocation records.

**Manual Allocation Sheet**: Opens from a receipt row. Shows open receivables for the tenant/lease. User splits allocation across items. Validates against unmatchedAmount and outstandingAmount. Saves ReceiptAllocation rows and updates statuses.

---

### Part 6 — LeaseDetail Financial Section Refactor (`src/pages/LeaseDetail.tsx`)

Replace simple ledger + payment tables with:

1. **Open Receivables** card — table of receivableItems for this lease with status badges
2. **Cash Receipts** card — receipts linked to this lease
3. **Allocations** card — allocation history
4. **Summary cards**: Total outstanding, unapplied credit, deposit/guarantee/advance status
5. Replace "Record Payment" with "Record Cash Receipt" sheet

---

### Part 7 — TenantDetail Financial Section Refactor (`src/pages/TenantDetail.tsx`)

Add account statement view:

1. Open receivables by type (grouped)
2. Cash receipts list
3. Allocations
4. Summary: total outstanding, unapplied credit, overdue total

---

### Part 8 — UnitDetail Update (`src/pages/UnitDetail.tsx`)

For active lease: show outstanding balance, unapplied credit, deposit/guarantee/advance receivable status summary.

---

### Part 9 — Dashboard Update (`src/pages/Dashboard.tsx`)

Replace old financial KPIs with:
- Total receivables open
- Total overdue receivables
- Total unmatched cash receipts
- Unapplied credit total
- Receipts needing review count

Replace overdue tenants table data source. Add unmatched cash receipts mini-table.

---

### Part 10 — Translation Keys (`src/i18n/translations.ts`)

Add ~80 new keys for receivables, cash receipts, allocations, statuses, and form labels in both EN and FR.

---

### Files Modified

| File | Action |
|---|---|
| `src/types/receivables.ts` | **New** — Core types |
| `src/lib/reconciliation.ts` | **New** — Auto-allocation engine |
| `src/data/receivablesMockData.ts` | **New** — Seed data |
| `src/types/index.ts` | Remove LedgerLine, Payment types (keep backward compat exports if needed) |
| `src/data/mockData.ts` | Remove initialLedgerLines, initialPayments |
| `src/context/AppContext.tsx` | Major refactor — new state, new functions, remove old |
| `src/pages/Payments.tsx` | Complete rewrite |
| `src/pages/LeaseDetail.tsx` | Refactor financial sections |
| `src/pages/TenantDetail.tsx` | Add account statement view |
| `src/pages/UnitDetail.tsx` | Update financial summary |
| `src/pages/Dashboard.tsx` | Update KPIs and tables |
| `src/i18n/translations.ts` | Add new keys |
| `src/components/shared/StatusBadge.tsx` | Add new status variants |

