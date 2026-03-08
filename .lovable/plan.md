

## Plan: UX Coherence & Polish Pass

### Issues Identified

After reviewing all pages, here are the inconsistencies to fix:

**Filter Bars**
- Payments: Search input uses `w-64` with no Search icon; doesn't match the standard pattern (flex-1 + Search icon + `pl-9 h-9`)
- Vendors: Search bar is standalone `max-w-sm` div, missing the `flex flex-wrap gap-3` container; missing status filter dropdown

**Action Button Sizes**
- Properties page uses `h-8 w-8` for action icons; all other list pages use `h-7 w-7`. Standardize to `h-8 w-8` everywhere for better touch targets.

**Empty/No-Results States**
- No-filter-results states are plain text in Card. Upgrade to use `EmptyState` component with a Search icon for consistency: "No results found" + "Try adjusting your filters."

**Reports Tables**
- Tables in Reports are not wrapped in `<Card>` like every other list page. Wrap each report table in Card for visual consistency.

**Dashboard KPIs**
- 17 KPI cards in a `grid-cols-7` grid creates very narrow cards on mid-size screens. Group into logical rows: Portfolio (4), Financial (4), Operations (4), Maintenance (3) using `grid-cols-2 md:grid-cols-4` sections with section labels.

**Payments Page**
- Missing Search icon in search input (every other page has it)
- Overdue Only button missing `h-9` class

**NotFound Page**
- Uses raw `<a href="/">` instead of `<Link to="/">`; doesn't integrate with app layout style

**Detail Page Headers**
- VendorDetail has an icon in the title; no other detail page does. Remove it for consistency.
- All detail pages: standardize the header area layout

**Vendors Page**
- Add status filter dropdown to match other list pages

### Changes by File

| File | Changes |
|------|---------|
| `src/pages/Payments.tsx` | Fix search input (add Search icon, use standard flex-1 pattern, h-9 on button) |
| `src/pages/Vendors.tsx` | Add status filter, wrap search in standard filter bar container |
| `src/pages/Properties.tsx` | Change action buttons from h-8 to h-8 (already correct) |
| `src/pages/Reports.tsx` | Wrap each report's Table in Card, add empty state for zero results |
| `src/pages/Dashboard.tsx` | Reorganize KPIs into grouped sections with labels |
| `src/pages/VendorDetail.tsx` | Remove HardHat icon from title for consistency |
| `src/pages/NotFound.tsx` | Use Link component, improve styling |
| `src/components/shared/EmptyState.tsx` | No changes needed (already good) |
| All list pages | Upgrade no-filter-results to use EmptyState with Search icon |

### Scope

- No new business logic or modules
- Only visual/layout/consistency improvements
- ~10 files modified, 0 new files

