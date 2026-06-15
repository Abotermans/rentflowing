## Goal
Rework the **Costs & Taxes** section on the Unit detail page (`src/pages/UnitDetail.tsx`) so it focuses on the table itself, scales gracefully, and matches the pattern used by the *Costs during lease* table on the Lease detail page.

## Changes (in `src/pages/UnitDetail.tsx`, section starting around line 618)

### 1. Remove the KPI strip
Delete the 4-tile grid at the top of the card (Total Burden, Direct Costs, Allocated, Entries — lines 640–645). Keep the two summary tiles below (**Owner Borne** / **Recoverable**), since they reflect the actual financial split for the unit and aren't redundant with the table totals.

### 2. Add a "Total Cost" column next to "Allocated Amount"
Currently the table has a single amount column labeled `costs.allocatedAmount` that doubles as both the direct cost amount and the allocated share. Split it into two columns matching the lease *Costs during lease* table:

- **Total Cost** — full amount of the parent cost entry
  - Direct rows: equal to `row.amount`
  - Allocated rows: `parent.amount` from the matching `costEntries` entry
- **Allocated** — the share that applies to this unit
  - Direct rows: equal to `row.amount` (full)
  - Allocated rows: `r.allocatedAmount`

Underline the **Allocated** value with a dotted underline and wrap it in a `Tooltip` showing a simple breakdown:

```text
<Cost label>
Full cost            <total>
Unit share (<unit>)  <pct>%   (allocated / total)
─────────────────────────────
Allocated            <allocated>
```

For direct rows the breakdown shows 100% share (single bearer). Reuse the same Tooltip styling as `ChargesReconciliationSection.tsx` lines 119–141 (`cursor-help underline decoration-dotted ...`, `TooltipContent side="left" className="max-w-sm p-3 text-xs space-y-2"`).

### 3. Sortable column for Total Cost
Add a new `SortableTableHead` with sort key `total` and extend the `sortRows` switch in the same file to handle it (`case "total": return totalForRow`). Keep existing sort behavior on the other columns intact.

### 4. Inner vertical scroll
Wrap the `<Table>` in a scroll container so the section scales when many entries exist:

```tsx
<div className="rounded border overflow-hidden">
  <div className="max-h-[420px] overflow-y-auto">
    <Table>...</Table>
  </div>
</div>
```

Use a sticky header (`<TableHeader className="sticky top-0 bg-background z-10">`) so column headers remain visible while scrolling, consistent with the receivables list pattern introduced earlier.

### 5. Totals row at the end of the table
Append a final `<TableRow>` (muted background, e.g. `className="bg-muted/30 border-t font-semibold"`) summing the numeric columns:
- Total Cost: sum of each row's total-cost value
- Allocated: `directTotal + allocTotal` (already computed above)
- Owner Borne: `ownerBorne` (already computed)
- Recoverable: `recoverable` (already computed)

Non-numeric cells use a single `colSpan` with the label `t("reconciliation.overview.totals")` (already translated to "Totals" / "Totaux"), matching the lease cost overview.

### 6. Translations
Add two new keys (EN + FR) in `src/i18n/translations.ts`:
- `costs.totalCost` → "Total Cost" / "Coût total"
- `costs.unitShare` → "Unit share" / "Part de l'unité"

Reuse existing keys where possible (`reconciliation.overview.totals`, `reconciliation.overview.tip.fullCost`, `costs.allocatedAmount`).

## Out of scope
- No data-model or allocation-logic changes; "Total Cost" is derived from existing `costEntries[*].amount`.
- The Owner Borne / Recoverable tiles above the table are kept.
- Other Unit detail sections are untouched.
