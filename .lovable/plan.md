## Goal

On `src/pages/UnitDetail.tsx`, replace the current single-active-lease summary in the **Occupancy** section with a sortable table listing every lease that has ever been (or is currently) assigned to this unit, and add a header action button to create a new lease prefilled with this unit.

## Changes

### 1. Header action on the Occupancy section
- Add a `Plus` icon button "Create lease" inside the `CardHeader` of the Occupancy `Collapsible`, next to the chevron, with `e.stopPropagation()` on click so it doesn't toggle the collapse.
- The button is a `<Link to={`/leases?new=1&unitId=${unit.id}`}>` — this URL pattern is already used elsewhere in the file and opens the Add Lease modal with the unit preselected. No business-logic changes needed.

### 2. Remove the "occupied" pill
- Drop the `<StatusBadge status={unit.currentStatus} />` line at the top of the occupancy card body (line 538). Per the request, unit status is already shown in the page header.
- Keep the ancillary/primary role chips and the lifecycle/scheduled/return-status badges (those describe the lease, not unit occupancy), OR move them into the table's status column. Plan: drop the whole status-row wrapper and surface those signals per-lease inside the new table's Status cell.

### 3. New leases-for-this-unit table
Build the row set from existing context data already in scope:

```ts
const unitLeaseRows = leaseUnitAssignments
  .filter(a => a.unitId === unit.id)
  .map(a => {
    const lease = leases.find(l => l.id === a.leaseId);
    const tenant = lease ? tenants.find(t => t.id === lease.tenantId) : undefined;
    return { assignment: a, lease, tenant };
  })
  .filter(r => r.lease);
```

Columns (all sortable via the existing `useTableSort` + `SortableTableHead` + `sortRows` utilities used on list pages):

| Key | Header | Cell |
|---|---|---|
| `reference` | Lease | `lease.leaseReference` linking to `/leases/{id}` |
| `tenant` | Tenant | tenant full name linking to `/tenants/{id}` |
| `role` | Role | primary / ancillary chip from `assignment.role` |
| `start` | Start | `formatDate(lease.startDate, property.locale)` |
| `end` | End | `formatDate(lease.endDate, property.locale)` |
| `rent` | Monthly rent | `formatCurrency(lease.monthlyRent + lease.monthlyCharges, …)` |
| `status` | Status | `<StatusBadge status={lease.lifecycleStatus}/>` plus, when relevant, secondary badges for `lease.signatureStatus`, `moveIn/moveOut` scheduling, `noticeGiven`, `returnStatus` |

Default sort: `start` desc so the most recent lease is first. Sort comparators rely on the generic `compareValues` in `use-table-sort.ts` (handles ISO date strings, numbers, strings).

Empty state: when `unitLeaseRows.length === 0`, render the existing `t("detail.noActiveLeaseDesc")` message.

### 4. Things explicitly NOT changed
- The "Make vacant" / move-in / move-out workflows in the page header stay as-is.
- The integrity inconsistency banner (`occupancy.inconsistent` block, lines 385–420) stays as-is.
- No new translation keys other than reusing existing ones (`leases.reference`, `table.tenant`, `leases.role.primary/ancillary`, `leases.period`, `table.status`, `leases.monthlyRent`). If a "Create lease" label is needed, reuse `occupancy.createLeaseAction` which already exists.
- No changes to data model, context, or other pages.

## Files touched
- `src/pages/UnitDetail.tsx` (only)

## Verification
- `tsc --noEmit` clean.
- Manually: open a unit with multiple historical leases, confirm rows render, click each column header to verify sort toggling, click "Create lease" and confirm Add Lease modal opens with unit prefilled.
