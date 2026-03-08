

## Plan: Reports Overhaul — Advanced Filters & Export-Ready Views

### Architecture

Replace the single `Reports.tsx` with a **tabbed report hub** using Radix Tabs. Each tab is a dedicated report with its own filter bar, KPI summary row, and data table. An "Export CSV" button on each report generates a downloadable CSV. A "Print" button triggers `window.print()` with print-friendly CSS.

### Report Tabs (6 total)

1. **Rent Roll** — All active leases with tenant, unit, property, monthly rent, charges, total, deposit status
2. **Occupancy** — Units grouped/filtered by property showing status, type, tenant (if occupied), availability
3. **Overdue** — Tenants with overdue balances, linked lease/property, overdue amount, outstanding total
4. **Lease Expiry** — Active leases ending within a configurable date range, lifecycle status
5. **Deposits & Guarantees** — All guarantees with type, expected/received amounts, status, linked lease
6. **Maintenance Backlog** — Open tickets with category, priority, vendor, age in days

### Shared Report Layout Pattern

Each tab follows an identical structure:
```text
┌─────────────────────────────────────────┐
│ Filter Bar (property, status, date range) │  ← varies per report
├─────────────────────────────────────────┤
│ KPI Cards (2-4 metrics)                 │
├─────────────────────────────────────────┤
│ [Export CSV]  [Print]        N results  │
├─────────────────────────────────────────┤
│ Data Table                              │
└─────────────────────────────────────────┘
```

### Filter Specifications

| Report | Filters |
|--------|---------|
| Rent Roll | Property |
| Occupancy | Property, Unit Status |
| Overdue | Property |
| Lease Expiry | Property, Date Range (30/60/90/180/365 days) |
| Deposits | Property, Guarantee Status |
| Maintenance | Property, Category, Priority, Status |

### Export

- **CSV Export**: A utility function `exportToCSV(filename, headers, rows)` that creates a Blob and triggers download. Each report defines its own column mapping.
- **Print**: `window.print()` with a `@media print` CSS block in `index.css` that hides sidebar, filter bars, and export buttons, keeping only KPIs and table.

### Files

| Action | File | Description |
|--------|------|-------------|
| Rewrite | `src/pages/Reports.tsx` | Tabbed report hub with 6 sub-reports, filters, KPIs, export/print |
| Create | `src/lib/exportCsv.ts` | CSV export utility |
| Modify | `src/index.css` | Add `@media print` styles |

### Key Decisions

- All 6 reports live in a single `Reports.tsx` file using Tabs — keeps routing simple and avoids 6 new route registrations
- Filter state is local `useState` per tab, reset on tab change
- Date range filter uses a Select dropdown with preset options (30d, 60d, 90d, 180d, 365d), not a calendar picker — simpler and more practical for reports
- Guarantees data comes from existing `guarantees` array in AppContext

