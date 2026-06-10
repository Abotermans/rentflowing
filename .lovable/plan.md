# Unified Costs & Taxes table on the Unit page

## Goal
On the Unit detail page, give the user a single, sortable overview of **every** charge & tax borne by the unit — both **direct** entries (booked on the unit itself) and **indirect/allocated** entries (allocated from a property-level cost via an allocation rule).

Today the "Costs & Taxes Burden" card only lists direct entries; allocated amounts are summed in KPIs but never itemized.

## What changes (UI only, on `src/pages/UnitDetail.tsx`)

Replace the current "Direct entries" sub-table with a **single unified table** that lists one row per cost item affecting the unit.

### Columns
1. **Source** — small badge: `Direct` or `Allocated` (icon + label)
2. **Label** — cost entry label
3. **Category** — category name (from `getCostCategoryById`)
4. **Nature** — Charge / Tax icon+label
5. **Recovery** — Owner only / Tenant recoverable / Partial / Informational (StatusBadge, same as today)
6. **Period** — start → end (or frequency if no period; falls back to entry's start/end)
7. **Allocation method** — for allocated rows: rule method (Equal / Surface m² / Manual %); for direct rows: `—`
8. **Allocated amount** — right-aligned, monospace
9. **Owner-borne** — right-aligned, monospace
10. **Recoverable** — right-aligned, monospace

All columns sortable via the existing `SortableTableHead` + `useTableSort` + `sortRows` pattern already used on `CostsAllocations.tsx`.

### Row construction
- **Direct rows**: from `getCostEntriesByUnit(unit.id)`. Compute owner/recoverable split using the same logic as `computeRecoverySplit` in `src/lib/costAllocation.ts` (owner-only → all owner; tenant-recoverable → all recoverable; partially-recoverable → 50/50; informational → 0/0). Allocated amount = entry.amount.
- **Allocated rows**: from `getAllocationResultsByUnit(unit.id)`. Resolve the parent `CostEntry` via `result.costEntryId` to display Label / Category / Nature / Period / Rule method. Use `result.allocatedAmount`, `result.ownerBurdenAmount`, `result.recoverableAmount` directly.

### KPI strip (kept, lightly adjusted)
Keep the existing 4 KPIs (Total burden, Direct, Allocated, Entries count) and the Owner-borne / Recoverable highlight tiles. They already aggregate both direct + allocated correctly.

### Empty state
If there are zero direct AND zero allocated entries, keep the existing behaviour (card hidden).

### Styling
Match the harmonized table style already used across the app: `text-sm text-muted-foreground` for text cells, `font-mono text-sm text-muted-foreground` for numeric cells, `SortableTableHead` for headers. Source/Nature/Recovery rendered with the existing icon + `StatusBadge` patterns from `CostEntries.tsx` so the look is identical to the Charges & Taxes page.

### i18n
Add translation keys under `costs.*` (EN/FR) for the new columns:
`source`, `sourceDirect`, `sourceAllocated`, `category`, `nature`, `period`, `allocationMethod`, `allocatedAmount` (reuse existing where present: `costs.recoverable`, `costs.ownerBorne`, `costs.totalCharges`, frequency/recovery/method labels already exist).

## Files touched
- `src/pages/UnitDetail.tsx` — replace the "Costs & Taxes Burden" sub-table block (lines ~610–674) with the unified sortable table.
- `src/i18n/translations.ts` — add the handful of missing keys above.

## Out of scope
- No schema changes, no edits to `costAllocation.ts` business logic, no changes to the Charges & Taxes pages, no export-to-CSV (can be added later if needed).
