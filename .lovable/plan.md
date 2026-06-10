## Goal
Make rows in the Unit Detail "Costs & Taxes" table clickable so users can jump directly to the underlying cost/tax record.

## Behavior
- **Direct rows** → navigate to `/costs/entries?edit=<costEntryId>`, which opens the existing edit dialog on the Cost Entries page (mirrors the established cross-page editing pattern used by `Units.tsx`).
- **Allocated rows** → navigate to the same `/costs/entries?edit=<parentCostEntryId>` (the source charge/tax record). The allocation is a derived breakdown of that entry, so the source record is the canonical thing to inspect/edit.
- Rows get `cursor-pointer` + `hover:bg-muted/50`. The trailing actions column (if any) keeps its own click handling via `e.stopPropagation()`.
- A small external-link icon (lucide `ArrowUpRight`) is added next to the **Label** cell to signal the row is navigable.

## Files to change
1. **`src/pages/CostEntries.tsx`** — add a `useSearchParams` effect that, on mount or param change, finds the matching `CostEntry` by `id` and calls `openEdit(entry)`, then clears the `edit` param (same pattern as `Units.tsx` lines 81–99).
2. **`src/pages/UnitDetail.tsx`** — in the unified Costs & Taxes `TableRow`, add `onClick={() => navigate(`/costs/entries?edit=${sourceEntryId}`)}`, hover/cursor classes, and the `ArrowUpRight` indicator. `sourceEntryId` = `entry.id` for direct rows, `result.costEntryId` for allocated rows.
3. **`src/i18n/translations.ts`** — add `costs.openRecord` (EN: "Open record", FR: "Ouvrir la fiche") used as `aria-label`/tooltip on the indicator icon.

## Out of scope
- No new detail route for cost entries (none exists today; reusing the edit dialog keeps scope minimal).
- No changes to allocation logic, schemas, or other pages.
- No deep-linking into the Allocations page — the source entry is the right destination.
