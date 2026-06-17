## Goal

Prevent users from entering inconsistent dates on Units, Leases, Guarantees, Maintenance, Costs/Taxes, Amendments, Reconciliations, and Cash Receipts. Errors should be surfaced inline (toast + disabled save where appropriate), not silently swallowed.

## Approach

1. **Centralize date-ordering helpers** in a new `src/lib/dateValidation.ts` with small pure functions:
   - `isOnOrAfter(a, b)`, `validateDateOrder({ field, value, mustBeOnOrAfter, label })`
   - `validateDateRange(pairs[])` → returns `{ ok, errors: { field: message }[] }`
   - Translation-key based messages (uses existing `t()`).
2. Add i18n keys under a single `validation.dates.*` namespace (EN/FR) — e.g. `endBeforeStart`, `releasedBeforeReceived`, `completedBeforeScheduled`, `signedAfterEffective`, etc.
3. Apply per dialog/form: validate on submit, show a toast with the precise field message and prevent save. Where a `canSubmit` flag already exists, also disable the submit button. No backend/migration changes — purely client-side guard rails (DB stays the same).

## Constraints to enforce

### Leases — `LeaseAddDialog`, `LeaseEditDialog`, `LeaseDetail` inline sheets
- `endDate >= startDate` (Add + Edit) — 🔴
- `signedDate <= startDate` when provided (Edit + sign action)
- `moveInActualDate >= moveInScheduledDate`
- `moveOutScheduledDate >= moveInScheduledDate` (when both set)
- `moveOutActualDate >= moveOutScheduledDate`
- `moveOutActualDate >= moveInActualDate`
- `intendedMoveOutDate >= noticeDate`
- Key items: `returnedDate >= handedOverDate`
- Advance payment: `advanceAllocationStartDate >= advancePaymentDate`

### Guarantees (inline form in `LeaseDetail`)
- `releaseDate >= receivedDate` — 🔴

### Maintenance — `MaintenanceTicketDialog`
- `scheduledDate >= createdDate`
- `completedDate >= scheduledDate` (when both set)
- `completedDate >= createdDate`

### Costs / Taxes — `CostEntryDialog`
- `startDate` required — 🔴
- `endDate >= startDate` when provided — 🔴

### Amendments — `AmendmentDialog` (and `amendmentIntegrity`)
- `signedDate <= effectiveDate`
- When the amendment changes `leaseEndDate`: `newEndDate >= effectiveDate` (in addition to existing `>= lease.startDate` check)

### Charges Reconciliation — `ChargesReconciliationSection`
- Replace silent null-breakdown with explicit inline error message when `periodEnd < periodStart` or either is empty
- Warn (not block) if `periodStart < lease.startDate`

### Cash Receipts — `CashReceiptDialog`
- `paymentDate` required (block save if cleared)
- No future `paymentDate` (warn only, do not block — common edge case for post-dated cheques)

### Units
- `availableFrom`: no ordering constraint needed (standalone). Skip.

## Out of scope
- No database migrations; no server-side check constraints in this pass (can follow up later if desired).
- `bookingDate` / `valueDate` on receipts are not exposed in the UI — no change.
- `dateOfBirth` sanity check (≤ today) — skip, low value.

## Files to touch

- **New:** `src/lib/dateValidation.ts`
- **Update:**
  - `src/i18n/translations.ts` (EN + FR keys)
  - `src/components/leases/LeaseAddDialog.tsx`
  - `src/components/leases/LeaseEditDialog.tsx`
  - `src/pages/LeaseDetail.tsx` (guarantees, move-in/out, notice, keys sheets)
  - `src/components/maintenance/MaintenanceTicketDialog.tsx`
  - `src/components/costs/CostEntryDialog.tsx`
  - `src/components/amendments/AmendmentDialog.tsx`
  - `src/lib/integrity/amendmentIntegrity.ts` (add `signedDate <= effectiveDate` + `newEndDate >= effectiveDate` checks)
  - `src/components/leases/ChargesReconciliationSection.tsx`
  - `src/components/payments/CashReceiptDialog.tsx`

## UX pattern (consistent across all forms)
- On submit, run all relevant pair checks → if any fail, show a single toast listing the offending field(s) with their human label and the rule that was violated, and abort save.
- Where the form has a "Save" disabled state already (Amendment, Cash Receipt), also feed validation into `canSubmit`.
- Reconciliation: show inline destructive `<p class="text-destructive">` under the date inputs instead of silently disabling preview.
