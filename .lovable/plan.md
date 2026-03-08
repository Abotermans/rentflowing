

## Plan: Tenants & Leases Module

### New Types (`src/types/index.ts`)

Add `Tenant` and `Lease` interfaces plus status types:
- **Tenant**: id, firstName, lastName, email, phone, dateOfBirth?, identificationNumber?, currentAddress?, status (active|former|applicant), notes, createdAt, updatedAt. Computed `fullName` via getter/helper.
- **Lease**: id, leaseReference, propertyId, unitId, primaryTenantId, coTenantIds, leaseStatus (draft|active|ended|terminated), startDate, endDate, monthlyRent, monthlyCharges, dueDayOfMonth, depositOrGuaranteeAmount, noticePeriodText, signedDate?, notes, createdAt, updatedAt.
- Add status types: `TenantStatus`, `LeaseStatus`

### StatusBadge Update (`src/components/shared/StatusBadge.tsx`)

Add styles for: `draft` (gray/neutral), `active` (green — alias existing), `ended` (muted), `terminated` (red/destructive), `former` (muted), `applicant` (blue).

### Mock Data (`src/data/mockData.ts`)

- 5-6 tenants with European names (e.g., "Marie Dupont", "Jan De Vries", "Fatima El Amrani")
- 4 leases: 2 active (linking to occupied units u1, u6), 1 draft (linking to reserved unit u7), 1 ended
- Update corresponding unit statuses to match lease logic

### Context (`src/context/AppContext.tsx`)

- Add `tenants` and `leases` state arrays
- Add CRUD: `addTenant`, `updateTenant`, `deleteTenant`, `addLease`, `updateLease`, `deleteLease`
- Add helpers: `getActiveLease(unitId)`, `getTenantById(id)`, `getLeasesByTenant(tenantId)`, `getLeasesByProperty(propertyId)`
- Expose all via context

### Navigation & Routes

**`src/components/layout/AppSidebar.tsx`** — Add "Tenants" (Users icon) and "Leases" (FileText icon) nav items.

**`src/App.tsx`** — Add routes: `/tenants`, `/tenants/:id`, `/leases`, `/leases/:id`.

### Tenants List Page (`src/pages/Tenants.tsx`)

Table: name, email, phone, status, current unit (derived from active lease), current lease ref, actions. Search by name/email. Filter by status. Create/edit tenant via Sheet form. Delete with confirmation.

### Tenant Detail Page (`src/pages/TenantDetail.tsx`)

Sections: header with status badge, contact info card, current lease summary (if active lease exists — reference, unit, property, rent, period), current unit summary, lease history table (all leases for this tenant), notes, timestamps.

### Leases List Page (`src/pages/Leases.tsx`)

Table: leaseReference, tenant name, property, unit, status, startDate, endDate, monthlyRent, monthlyCharges, total monthly (rent+charges), actions. Search by reference/tenant/property. Filters: status, property, "ending soon" (within 90 days). Create/edit via Sheet. Lease form must prevent selecting a unit that already has another active lease.

### Lease Detail Page (`src/pages/LeaseDetail.tsx`)

Sections: header (reference, status badge, tenant link, unit link, property link), lease summary card (dates, dueDayOfMonth, rent, charges, total, deposit, notice period), tenant & unit card, notes, timestamps.

### Unit Detail Update (`src/pages/UnitDetail.tsx`)

Replace the occupancy placeholder with real data: if unit has an active lease, show current tenant (linked), lease reference (linked), lease period, monthly rent, monthly charges, total monthly due. Otherwise show "No active lease".

### Property Detail Update (`src/pages/PropertyDetail.tsx`)

Add "Tenant" and "Lease" columns to the units table showing current tenant name and active lease reference for occupied units.

### Dashboard Update (`src/pages/Dashboard.tsx`)

Add KPI cards: "Active Leases", "Leases Ending Soon" (within 90 days). Add a "Recent Leases" or "Active Leases" summary table.

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/types/index.ts` — add Tenant, Lease types |
| Modify | `src/components/shared/StatusBadge.tsx` — add lease/tenant statuses |
| Modify | `src/data/mockData.ts` — add tenant/lease seed data |
| Rewrite | `src/context/AppContext.tsx` — add tenant/lease state + CRUD + helpers |
| Modify | `src/App.tsx` — add 4 routes |
| Modify | `src/components/layout/AppSidebar.tsx` — add 2 nav items |
| Create | `src/pages/Tenants.tsx` — tenants list with CRUD |
| Create | `src/pages/TenantDetail.tsx` — tenant detail |
| Rewrite | `src/pages/Leases.tsx` — leases list with CRUD |
| Create | `src/pages/LeaseDetail.tsx` — lease detail |
| Modify | `src/pages/UnitDetail.tsx` — show active tenant/lease |
| Modify | `src/pages/PropertyDetail.tsx` — add tenant/lease columns to units table |
| Modify | `src/pages/Dashboard.tsx` — add lease KPIs |

