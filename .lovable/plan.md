

# Consistency Pass: Findings and Fixes

## Issues Found

### 1. Dashboard occupancy KPIs use `currentStatus` (manual), not derived occupancy
**File**: `src/pages/Dashboard.tsx` lines 23-27
The dashboard computes occupied/vacant/reserved/unavailable from `u.currentStatus` directly, while `getPropertyStats` in AppContext already uses derived occupancy (checks for active leases). This creates an inconsistency between the top-level KPIs and the per-property stats table.

**Fix**: Replace the manual status counting (lines 23-27) with a loop that uses the same derived logic as `getPropertyStats` — check for active leases to determine occupied vs vacant.

### 2. Tenant → "former" with active leases: blocked but no override allowed
**File**: `src/lib/integrity/tenantIntegrity.ts` line 56
`canChangeTenantStatus` returns `blocked(blockers, warnings, ...)` when tenant has active leases. The `blocked()` helper sets `overrideAllowed: false`. The Tenants page wires override support but it will never trigger because the blocker is hard.

This is **correct behavior** — a tenant should not become "former" while leases are still active. No change needed.

### 3. Lease form in `Leases.tsx` does not use override for status changes
**File**: `src/pages/Leases.tsx` lines 98-104
When editing a lease status, blockers just show a toast. No override dialog is wired, unlike `LeaseDetail.tsx`. However, the lease form only shows `ALLOWED_TRANSITIONS` in the dropdown (draft→active, active→ended/terminated), so most blocked cases are already prevented by not showing the option. The `canChangeLeaseStatus` check is a secondary safeguard.

**Fix**: Add override support here too, consistent with `LeaseDetail.tsx`, for the case where `ended` or `terminated` has warnings/overridable blockers.

### 4. Lease property-unit mismatch not validated on save
**File**: `src/pages/Leases.tsx` lines 92-119
The lease form filters units by `form.propertyId` and resets `unitId` when property changes (line 269), which prevents mismatch in normal flow. However, the `canActivateLease` integrity function checks for property-unit mismatch at activation time. No gap here for new leases created as draft.

**No fix needed** — the UI prevents mismatch, and integrity catches it at activation.

### 5. Lease `handleSave` in `Leases.tsx` allows override-eligible transitions without override dialog
When changing lease status to `ended` via the lease list form, if `canChangeLeaseStatus` returns `allowed: true` with warnings (current behavior for ending with open balances), it proceeds silently. This is actually correct — the integrity layer says it's allowed with warnings.

However, for consistency with `LeaseDetail.tsx`, the lease list should also show warning toasts when `validation.warnings.length > 0`.

**Fix**: After validation passes in `Leases.tsx handleSave`, show warning toast if warnings exist.

### 6. `StatusTransitionAlert` shows override indicator but no action
The `StatusTransitionAlert` component shows blockers and warnings but doesn't indicate that override is available. The `IntegritySummaryPanel` does show this. This is fine — the override is triggered on save, not in the inline alert. No change needed.

### 7. Missing `cost-allocation-result` and `ticket` in `IntegrityEntityType`
**File**: `src/lib/integrity/types.ts`
The `IntegrityEntityType` union doesn't include `"cost-allocation-result"` or `"ticket"`, but these are used as `entityType` values in blocker objects (e.g., `unitIntegrity.ts` line 22: `entityType: "cost-allocation-result"`). This doesn't cause runtime errors since it's just a string on the blocker, but it's a type inconsistency.

**Fix**: Add `"cost-allocation-result"` and `"ticket"` to the `IntegrityEntityType` union.

### 8. `OverrideConfirmDialog` shown for deletion overrides?
The `DeleteDialog` component never triggers the override flow even when `overrideAllowed` is true on the validation result. Currently all deletion validators return `overrideAllowed: false`, so this is correct. The override indicator in `IntegritySummaryPanel` only shows for non-deletion contexts. No issue.

### 9. Double toast on unit override save
**File**: `src/pages/Units.tsx` lines 130-142
`handleOverrideConfirm` calls `executeSave()` which toasts "Unit updated", then also toasts "Unit updated (overridden)". Same pattern in `PropertyDetail.tsx` and `Tenants.tsx`.

**Fix**: Remove the toast from `executeSave` path when called from override, or skip the generic toast in the override handler. Simplest: have the override handler call `updateUnit` directly and close the sheet, bypassing `executeSave`.

### 10. `StatusTransitionAlert` shows override-available hint
Currently it doesn't. When a user changes status in the form and sees blockers, there's no visual hint that override is possible until they click Save. 

**Fix**: Add a subtle note in `StatusTransitionAlert` when `validation.overrideAllowed` is true: "This can be overridden on save for exceptional cases."

## Summary of Changes

| # | File | Change |
|---|------|--------|
| 1 | `src/pages/Dashboard.tsx` | Use derived occupancy (active lease check) for top-level KPIs |
| 2 | `src/pages/Leases.tsx` | Add override dialog support + warning toast on save |
| 3 | `src/lib/integrity/types.ts` | Add `"cost-allocation-result"` and `"ticket"` to entity type union |
| 4 | `src/pages/Units.tsx` | Fix double toast on override |
| 5 | `src/pages/PropertyDetail.tsx` | Fix double toast on override |
| 6 | `src/pages/Tenants.tsx` | Fix double toast on override |
| 7 | `src/components/shared/StatusTransitionAlert.tsx` | Add override-available hint |

All structural blockers remain strictly non-overridable. No new business modules added.

