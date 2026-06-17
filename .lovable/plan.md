
## Goal

Standardize every list table in the app (Properties, Units, Tenants, Leases, Payments, Maintenance, Vendors, Cost Entries, Cost Categories, Allocation Rules) so they all match the Properties table's formatting, typography, and column patterns.

## Reference: Properties table standard

Locked in `src/pages/Properties.tsx`:

- Container: `<Card>` wrapping `<Table>` and `<TablePagination>`.
- Header: `SortableTableHead` for sortable columns; trailing action column is a plain `<TableHead className="text-right">{t("...actions")}</TableHead>` with a translated label.
- Row: `<TableRow className="cursor-pointer" onClick={navigate to detail}>` when the entity has a detail page.
- Cell defaults: `className="text-muted-foreground"` — no extra `text-xs`/`text-sm` overrides. Inherits the Table component's base size.
- Reference / code / ID cells: `className="font-mono text-xs text-muted-foreground"`.
- Numeric cells (currency, surface, counts): `className="text-right text-muted-foreground"` (no `font-mono`, no `text-sm` override). Centered counts use `text-center text-muted-foreground`.
- Status cell: bare `<TableCell>` containing `<StatusBadge />`.
- Action cell: `<TableCell className="text-right" onClick={e => e.stopPropagation()}>` with `<div className="flex justify-end gap-1">` and `h-8 w-8` ghost icon buttons whose icons are `h-3.5 w-3.5`.
- Date cells: `text-muted-foreground` only (no `text-xs`).

## Per-page changes

### `src/pages/Vendors.tsx`
- Replace hardcoded English column titles ("Vendor Name", "Trade", "Contact", "Email", "Phone", "Status", "Actions") with `t(...)` keys (add missing keys to `src/i18n/translations.ts` if absent).
- Drop the redundant `text-sm` on `TableCell` (keep `text-muted-foreground`).

### `src/pages/Tenants.tsx`
- Keep `font-mono text-xs` for lease reference, but the "Unit" cell currently uses `font-mono text-xs` — change to plain `text-muted-foreground` unless it actually displays a unit code (verify and align with Units page where unit codes are `font-mono text-xs`).
- No other structural changes.

### `src/pages/Leases.tsx`
- Drop `text-xs` from the start/end date cells (`text-muted-foreground` only) to match Properties.
- Drop the `text-sm` override on the guarantee cell.
- Keep `font-mono text-xs` for the lease reference cell.
- Keep `font-medium text-foreground` on the total cell (Properties uses similar emphasis for the occupancy figure).

### `src/pages/Payments.tsx` (Receivables and Cash Receipts tables)
- Remove every `className="text-xs"` on `SortableTableHead` — headers must inherit default size like Properties.
- Remove `text-xs` from cells; keep `font-mono text-xs` only for lease reference / receipt reference codes.
- Numeric columns: change `text-right text-sm text-muted-foreground` to `text-right text-muted-foreground`.
- Date cells: `text-muted-foreground` only.

### `src/pages/Maintenance.tsx`
- Already mostly aligned. Verify all cells use `text-muted-foreground` without extra `text-sm`; keep `font-mono text-xs` on the unit code cell.
- "Actions" header label already translated — leave as-is.

### `src/pages/CostEntries.tsx`
- Drop `text-sm` overrides on text cells.
- Amount cell: change `text-right font-mono text-sm text-muted-foreground` to `text-right text-muted-foreground` (remove `font-mono` and `text-sm`) to match Properties' numeric style.

### `src/pages/CostCategories.tsx`
- Drop `text-sm` overrides on text cells (keep `font-mono text-xs` for the code column).

### `src/pages/AllocationRules.tsx`
- Drop `text-sm` overrides on text cells.

### `src/pages/Units.tsx`
- Already close to Properties. Drop the `text-xs` on the "Available from" date cell so it matches Properties' date formatting.

## Out of scope

- No changes to filters, KPI cards, dialogs, business logic, column sets, sorting, pagination, or row click destinations.
- No changes to `src/components/ui/table.tsx`, `SortableTableHead`, or `StatusBadge`.
- No new columns added or existing columns removed; only typography/alignment normalization plus the Vendors translation cleanup.

## Verification

- Visit each list page in the preview, confirm header row, body text, numeric alignment, action column, and status badges look identical to Properties.
- `bunx tsc --noEmit` clean after edits.
