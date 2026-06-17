## Goal

Add a row-level action on the **Receivables** tab (Payments page) so the user can settle an open receivable in one step: open a compact modal prefilled from the receivable, confirm, and the app creates a cash receipt and allocates it to that receivable automatically.

## UX

**Row action**
- New trailing "Action" column on the receivables table.
- Button `Mark paid` (icon `CircleDollarSign`, `h-7 text-xs`) shown only when `outstandingAmount > 0` AND status is not `cancelled` / `disputed` / `written-off`. Otherwise show `—`.

**Modal — `QuickPayReceivableDialog`** (centered Dialog, `max-w-md`, per project UI convention)
- **Header**: `Mark receivable as paid`
- **Read-only context block** (muted card): receivable label, type, due date, tenant, lease ref, property/unit, currency, outstanding amount.
- **Editable fields** (minimal + payer):
  - `Amount received` — prefilled with `outstandingAmount`, editable.
  - `Payment date` — prefilled today.
  - `Source type` — Select, default `bank-transfer`.
  - `Payer name` — prefilled with primary tenant full name.
  - `Reference` — free text, optional.
- **Orphan handling**: if the receivable has no lease AND no tenant, show a required Tenant select (active tenants) and, when chosen, a Lease select filtered to that tenant. Save disabled until a tenant is picked.
- **Footer hints** (dynamic, muted text below amount):
  - amount == outstanding → `Will fully settle this receivable.`
  - amount < outstanding → `Partial payment — receivable will remain partially paid.`
  - amount > outstanding → `Surplus of {X} will be auto-allocated to other open items for this lease/tenant by priority. Any remainder stays unmatched on the receipt.`
- **Primary button**: `Confirm payment`.

## Logic

On confirm:
1. Build the cash receipt from the receivable + form:
   - `tenantId`, `leaseId`, `propertyId`, `unitId` copied from the receivable (or from manual pick for orphans).
   - `currencyCode` = receivable currency.
   - `sourceType`, `paymentDate`, `amountReceived`, `payerName`, `reference` from the form.
   - `status: "unmatched"`, `unmatchedAmount = amountReceived`, all other optional fields null.
2. Call `createCashReceipt(receipt, /* autoAllocate */ false)` to avoid the global auto-allocator picking another item first.
3. Then call `allocateCashReceipt(receiptId, [{ receivableItemId: ri.id, amount: min(amountReceived, outstandingAmount) }])` — this is the targeted, guaranteed allocation to the clicked row.
4. **Surplus handling** (`amountReceived > outstandingAmount`):
   - Compute `surplus = amountReceived - outstandingAmount`.
   - Find other open receivables matching the receipt's `leaseId` (fallback `tenantId`), sorted by existing priority rule (`priority` asc, then `dueDate` asc — same order used by the existing auto-allocator).
   - Greedily build extra allocation entries up to `surplus`, then call `allocateCashReceipt` again (or pass them together in step 3) so the engine applies them and updates `unmatchedAmount` correctly. Any leftover stays as `unmatched` on the receipt — natural behavior of the existing engine.
5. Receivable status recomputation, allocation row, and receipt status are already handled by the existing repo functions, so no new domain logic is needed beyond orchestration.

## Edge cases covered

- **Terminal-status receivables**: action hidden.
- **Zero/negative outstanding**: action hidden.
- **Credit notes** (negative-style items): hidden by the outstanding > 0 rule.
- **Mixed currency**: receipt currency forced to receivable currency, prevents cross-currency allocations.
- **Orphan receivable** (no lease/tenant): manual tenant (and optional lease) pick required before save.
- **Partial payment**: only the entered amount is allocated; receivable becomes `partially-paid` via existing `computeReceivableStatus`.
- **Overpayment**: surplus auto-allocated to same lease/tenant by priority; any unallocatable remainder stays `unmatched` on the receipt.
- **Concurrent / double-click**: button disabled while saving (local `isSaving` state).
- **i18n**: all new strings go through `t()`; no `t` shadowing in loops.

## Files

- `src/components/payments/QuickPayReceivableDialog.tsx` — **new**, the modal described above.
- `src/pages/Payments.tsx`:
  - Add `Action` header + cell to the receivables table.
  - Local state `quickPayRiId` and render `<QuickPayReceivableDialog>` once.
- `src/i18n/translations.ts` — add EN/FR keys: `payments.action.markPaid`, `payments.quickPay.title`, `payments.quickPay.context`, `payments.quickPay.amount`, `payments.quickPay.confirm`, hints (`willSettle`, `partial`, `surplus`), orphan labels.
- No DB migration, no type changes, no edits to `costAllocation`, `leaseReceivables`, or the existing `CashReceiptDialog`.

## Out of scope

- Bulk "mark several rows paid" — single-row only for now.
- Editing or reversing the resulting receipt (existing receipts tab already handles this).
- New cash-receipt source types or new allocation types.
