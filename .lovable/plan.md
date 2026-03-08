

## Plan: Deposit/Guarantee Tracking & Notice Registration

### New Types (`src/types/index.ts`)

Add:
- `GuaranteeType`: `"cash-deposit" | "bank-guarantee" | "insurance-guarantee" | "corporate-guarantee"`
- `GuaranteeStatus`: `"pending" | "incomplete" | "active" | "released" | "partially-retained"`
- `Guarantee` interface: id, leaseId, type, expectedAmount, receivedAmount, status, receivedDate?, releaseDate?, retentionAmount?, notes

Extend `Lease` with:
- `noticeGiven: boolean`
- `noticeDate: string | null`
- `intendedMoveOutDate: string | null`
- `terminationReason: string | null`

Add helper: `getLeaseLifecycleStatus(lease)` returning `"active" | "under-notice" | "ending-soon" | "ended" | "terminated" | "draft"`.

### StatusBadge Update (`src/components/shared/StatusBadge.tsx`)

Add styles for: `pending` (amber), `incomplete` (warning), `released` (muted), `partially-retained` (destructive/amber), `under-notice` (warning/orange).

### Seed Data (`src/data/mockData.ts`)

Add `initialGuarantees`:
- l1 (Marie): cash-deposit, active (expected: 2700, received: 2700)
- l2 (Jan): bank-guarantee, pending (expected: 2200, received: 0) — missing guarantee scenario
- l5 (Emma): cash-deposit, active (expected: 3600, received: 3600), but lease under notice
- l4 (Sophie, ended): cash-deposit, partially-retained (retention: 500)

Update lease seed data:
- l5: `noticeGiven: true`, `noticeDate: "2026-02-15"`, `intendedMoveOutDate: "2026-04-30"`, `terminationReason: "Relocating"`
- All others: `noticeGiven: false`, null for notice fields

### Context (`src/context/AppContext.tsx`)

- Add `guarantees` state, CRUD: `addGuarantee`, `updateGuarantee`, `deleteGuarantee`
- Add helper: `getGuaranteeByLease(leaseId)`
- Expose all via context

### Lease Detail Update (`src/pages/LeaseDetail.tsx`)

Add two new cards after financial summary:

1. **Deposit / Guarantee card**: Shows type, expected, received, status badge, dates. "Add Guarantee" or "Edit Guarantee" button opening a Sheet form. Warning banner if status is `pending` or `incomplete`.

2. **Notice / Lease End card**: Shows notice status, noticeDate, intendedMoveOutDate, terminationReason. Lifecycle badge (active/under-notice/ending-soon). "Register Notice" or "Edit Notice" button opening a Sheet form. Actions to "Mark as Ended" or "Mark as Terminated".

### Leases List Update (`src/pages/Leases.tsx`)

Add columns/indicators:
- Guarantee status badge (small inline badge after reference or as a column)
- "Under Notice" indicator (warning badge)
- Filter for "Under Notice"

### Tenant Detail Update (`src/pages/TenantDetail.tsx`)

Add to current lease card:
- Guarantee summary (type, status)
- Notice status if under notice

### Unit Detail Update (`src/pages/UnitDetail.tsx`)

Add to occupancy card:
- Lease lifecycle status badge
- "Under Notice" indicator with intended move-out date → future availability

### Dashboard Update (`src/pages/Dashboard.tsx`)

Add KPI cards:
- Leases Under Notice (count)
- Pending Guarantees (count)
- Incomplete Guarantees (count)

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/types/index.ts` — add Guarantee type, extend Lease with notice fields, add lifecycle helper |
| Modify | `src/components/shared/StatusBadge.tsx` — add guarantee/notice statuses |
| Modify | `src/data/mockData.ts` — add guarantee seed data, update lease seed data with notice fields |
| Modify | `src/context/AppContext.tsx` — add guarantees state + CRUD + helper |
| Modify | `src/pages/LeaseDetail.tsx` — add guarantee card, notice card, lifecycle badges, forms |
| Modify | `src/pages/Leases.tsx` — add guarantee/notice indicators + filter |
| Modify | `src/pages/TenantDetail.tsx` — add guarantee/notice summary |
| Modify | `src/pages/UnitDetail.tsx` — add lifecycle status + under-notice indicator |
| Modify | `src/pages/Dashboard.tsx` — add guarantee/notice KPIs |

