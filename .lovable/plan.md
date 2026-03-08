

## Plan: Payments, Ledger & Arrears Module

### New Types (`src/types/index.ts`)

Add two interfaces:

- **LedgerLine**: id, leaseId, type (`rent` | `charges` | `adjustment`), label, periodMonth (YYYY-MM), dueDate, amountDue, amountPaid, remainingBalance, status (`due` | `paid` | `partially-paid` | `overdue`)
- **Payment**: id, leaseId, tenantId, paymentDate, amount, paymentMethod (`bank-transfer` | `cash` | `card` | `direct-debit` | `other`), reference, notes

### State & Logic (`src/context/AppContext.tsx`)

- Add `ledgerLines` and `payments` state arrays (initialized from seed data)
- Add CRUD: `addPayment` (allocates to oldest open ledger lines first, updates their amountPaid/remainingBalance/status), `addLedgerLine`, `updateLedgerLine`
- Add helpers: `getLedgerByLease(leaseId)`, `getPaymentsByLease(leaseId)`, `getPaymentsByTenant(tenantId)`, `getTenantOutstanding(tenantId)`, `getLeaseOutstanding(leaseId)`
- Overdue detection: ledger lines with `due` or `partially-paid` status where dueDate < today get status `overdue`

### Seed Data (`src/data/mockData.ts`)

Generate ledger lines for active leases covering recent months (e.g., Jan-Mar 2026):
- **l1** (Marie Dupont, Paris): Fully paid — 3 months of rent+charges lines, all paid
- **l2** (Jan De Vries, Brussels): Partially paid — 2 months paid, current month partially paid
- **l5** (Emma Williams, London): Overdue — last month unpaid, current month due

Generate matching payment records with realistic dates, methods (bank-transfer, direct-debit), and references.

### StatusBadge Update (`src/components/shared/StatusBadge.tsx`)

Add styles for: `due` (blue), `paid` (green), `partially-paid` (warning/amber), `overdue` (destructive/red).

### Navigation

**`src/components/layout/AppSidebar.tsx`** — Add "Payments" nav item (CreditCard icon).

**`src/App.tsx`** — Add `/payments` route.

### Payments Page (`src/pages/Payments.tsx`)

Full rewrite with:
1. **4 KPI cards**: Total due this month, Total collected this month, Total overdue, Partially-paid count
2. **Ledger table**: tenant, leaseReference, property, unit, period, type, dueDate, amountDue, amountPaid, remainingBalance, status badge. Filters: status, property, tenant, overdue toggle
3. **Payments table**: paymentDate, tenant, leaseReference, amount, method, reference
4. **Add Payment** button opening a Sheet: select lease (auto-fills tenant), paymentDate, amount, method, reference, notes. On save, allocates to oldest open lines.

### Lease Detail Update (`src/pages/LeaseDetail.tsx`)

Add after lease summary:
1. **Financial summary card**: this month due, total paid (all time), total outstanding, overdue amount
2. **Ledger table** for this lease
3. **Payment history table** for this lease
4. **Add Payment** button (same Sheet form, lease pre-selected)

### Tenant Detail Update (`src/pages/TenantDetail.tsx`)

Add after current lease card:
- **Financial overview card**: total outstanding across all leases, total overdue
- **Recent payments table**

### Unit Detail Update (`src/pages/UnitDetail.tsx`)

Add to occupancy card (when active lease exists):
- Outstanding balance for current lease
- Next due date and amount

### Dashboard Update (`src/pages/Dashboard.tsx`)

Add KPI cards: Total expected monthly rent, Total overdue, Overdue tenants count.
Add: **Overdue tenants table** (tenant, amount overdue, lease ref, property).

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/types/index.ts` — add LedgerLine, Payment types |
| Modify | `src/data/mockData.ts` — add ledger + payment seed data |
| Modify | `src/components/shared/StatusBadge.tsx` — add payment statuses |
| Rewrite | `src/context/AppContext.tsx` — add ledger/payment state, CRUD, allocation logic |
| Modify | `src/App.tsx` — add /payments route |
| Modify | `src/components/layout/AppSidebar.tsx` — add Payments nav |
| Rewrite | `src/pages/Payments.tsx` — full payments page |
| Modify | `src/pages/LeaseDetail.tsx` — add financial cards + ledger + payments |
| Modify | `src/pages/TenantDetail.tsx` — add outstanding + payments |
| Modify | `src/pages/UnitDetail.tsx` — add balance info |
| Modify | `src/pages/Dashboard.tsx` — add overdue KPIs + table |

