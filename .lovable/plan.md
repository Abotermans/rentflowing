# Flatten tenants & units — remove the "primary" concept

## Goal

Every tenant on a lease is equal. Every unit on a lease is equal. The only structural rules are:
- A lease must always have **at least one tenant**.
- A lease must always have **at least one unit**.
- Anyone (any tenant, any unit) can be added or removed via amendment, as long as those two minimums hold.
- One tenant on each lease is designated as the **billing tenant** purely for invoicing — freely swappable, no legal weight, must always point to a tenant that is on the lease.

Occupancy KPIs stop relying on a "primary unit" flag and instead use the `assignmentType` already stored on every assignment (`primary` / `ancillary` / `parking` / `storage`). The word "primary" stays only as one possible assignment type label (the main residential/commercial unit) — it no longer means "the one and only main".

---

## Data model changes

### `leases` table
- Drop `primary_tenant_id` (single FK).
- Drop `co_tenant_ids` (JSON array).
- Add `tenant_ids jsonb NOT NULL DEFAULT '[]'` — flat list of tenant UUIDs (size ≥ 1 enforced app-side).
- Add `billing_tenant_id uuid` — must be one of `tenant_ids` (enforced app-side and via amendment integrity).
- Drop `unit_id` (legacy single-unit FK that today mirrors the primary assignment).

### `lease_unit_assignments` table
- Drop `is_primary` column.
- Keep `assignment_type` (already present) as the sole role marker.

### Backfill migration
- `tenant_ids` ← `array(primary_tenant_id) || co_tenant_ids`.
- `billing_tenant_id` ← old `primary_tenant_id`.
- No data loss on `assignment_type` (already populated).

---

## TypeScript model

`src/types/index.ts`
- `Lease.tenantIds: string[]` (replaces `primaryTenantId` + `coTenantIds`).
- `Lease.billingTenantId: string` (replaces the billing semantics carried by `primaryTenantId`).
- Remove `Lease.unitId`.
- Remove `LeaseUnitAssignment.isPrimary`.

---

## Lease creation (`src/pages/Leases.tsx`)

- Tenant section becomes a single repeatable list (no "primary" vs "co-tenant" split). At least one row required.
- Add a "Billing tenant" picker next to the list; defaults to the first tenant added, freely changeable.
- Unit section keeps the rows but the "Primary?" radio is removed; user just picks an `assignmentType` per row (primary / ancillary / parking / storage). Multiple `primary`-type rows are allowed. At least one row required.
- Validation toasts:
  - "At least one tenant is required."
  - "At least one unit is required."
  - "Billing tenant must be one of the lease tenants."

## Amendments (`src/components/amendments/AmendmentDialog.tsx`, `src/lib/amendments.ts`)

- Single "Tenants" section listing every tenant on the lease with a Remove button on each row (no special-cased primary).
- Add a "Billing tenant" amendment field (dropdown of remaining tenants after the simulated changes).
- Single "Units" section listing every assigned unit with a Remove button on each row (no special-cased primary). `assignmentType` becomes the only role displayed.
- Drop the `primaryUnitId` amendment field entirely.

## Integrity layer (`src/lib/integrity/`)

- `leaseIntegrity.ts`: replace `LEASE_NO_TENANT` (checking `primaryTenantId`) with `LEASE_NO_TENANTS` (checking `tenantIds.length > 0`). Replace `LEASE_NO_PRIMARY_UNIT` with the existing `LEASE_NO_UNITS` only.
- `leaseUnitAssignmentIntegrity.ts`: remove `LUA_NO_PRIMARY` and `LUA_MULTIPLE_PRIMARY`. Keep `LUA_NO_UNITS`.
- `amendmentIntegrity.ts`: remove `AMD_NO_PRIMARY_LEFT`, `AMD_MULTIPLE_PRIMARIES`, `AMD_PRIMARY_CHANGE`. Add `AMD_NO_TENANTS_LEFT` (blocker when simulated `tenantIds.length === 0`) and `AMD_BILLING_TENANT_REMOVED` (blocker when the simulated `billingTenantId` is no longer in `tenantIds` and no replacement is set in the same amendment).
- `tenantIntegrity.ts`: switch every `primaryTenantId || coTenantIds.includes()` check to `tenantIds.includes()`.

## Receivables & cash receipts

- `src/lib/leaseReceivables.ts`, `src/context/AppContext.tsx` (`generateReceivablesForLease`, advance cycles), `src/pages/LeaseDetail.tsx` (cash receipt creation): switch `tenantId: lease.primaryTenantId` to `tenantId: lease.billingTenantId`.
- When `billingTenantId` changes via amendment activation, **existing** receivables/receipts are not retroactively reattributed (audit trail preserved); only newly generated ones use the new billing tenant.

## Tenant status reconciliation (`src/context/AppContext.tsx`)

- `reconcileTenantStatuses` scans `lease.tenantIds` instead of `[primaryTenantId, ...coTenantIds]`. All call sites (`addLease`, `updateLease`, `confirmMoveOut`, `activateAmendment`) updated accordingly.
- `getLeasesByTenant` filter becomes `l.tenantIds.includes(tenantId)`.

## Occupancy KPIs

- `src/pages/Dashboard.tsx`, `src/context/AppContext.tsx` (`getPropertyStats`), `src/pages/Reports.tsx`, `src/lib/occupancy.ts`:
  - "Occupied" = there is an active assignment whose `assignmentType === 'primary'` **or** whose unit type is not in `ANCILLARY_UNIT_TYPES`.
  - "Ancillary leased" = active assignment whose `assignmentType` is in `ANCILLARY_ASSIGNMENT_TYPES` or whose unit type is in `ANCILLARY_UNIT_TYPES`.
  - Occupancy-rate denominator continues to exclude ancillary units.
  - No code path requires "exactly one primary" anymore.

## Display

- Lease list, LeaseDetail, AmendmentsSection: sort assignments by `assignmentType` (primary → ancillary → parking → storage) instead of by `isPrimary`. Show `assignmentType` as the badge.
- LeaseDetail tenant section: list every tenant equally; mark the `billingTenantId` with a small "Billing" chip.
- Dashboard overdue tenants: aggregate by `billingTenantId` (the entity actually receiving the invoice).

## `lib/leaseAssignments.ts`

- Remove `getPrimaryAssignment` and `getPrimaryLeaseUnit`.
- `getAncillaryLeaseUnits` → filter by `assignmentType` membership instead of `!isPrimary`.
- `getActiveLeaseForUnit` tie-breaker: prefer the assignment whose `assignmentType === 'primary'`, otherwise pick the earliest start date.
- `migrateLegacyLeaseAssignments`: stop seeding `isPrimary`; backfill `assignmentType` from the legacy `lease.unitId` only during the one-shot migration, then this helper can be deleted.

---

## Migration order (so the app keeps building between steps)

1. DB migration: add `tenant_ids`, `billing_tenant_id`; backfill from existing columns. Keep old columns for one deploy.
2. App code: switch all reads/writes to the new fields, remove `isPrimary` usages, update integrity layer, update UI.
3. DB migration: drop `primary_tenant_id`, `co_tenant_ids`, `lease_unit_assignments.is_primary`, `leases.unit_id`.

---

## Out of scope

- No change to cost allocation logic (it already operates on `rentShare` / `chargesShare` per unit, not on `isPrimary`).
- No change to amendment versioning / activation flow itself — only the set of fields it can carry changes.
- Historical receivables/receipts are not rewritten when `billingTenantId` changes.
