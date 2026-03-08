

## Property Management Tool — Implementation Plan

### Navigation & Layout
- Sidebar with sections: **Dashboard**, **Properties**, **Tenants**, **Leases**, **Payments**
- Responsive layout with collapsible sidebar
- Breadcrumb navigation on detail pages

### 1. Data Layer
- Create typed models: `Property`, `Unit`, `Tenant`, `Lease`, `Payment`
- Relational mock data store with realistic sample data (3 properties, ~10 units, ~8 tenants, active/expired leases, mix of paid/overdue/upcoming payments)
- React Context for global state with CRUD operations
- Consistent currency (USD) and date formatting utilities

### 2. Dashboard
- Summary cards: Total Units, Occupied, Vacant, Overdue Payments (with amounts)
- Recent payments table (last 10)
- Upcoming rent due list
- Occupancy rate by property (bar chart via Recharts)

### 3. Properties & Units
- **Properties list**: Card grid showing property name, address, unit count, occupancy rate
- **Property detail**: Info header + units table with columns: Unit #, Status (Occupied/Vacant badge), Current Tenant, Rent Amount, Lease End Date
- **Add/Edit Property** form (modal): Name, address, type
- **Add/Edit Unit** form (drawer): Unit number, bedrooms, bathrooms, rent amount, square footage

### 4. Tenants
- **Tenants list**: Searchable table — Name, Email, Phone, Unit, Property, Lease Status badge
- **Tenant detail**: Contact info card, current lease summary, payment history table
- **Add/Edit Tenant** form (modal): Name, email, phone, emergency contact

### 5. Leases
- **Leases list**: Table — Property, Unit, Tenant, Start Date, End Date, Monthly Rent, Status badge (Active/Expired/Upcoming)
- **Lease detail**: Full terms display, linked tenant & unit info, payment schedule
- **Create/Edit Lease** form (drawer): Select property → unit → tenant, dates, rent amount, deposit, terms
- Auto-derive status from dates

### 6. Payments
- **Payments list**: Filterable table — Date, Tenant, Unit, Amount, Status badge (Paid/Pending/Overdue), Method
- **Record Payment** form (modal): Select tenant/lease, amount, date, method (cash/check/transfer/card)
- Auto-calculate overdue status based on due date vs. today
- Payment summary stats at top of page (Total Collected, Pending, Overdue)

### 7. States & Polish
- Empty states with icons and CTAs for all list views
- Form validation with inline errors (zod + react-hook-form)
- Loading skeletons on data fetches
- Confirmation dialogs for destructive actions
- Toast notifications for all mutations
- Consistent status badges: green (active/paid/occupied), yellow (pending/upcoming), red (overdue/expired), gray (vacant)

