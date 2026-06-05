## Goal
Replace the two single-select "Add co-tenant / Remove co-tenant" dropdowns in the amendment dialog with a unified table that mirrors the units table pattern.

## UI (AmendmentDialog.tsx)

Replace the two `<div>` blocks (lines 481–502) with a bordered section containing:

- Header row: title `Co-tenants` + an `Add co-tenant` button (top-right) opening a Popover. The Popover lists tenants of the property who are not the primary tenant, not already a co-tenant, and not already queued to be added. Clicking one appends it to `tenantsToAdd`.
- Table columns: Name · Email · Phone · Status (Current / To remove / To add badge) · Action (remove/undo icon button).
- Rows:
  - Existing co-tenants from `lease.coTenantIds`. Each row has a minus button → adds to `tenantsToRemove`. If marked, row is struck through with destructive tint and the action becomes an undo (X).
  - New co-tenants from `tenantsToAdd` (success tint), each removable via X.
- Empty state when no current co-tenants and nothing queued.

Reuse the same `Table`, `Badge`, `Popover`, `Button` styling and `h-8/h-7/h-9` sizing as the units table for visual consistency.

## State changes

- Replace `addTenantId` / `removeTenantId` strings with:
  - `tenantsToAdd: string[]`
  - `tenantsToRemove: string[]`
  - `addTenantOpen: boolean` for the Popover.
- Reset both in the `else` branch of the `useEffect`, and hydrate them from `existing` changes in the `if (existing)` branch:
  - `coTenantIds` + `changeType === 'add'` → add metadata.tenantId to `tenantsToAdd`
  - `coTenantIds` + `changeType === 'remove'` → add to `tenantsToRemove`

## changesDraft

Rewrite the tenant section (lines 193–200) to emit one `coTenantIds` change per queued tenant:

```
for (const tid of tenantsToAdd) {
  push("coTenantIds", "add", lease.coTenantIds, [...lease.coTenantIds, tid], { tenantId: tid });
}
for (const tid of tenantsToRemove) {
  push("coTenantIds", "remove", lease.coTenantIds, lease.coTenantIds.filter(x => x !== tid), { tenantId: tid });
}
```

Update the dependency array accordingly.

## i18n (src/i18n/translations.ts)

Add EN + FR keys:
- `amendments.coTenants` ("Co-tenants" / "Co-locataires")
- `amendments.noCoTenants` ("No co-tenants" / "Aucun co-locataire")
- `amendments.noTenantsAvailable` ("No tenants available" / "Aucun locataire disponible")
- Reuse existing `amendments.addCoTenant`, `amendments.toRemove`, `amendments.toAdd`, `amendments.statusCurrent`, `amendments.action`.
- Add column headers: `amendments.tenantName`, `amendments.tenantEmail`, `amendments.tenantPhone`.

## Out of scope
- Backend / amendment types unchanged (still emit `coTenantIds` add/remove → derives `tenant-addition` / `tenant-removal` / `mixed` automatically).
- No changes to `AmendmentsSection.tsx` or validation logic.
