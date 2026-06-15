## Goal

On the lease detail page, drop the standalone **Financial Summary** card and embed a richer KPI strip directly inside the **Receivables** section (renamed from "Open Receivables"). Make the receivables table sortable, scrollable, and self-totaling so it scales as the ledger grows.

## Scope

Single file: `src/pages/LeaseDetail.tsx` (+ a few new i18n keys in `src/i18n/translations.ts`). Pure UI/derived-data change — no business-logic, repo, or schema edits.

## Changes

### 1. Remove the Financial Summary card
- Delete the `{/* Financial Summary */}` block (lines ~1242–1274) and the unused `finSumOpen` state (line 104).
- Keep `totalAllocated`, `outstanding`, `overdue`, `unappliedCredit` — they move into the receivables KPI strip.

### 2. Rename and enrich the Receivables section
- Rename heading: `leaseDetail.openReceivables` → new key `leaseDetail.receivables` ("Receivables" / "Quittancement").
- Default `receivablesOpen` to `true` (was `false`) since it's now the primary financial section.
- Inside `CardContent`, add a KPI strip ABOVE the table (same `grid-cols-2 md:grid-cols-4 gap-4` styling as the old Financial Summary so the visual language carries over):

  | KPI | Source |
  |---|---|
  | Rent collected | sum of `allocatedAmount` where `itemType === "rent"` |
  | Charges collected | sum of `allocatedAmount` where `itemType === "charges"` (incl. `"charges-adjustment"`) |
  | Outstanding (rent + charges) | sum of `outstandingAmount` across all receivables = existing `outstanding` |
  | Overdue | existing `overdue`, red + warning icon when > 0 |
  | Unapplied credit | only rendered when `unappliedCredit > 0`, same styling as today |

  Use a thin `border-b pb-4 mb-4` separator between the KPI strip and the table.

### 3. Sortable table
- Use existing `useTableSort` + `SortableTableHead` + `sortRows` (see `src/hooks/use-table-sort.ts`, `src/components/shared/SortableTableHead.tsx` — same pattern already used on list pages).
- Sort keys: `period`, `type`, `dueDate`, `expected`, `allocated`, `outstanding`, `status`. Default sort: `dueDate` desc (preserves the current ordering).
- Wrap each `TableHead` of the receivables table in `SortableTableHead`. Numeric columns use `align="right"`.

### 4. Inner scroll
- Wrap the `<Table>` in `<div className="max-h-[480px] overflow-y-auto rounded-md border">…</div>` so the list scrolls independently of the page as it grows.
- Keep the header sticky: add `className="sticky top-0 bg-background z-10"` on `<TableHeader>` so columns stay visible while scrolling.

### 5. Column totals (sticky footer row)
- Add a `<TableFooter>` (already exported from `src/components/ui/table.tsx`) with a single row summing the numeric columns:
  - Expected total: Σ `expectedAmount`
  - Allocated total: Σ `allocatedAmount`
  - Outstanding total: Σ `outstandingAmount` (matches the KPI "Outstanding")
- Footer row label cell: "Total" (new key `leaseDetail.total` / "Total"). Status cell left empty.
- Style: `font-medium`, `bg-muted/40`, and `className="sticky bottom-0"` so totals stay visible while scrolling.

## i18n keys to add (EN / FR)

- `leaseDetail.receivables` — "Receivables" / "Quittancement"
- `leaseDetail.rentCollected` — "Rent collected" / "Loyers encaissés"
- `leaseDetail.chargesCollected` — "Charges collected" / "Charges encaissées"
- `leaseDetail.total` — "Total" / "Total"

Reuse existing keys for the other labels: `table.outstanding`, `table.overdue`, `leaseDetail.unappliedCredit`, `leaseDetail.period`, `table.type`, `payments.table.dueDate`, `payments.table.expected`, `payments.table.allocated`, `payments.table.outstanding`, `payments.table.status`, `leaseDetail.noReceivables`.

## Technical notes

- Derive the new KPIs from `receivables` (already available at line 242), no new context calls needed.
- Sorting is purely client-side via `useSortedRows(enrichedReceivables, sort, getValue)`.
- Status column sort uses `effectiveStatus` so overdue rows group correctly.
- No changes to `Cash Receipts`, `Allocation History`, or any other section. The same column-totals / sortable / inner-scroll treatment is NOT applied to those tables in this iteration to keep the change focused on the user's request.

## Out of scope

- No changes to receivable generation (`src/lib/leaseReceivables.ts`) or status computation.
- No changes to filters/search inside the receivables list (none exist today).
- Cash receipts and allocation history tables stay as-is.
