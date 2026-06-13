## Goal
Add pagination controls to every list/table page so users can navigate through long lists and choose how many rows to display per page.

## Scope — pages to update
All main list pages:
- Leases
- Properties
- Units
- Tenants
- Vendors
- Payments
- Maintenance
- CostEntries
- CostCategories
- CostsAllocations
- AllocationRules

(Detail-page sub-tables — e.g. units inside a property, payments inside a lease — are out of scope for this pass.)

## UX

Footer bar shown below each table:

```
Rows per page: [25 v]      1–25 of 312      [<<] [<]  Page 1 / 13  [>] [>>]
```

- **Rows-per-page selector**: 10 / 25 / 50 / 100. Default = 25.
- **Range label**: `from–to of total` (localized via `t()`).
- **Page navigation**: first / previous / next / last buttons + current page indicator.
- Compact, `h-8` controls to match the existing B2B operational density.
- Hidden automatically when the filtered result fits in one page (≤ smallest page size) — only the rows-per-page selector is shown, no navigation needed.

## Behavior

- Pagination is applied **after** filters/search/sort, so the user always sees the filtered subset paginated.
- Changing any filter, search term, or page size **resets to page 1**.
- Page state is component-local (React `useState`). Not persisted in URL or localStorage in this pass.
- Page size preference is kept per-page in local state for the session (no global setting yet).

## Implementation

1. **New hook** `src/hooks/usePagination.ts`
   - Input: `items: T[]`, optional `defaultPageSize`.
   - Returns `{ page, pageSize, setPage, setPageSize, pageItems, total, totalPages, from, to }`.
   - Auto-resets `page` to 1 when `items.length` or `pageSize` changes in a way that puts the cursor out of range.

2. **New component** `src/components/common/TablePagination.tsx`
   - Props: `{ page, pageSize, total, totalPages, from, to, onPageChange, onPageSizeChange, pageSizeOptions? }`.
   - Uses existing shadcn `Select` for rows-per-page and shadcn `Button` (icon) for nav.
   - Fully i18n via `t()` keys: `pagination.rowsPerPage`, `pagination.rangeLabel` (`"{from}–{to} of {total}"`), `pagination.page`.

3. **i18n** — add the three keys above to `src/i18n/` (English + French).

4. **Wire into each list page**
   - In each page: feed the already-filtered/sorted array into `usePagination`.
   - Render rows from `pageItems` instead of the full array.
   - Place `<TablePagination />` directly under the table/card-list.
   - Ensure totals/summary lines that say "Showing N results" remain accurate (display `total`, not `pageItems.length`).

## Technical notes

- No backend or schema changes — pagination is purely client-side over already-fetched data, consistent with how these lists currently work.
- No changes to existing filters, columns, sorting, or row actions.
- Detail-page embedded tables can be migrated later by reusing the same hook + component.
