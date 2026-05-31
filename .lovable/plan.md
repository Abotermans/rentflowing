## Goal

Tenant status should follow lease activity automatically:

- **Applicant → Active**: when a lease becomes active for that tenant (primary or co-tenant).
- **Active → Former**: when their last remaining active lease ends/terminates.

Status changes from `former` back to `active` happen automatically as well if a former tenant gets a new active lease (symmetry, avoids stuck states). Manual edits on the Tenants page still work; this logic only reacts to lease lifecycle events.

## Where the logic lives

A single helper in `src/context/AppContext.tsx`:

```ts
function reconcileTenantStatuses(tenantIds: string[], leases: Lease[], tenants: Tenant[]): Tenant[]
```

For each affected tenant id, look at all leases where they are `primaryTenantId` or in `coTenantIds`:
- If any lease has `lifecycleStage === "active"` → tenant status becomes `active` (only if currently `applicant` or `former`).
- Else if they have at least one lease and none active → status becomes `former` (only if currently `active`).
- Else (no leases at all) → leave status untouched (still an applicant / manually set).

Never touch a tenant whose target status equals current — keeps `updatedAt` stable.

## Wiring

Call `reconcileTenantStatuses` inside the three lease mutation paths in `AppContext.tsx`, right after `setLeases(...)`:

1. **`addLease`** — affected tenants = `[primaryTenantId, ...coTenantIds]` of the new lease.
2. **`updateLease`** — affected tenants = union of old lease tenants and new lease tenants (handles tenant reassignment + lifecycle change in one save).
3. **`confirmMoveOut`** — affected tenants = lease's primary + co-tenants (lease flips to `ended`).

`deleteLease` does NOT trigger the flip (deleting a lease record is an admin action, not a lifecycle event; integrity already blocks deletion of leases with history).

Implementation uses the functional `setTenants(prev => …)` form, reading the freshly-updated leases passed in as a parameter to avoid stale closures.

## Integrity interaction

`canChangeTenantStatus(..., "former")` blocks if the tenant has active leases. Our automatic `→ former` flip only runs after a lease has just been moved out of `active`, so the check naturally passes. We bypass the integrity helper for the automatic flip (system-driven, not user-driven) — same pattern as `confirmMoveOut` directly setting `lifecycleStage: "ended"`.

Warnings about open balances / unresolved guarantees are surfaced elsewhere (lease end dialogs) and are not duplicated on the silent tenant flip.

## Out of scope

- No UI changes, no toasts for the automatic flip.
- No retroactive reconciliation of existing mock data on app load.
- No changes to `Tenants.tsx` manual edit flow or `tenantIntegrity.ts`.
- Lease deletion does not trigger reconciliation.

## Files touched

- `src/context/AppContext.tsx` — add `reconcileTenantStatuses` helper; call it from `addLease`, `updateLease`, `confirmMoveOut`.
