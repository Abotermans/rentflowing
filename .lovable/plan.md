

# Domain Integrity Layer — Implementation Plan

## Overview
Create a centralized `src/lib/integrity/` module containing pure functions that validate entity relationships, status transitions, and delete/archive safety. No UI changes — just reusable logic returning structured `ValidationResult` objects.

## File Structure

```text
src/lib/integrity/
├── types.ts              # ValidationResult, Blocker, Warning types
├── propertyIntegrity.ts  # canDeleteProperty, canArchiveProperty, getPropertyWarnings
├── unitIntegrity.ts      # canDeleteUnit, canArchiveUnit, canChangeUnitStatus
├── tenantIntegrity.ts    # canDeleteTenant, canChangeTenantStatus
├── leaseIntegrity.ts     # canDeleteLease, canActivateLease, canChangeLeaseStatus
├── financialIntegrity.ts # receivable/receipt/allocation validation
├── costIntegrity.ts      # cost/tax entry and allocation rule validation
└── index.ts              # Re-exports all public functions
```

## Core Types (`types.ts`)

```ts
interface IntegrityBlocker { code: string; message: string; entityType?: string; count?: number; }
interface IntegrityWarning { code: string; message: string; severity: "low" | "medium" | "high"; }

interface ValidationResult {
  allowed: boolean;
  blockers: IntegrityBlocker[];
  warnings: IntegrityWarning[];
  recommendedAction?: string;
  overrideAllowed: boolean;
}
```

All validation functions accept the full AppState (the data arrays) as a parameter so they remain pure and context-independent.

## Validation Functions by Entity

### Property (`propertyIntegrity.ts`)
- **`canDeleteProperty(id, state)`** — blocked if units, leases, cost entries, allocation rules, cost allocation results, receivable items, or cash receipts reference it.
- **`canArchiveProperty(id, state)`** — allowed but warns if active units, active leases, open receivables, or unmatched receipts exist. Override allowed.
- **`getPropertyIntegrityWarnings(id, state)`** — returns warnings for active dependencies.

### Unit (`unitIntegrity.ts`)
- **`canDeleteUnit(id, state)`** — blocked if leases, receivables, receipts, cost entries, cost allocation results, or maintenance tickets reference it.
- **`canChangeUnitStatus(id, target, state)`** — e.g. "occupied" requires active lease; "vacant" blocked if active lease exists (override allowed for move-out flow); "unavailable" warns if active lease.
- **`getUnitIntegrityWarnings(id, state)`**

### Tenant (`tenantIntegrity.ts`)
- **`canDeleteTenant(id, state)`** — blocked if leases (primary or co-tenant), receivables, receipts, allocations, or guarantees reference it.
- **`canChangeTenantStatus(id, target, state)`** — "former" blocked if active leases exist; warns if open balances or unresolved guarantees.

### Lease (`leaseIntegrity.ts`)
- **`canDeleteLease(id, state)`** — blocked if receivables, receipts, allocations, guarantees, or notice/move-in/out operations exist.
- **`canActivateLease(id, state)`** — blocked if no primary tenant, or another active lease on same unit. Warns if signed date missing, deposit missing, move-in not scheduled.
- **`canChangeLeaseStatus(id, target, state)`** — delegates to specific checks per target status. Validates property-unit match.

### Financial (`financialIntegrity.ts`)
- **`canDeleteReceivable(id, state)`** — blocked if allocations exist or status is "paid".
- **`canDeleteCashReceipt(id, state)`** — blocked if allocations exist.
- **`canCreateAllocation(receiptId, receivableId, amount, state)`** — blocked if amount exceeds unmatched or outstanding, or currencies mismatch.

### Costs (`costIntegrity.ts`)
- **`canDeleteCostEntry(id, state)`** — blocked if allocation results exist.
- **`canDeleteAllocationRule(id, state)`** — blocked if cost entries reference it.
- **`validateCostEntry(entry, state)`** — unit-level must have valid unit; property-level rule must match property.
- **`validateManualPercentageShares(shares)`** — must total 100%.

## Implementation Approach
- All functions are pure: `(entityId, readonlyState) => ValidationResult`
- State parameter is a simple interface with the data arrays (not the full context with CRUD methods)
- Each function builds blockers/warnings by filtering relevant arrays, counting dependencies
- `index.ts` also exports a generic `getDeletionImpact(entityType, id, state)` and `getStatusTransitionValidation(entityType, id, target, state)` dispatcher

