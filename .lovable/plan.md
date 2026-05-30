# Move Charges & Taxes sub-pages into the sidebar

## Current state
- The sidebar has a single top-level entry **Charges & Taxes** (`nav.costs` → `/costs`).
- Each costs page (`/costs/categories`, `/costs/entries`, `/costs/rules`, `/costs/allocations`) renders its own in-page tab bar `CostsNav` at the top, which eats vertical space and duplicates navigation.

## Goal
Promote the 4 cost sub-routes into a collapsible **Charges & Taxes** group in the sidebar, and drop the in-page tab bar.

## Approach

### 1. Sidebar — `src/components/layout/AppSidebar.tsx`
Replace the single `nav.costs` row with a **collapsible group** that lists the 4 sub-items as sidebar children. Use shadcn `SidebarMenuSub` / `SidebarMenuSubItem` / `SidebarMenuSubButton` plus a `Collapsible` trigger so it expands/collapses.

- Parent row: icon `Coins`, label "Charges & Taxes". Clicking the chevron toggles; the parent itself is not navigable (or it routes to the first child `/costs/entries` for backwards-compat).
- Sub-items (in order, with icons + existing translation keys):
  - `costs.entries` → `/costs/entries` (FileText)
  - `costs.categories` → `/costs/categories` (Tag/Layers)
  - `costs.allocationRules` → `/costs/rules` (Settings2)
  - `costs.allocations` → `/costs/allocations` (PieChart)
- Auto-expand the group when the current route starts with `/costs`.
- Collapsed-sidebar behaviour: keep the parent icon visible; opening the parent in collapsed mode shows the sub-items in a popover (default shadcn behavior).

### 2. Remove the in-page tab bar
- Delete the `<CostsNav />` import + render from the 4 cost pages: `CostCategories.tsx`, `CostEntries.tsx`, `AllocationRules.tsx`, `CostsAllocations.tsx`.
- Delete `src/components/costs/CostsNav.tsx` (no longer used).

### 3. Routing
- Keep `App.tsx` routes unchanged. `/costs` already aliases to `CostEntries` — leave as a default landing for the group.

## Files touched
- `src/components/layout/AppSidebar.tsx` — convert Charges & Taxes to a collapsible group with 4 sub-items.
- `src/pages/CostCategories.tsx`, `CostEntries.tsx`, `AllocationRules.tsx`, `CostsAllocations.tsx` — remove `<CostsNav />` and its import.
- `src/components/costs/CostsNav.tsx` — delete.

## Out of scope
- Reordering or relabelling the cost pages themselves.
- Translations (`costs.*` keys already exist).
- Other sidebar groupings (Properties / Units / Tenants etc. stay flat).
