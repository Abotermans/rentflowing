# Translate remaining Payments page strings to French

## Audit findings — hardcoded English in `src/pages/Payments.tsx`

**Page header & KPIs**
- "Receivables & Reconciliation" title, "Manage receivables, cash receipts, and allocations" subtitle
- "Record Cash Receipt" button
- KPI labels: "Open Receivables", "Total Overdue", "Unmatched Receipts", "Unapplied Credit"

**Filters**
- Search placeholder "Search tenant, lease, reference…"
- Select placeholders "Property", "Status", "Type"
- Options: "All Statuses", "Open", "Paid", "Partially Paid", "Overdue", "Matched", "Partially Matched", "Unmatched", "Exception", "All Types"
- Toggle buttons: "Overdue Only", "Unmatched Only"

**Tabs**
- "Receivables (n)", "Cash Receipts (n)", "Allocations (n)"

**Receivables table**: Due Date, Tenant, Lease, Property, Type, Label, Expected, Allocated, Outstanding, Status — and empty state "No receivables found" / "Adjust filters or add receivable items."

**Cash Receipts table**: Date, Payer, Tenant, Lease, Received, Unmatched, Source, Reference, Status; row button "Allocate"; empty state "No cash receipts found" / "Record a cash receipt to get started."

**Allocations table**: Date, Receipt Ref, Receivable, Type, Tenant, Amount, Method; empty state "No allocations" / "Allocations are created when cash receipts are matched to receivables."

**Add Cash Receipt dialog**: title "Record Cash Receipt"; labels "Source Type", "Payment Date", "Amount Received (CCY)", "Tenant (optional)", "Lease (optional)", "Reference", "Payer Name", "Payer IBAN", "Remittance Information", "Notes", "Auto-allocate"; placeholders "Select tenant…", "Select lease…", "Payment reference", "e.g. FR76 3000 …", "— None —"; submit "Record Cash Receipt".

**Manual Allocation dialog**: title "Manual Allocation"; "Receipt:", "Amount:", "Unmatched:"; "No open receivable items found for this tenant/lease."; "Open Receivable Items"; "Due", "Outstanding"; "Total allocating", "Remaining unmatched", "Total exceeds available unmatched amount."; buttons "Apply Manual Allocation", "Auto-Allocate".

**Label maps in `src/types/receivables.ts`** (currently hardcoded English, used by selects + tables):
- `ITEM_TYPE_LABELS` (Rent, Charges, Deposit, Guarantee, Advance Payment, Adjustment, Late Fee, Repair Recharge, Credit Note, Other)
- `SOURCE_TYPE_LABELS` (Bank Transfer, Instant Transfer, Direct Debit, Card, Cash, Cheque, Manual)
- `ALLOCATION_TYPE_LABELS` (Automatic, Manual, Rule-Based, Reallocation, Reversal, Write-Off)

## Approach

1. **Add translation keys** in `src/i18n/translations.ts` (both `en` and `fr` blocks) using the `payments.*` namespace already in use, plus new sub-namespaces:
   - `payments.itemType.*` for receivable types (rent, charges, deposit, …)
   - `payments.sourceType.*` for receipt sources
   - `payments.allocType.*` for allocation methods
   - `payments.tab.*`, `payments.filter.*`, `payments.dialog.*`, `payments.table.*`, `payments.kpi.*`

2. **Refactor the label maps** in `src/types/receivables.ts` from constant objects → helper functions `getItemTypeLabel(t, key)`, `getSourceTypeLabel(t, key)`, `getAllocationTypeLabel(t, key)`. Keep the existing `ITEM_TYPE_LABELS` exports for any other consumer, but switch Payments.tsx to the helpers.
   - **Constraint check**: never name the translator parameter `t` inside a loop — pass it through as a function arg, used inline, no shadowing.
   - Quick `rg` for other consumers of the three label maps; update them too if any exist (likely `Reports.tsx`, `LeaseDetail.tsx`, `TenantDetail.tsx`).

3. **Rewrite `src/pages/Payments.tsx`** to call `t(...)` everywhere a literal string is rendered (header, KPI labels, filter placeholders, select options, tab labels, table headers, empty states, dialog labels/placeholders/buttons, summary lines). Tenant/lease/property names, currency values, references stay as data.

4. **No changes** to logic, reconciliation, routing, or the receivables/receipts data model.

## Files touched
- `src/i18n/translations.ts` — add ~80 new key pairs (en + fr).
- `src/types/receivables.ts` — add `getItemTypeLabel`, `getSourceTypeLabel`, `getAllocationTypeLabel` helpers; keep existing constants for back-compat.
- `src/pages/Payments.tsx` — replace literals with `t(...)`.
- Any other page that renders `ITEM_TYPE_LABELS` / `SOURCE_TYPE_LABELS` / `ALLOCATION_TYPE_LABELS` directly — switch to helpers so the labels also localize.

## Out of scope
- StatusBadge translations (already in `status.*`).
- French translation of payment **reference codes** in mock data (those are identifiers, not UI copy).
- Other pages' translation gaps (Costs, Maintenance, etc.) — separate audits.
