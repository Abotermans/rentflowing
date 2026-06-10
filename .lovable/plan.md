## Goal

Let the owner decide, per lease, how tenant charges are billed and reconciled — flat-rate (no adjustment) or provision with on-demand reconciliation against actual recoverable costs allocated to the unit, pro-rated by lease coverage of each cost period.

## Model

Add a single field on `Lease`:

- `chargesBillingMode: "flat-rate" | "provision-reconciled"` (default `"provision-reconciled"`).

No change to how `monthlyCharges` generates the charges receivable stream — both modes keep the same monthly/cycle provisions. The mode only changes what happens at reconciliation time.

### Flat-rate

- Charges paid are final. No reconciliation action exposed.
- Recoverable cost allocations still display on the unit's Costs & Taxes burden table (owner analytics), but are **never** pushed to the tenant ledger.
- UI: reconciliation panel hidden; small badge "Flat-rate charges" on the lease header.

### Provision + reconciliation (on-demand)

- Operator opens a **Reconcile charges** dialog on the Lease Detail page and picks any `[periodStart, periodEnd]` window (defaults: lease start → today, or last reconciliation end → today).
- The engine computes:
  1. **Provisions collected** = sum of `charges` `ReceivableItem.allocatedAmount` whose `dueDate` falls inside the window, for this lease.
  2. **Actual recoverable** = sum across `CostAllocationResult` rows for the lease's unit, where `recoveryType` is `tenant-recoverable` (full) or `partially-recoverable` (recoverable share), **pro-rated** by the overlap between the cost's `[periodStart, periodEnd]` and the reconciliation window divided by the cost's full period length in days. Example: yearly insurance 1 Jan → 31 Dec 2026, lease ends 1 Sep 2026, window ends 1 Sep → factor = 244/365.
  3. **Delta** = provisions − actual. Positive = tenant overpaid (surplus). Negative = tenant owes more.
- Operator confirms and picks the resolution:
  - **Tenant owes** → emit one `ReceivableItem` of type `charges-adjustment`, priority right after current charges, due today, labelled with the window.
  - **Tenant overpaid** → operator picks per reconciliation:
    - **Refund** → negative `ReceivableItem` (credit note) of type `charges-adjustment`.
    - **Carry-forward** → auto-allocate the surplus against the next open `charges` receivables (oldest first), via the existing `autoAllocate` plumbing.
- Each reconciliation is persisted (`ChargesReconciliation` record) so future windows can default to "last end + 1 day" and the lease shows a history table. Reconciliations are repeatable — the engine excludes provisions and recoverable amounts already settled by a previous reconciliation in the same window to prevent double-counting.

## Files to change

### Types & schema
1. `src/types/index.ts` — add `chargesBillingMode` to `Lease`, default `"provision-reconciled"`.
2. `src/types/receivables.ts` — add `"charges-adjustment"` to the receivable item type union; set its priority just above adjustments/fees.
3. New `src/types/chargesReconciliation.ts` — `ChargesReconciliation { id, leaseId, periodStart, periodEnd, provisionsCollected, actualRecoverable, delta, resolution: "owe"|"refund"|"carry-forward", receivableItemId?, notes, createdAt }`.
4. Supabase migration: new `lease.charges_billing_mode` column; new `charges_reconciliations` table with the standard 4-step GRANT + RLS + policies tied to portfolio membership (mirrors `cost_entries`).

### Engine
5. New `src/lib/chargesReconciliation.ts` — pure functions:
   - `proRateCostToWindow(cost, window)` → recoverable amount for the overlap.
   - `computeReconciliation(lease, window, receivables, costAllocations, costEntries, priorReconciliations)` → `{ provisionsCollected, actualRecoverable, delta, lines[] }` with per-cost breakdown for the dialog.
   - `applyReconciliation(...)` → returns the new `ReceivableItem` (and optional `ReceiptAllocation` set for carry-forward) without mutating state.
6. `src/lib/leaseReceivables.ts` — unchanged for flat-rate (provisions still generated identically). Comment-only update.

### UI
7. `src/components/leases/LeaseDialog.tsx` (or wherever the lease form lives) — add a `chargesBillingMode` select with the two options, helper text explaining the difference.
8. `src/pages/LeaseDetail.tsx`:
   - Header badge showing the mode.
   - New "Charges reconciliation" section (provision mode only): list of prior reconciliations + **Reconcile charges** button opening a centered Dialog (per B2B UI memory) with:
     - Period start/end pickers (defaults as above).
     - Read-only breakdown table: provisions collected, per-cost recoverable lines with pro-rata factor, totals, delta.
     - Resolution radio (auto-selected based on sign): owe / refund / carry-forward.
     - Optional notes (10 char min when overriding the suggested resolution — reuses Override pattern).
     - Confirm button writes the `ChargesReconciliation` + receivable via `AppContext`.
9. `src/pages/UnitDetail.tsx` — costs & taxes burden table gets a small "Reconciled" indicator on rows already settled by a reconciliation for the current lease (read-only signal, no behaviour change).
10. `src/i18n/translations.ts` — keys for mode labels, dialog copy, badges, resolutions, errors.

### Context
11. `src/context/AppContext.tsx` — CRUD for `chargesReconciliations`, action `reconcileCharges(leaseId, window, resolution, notes)` orchestrating engine + receivable creation + optional auto-allocation.

## Out of scope

- No change to how monthly provisions are generated, no per-cycle automatic reconciliation, no scheduled jobs.
- No change to flat-rate behaviour beyond the new mode flag (recoverable allocations remain owner-side analytics).
- No deep-link from the reconciliation line to the cost record (already covered by existing burden table navigation).
- No partial-recovery percentage UI (still uses the existing 50/50 placeholder in `computeRecoverySplit`).
