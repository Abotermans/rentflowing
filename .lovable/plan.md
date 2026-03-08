

## Plan: Maintenance, Vendors & Operational Reports

### New Types (`src/types/index.ts`)

Add:
- `MaintenanceCategory`: `"plumbing" | "electrical" | "heating" | "cleaning" | "damage" | "general"`
- `MaintenancePriority`: `"low" | "medium" | "high" | "urgent"`
- `MaintenanceStatus`: `"open" | "assigned" | "in-progress" | "completed" | "cancelled"`
- `MaintenanceTicket` interface with all specified fields
- `VendorStatus`: `"active" | "inactive"`
- `Vendor` interface with all specified fields
- Label maps for categories, priorities

### State (`src/context/AppContext.tsx`)

Add `tickets` and `vendors` state arrays with CRUD operations:
- `addTicket`, `updateTicket`, `deleteTicket`
- `addVendor`, `updateVendor`, `deleteVendor`
- Helpers: `getTicketsByUnit`, `getTicketsByVendor`, `getTicketsByProperty`

### Seed Data (`src/data/mockData.ts`)

Add ~4 vendors (plumber, electrician, cleaner, general handyman) and ~6 tickets across properties/units with varied statuses and priorities.

### Navigation (`src/components/layout/AppSidebar.tsx`)

Add 3 new items to sidebar: Maintenance (Wrench), Vendors (HardHat), Reports (BarChart3).

### Routes (`src/App.tsx`)

Add routes:
- `/maintenance` → list, `/maintenance/:id` → detail
- `/vendors` → list, `/vendors/:id` → detail
- `/reports` → reports page

### New Pages

| Page | File | Description |
|------|------|-------------|
| Maintenance list | `src/pages/Maintenance.tsx` | Filterable table (status, category, priority, property, vendor) |
| Maintenance detail | `src/pages/MaintenanceDetail.tsx` | Header, context card, details, assignment panel, notes, timeline |
| Vendor list | `src/pages/Vendors.tsx` | Table with name, trade, contact, status |
| Vendor detail | `src/pages/VendorDetail.tsx` | Contact info, linked tickets, open/completed counts |
| Reports | `src/pages/Reports.tsx` | 4 summary cards + 4 tables (overdue tenants, leases ending, open tickets, vacant units) |

### Ticket & Vendor Forms

Sheet-based forms matching existing patterns (like guarantee/notice forms in LeaseDetail):
- **Ticket form**: title, description, property→unit cascade, tenant, category, priority, status, scheduledDate, vendor, notes
- **Vendor form**: name, trade, contact, email, phone, address, notes, status

### Existing Page Updates

- **`UnitDetail.tsx`**: Add maintenance section showing open tickets + history table
- **`Dashboard.tsx`**: Add 3 KPI cards: open tickets, urgent tickets, completed this month

### StatusBadge (`src/components/shared/StatusBadge.tsx`)

Add styles for: `assigned` (blue), `in-progress` (amber), `completed` (green), `cancelled` (muted), `low`/`medium`/`high`/`urgent` priorities.

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/types/index.ts` |
| Modify | `src/data/mockData.ts` |
| Modify | `src/context/AppContext.tsx` |
| Modify | `src/App.tsx` |
| Modify | `src/components/layout/AppSidebar.tsx` |
| Modify | `src/components/shared/StatusBadge.tsx` |
| Modify | `src/pages/Dashboard.tsx` |
| Modify | `src/pages/UnitDetail.tsx` |
| Create | `src/pages/Maintenance.tsx` |
| Create | `src/pages/MaintenanceDetail.tsx` |
| Create | `src/pages/Vendors.tsx` |
| Create | `src/pages/VendorDetail.tsx` |
| Create | `src/pages/Reports.tsx` |

