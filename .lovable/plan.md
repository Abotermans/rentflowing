

# Consistency Pass: Final Review Findings

## Issues Found

### 1. CostCategories, CostEntries, AllocationRules pages bypass integrity on delete
These three pages use raw `AlertDialog` with no integrity check — they call `deleteCostCategory(id)`, `deleteCostEntry(id)`, `deleteAllocationRule(id)` directly. CostEntries and AllocationRules have integrity validators (`canDeleteCostEntry`, `canDeleteAllocationRule`) but they're never invoked in the UI. CostCategory has no integrity validator at all, but should — a category with cost entries should not be deletable.

**Fix**:
- Add `canDeleteCostCategory` to `costIntegrity.ts` (blocks when entries reference the category)
- Add `"cost-category"` case to `getDeletionImpact` dispatcher in `integrity/index.ts`
- Replace raw `AlertDialog` with `DeleteDialog` component in all three pages (CostCategories, CostEntries, AllocationRules)

### 2. Dashboard occupancy double-counts units
Line 24-27: A unit is counted as "occupied" if it has an active lease **OR** `currentStatus === "occupied"`. But then `vacant = total - occupied - reserved - unavailable`. If a unit has `currentStatus === "reserved"` and also an active lease, it gets counted in both `occupied` and `reserved` (since reserved excludes active-lease units, this is actually handled). However, a unit with `currentStatus === "unavailable"` AND an active lease gets counted in both `occupied` (line 24-27) and `unavailable` (line 28). 

**Fix**: Compute occupancy categories mutually exclusively — active lease = occupied (takes priority), then unavailable, then reserved, then vacant.

### 3. LeaseDetail `handleActivateLease` fires double toast on success
Lines 180-184: When activation has warnings, it toasts warnings AND then toasts "Lease activated" — two toasts.

**Fix**: Make the success toast include the warning text, or only toast once.

### 4. Lease `handleMarkEnded` fires double toast on warnings
Lines 199-203: When ending with warnings, toasts warnings AND then "Lease marked as ended".

**Fix**: Same pattern — single toast with combined info.

### 5. `StatusTransitionAlert` receives `validation` but not `overrideAllowed` hint for tenant → former
When tenant has active leases (hard block, `overrideAllowed: false`), the alert correctly shows no override hint. When tenant has only warnings (open balances, `overrideAllowed: true`), the `StatusTransitionAlert` should show the override hint. Need to verify this works — the component checks `validation.overrideAllowed` but `allowedWithWarnings` returns `allowed: true`, so the override hint shows when `!validation.allowed && validation.overrideAllowed`. For warnings-only case (`allowed: true`), the override is not needed since the action proceeds anyway. This is correct.

No fix needed.

### 6. `getDeletionImpact` missing `"cost-category"` case
The dispatcher falls through to the default (allow) for `"cost-category"`, meaning `DeleteDialog` with `entityType="cost-category"` would always allow deletion. Need to add the case.

Already covered in issue #1.

## Summary of Changes

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/integrity/costIntegrity.ts` | Add `canDeleteCostCategory` function |
| 2 | `src/lib/integrity/index.ts` | Add `cost-category` case to dispatcher, export new function |
| 3 | `src/pages/CostCategories.tsx` | Replace raw AlertDialog with `DeleteDialog` |
| 4 | `src/pages/CostEntries.tsx` | Replace raw AlertDialog with `DeleteDialog` |
| 5 | `src/pages/AllocationRules.tsx` | Replace raw AlertDialog with `DeleteDialog` |
| 6 | `src/pages/Dashboard.tsx` | Fix mutually exclusive occupancy counting |
| 7 | `src/pages/LeaseDetail.tsx` | Fix double toast on activate and mark-ended |

No new features. Only completes missing integrity wiring and fixes inconsistencies.

