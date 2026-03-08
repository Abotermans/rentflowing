

# Integrate Integrity Results into Detail Pages

## Overview
Add dependency summary panels, blocker/warning banners, and recommended action guidance to all four detail pages. Update action buttons with proper disabled states and inline explanations.

## Changes

### 1. Create `src/components/shared/IntegritySummaryPanel.tsx`
A reusable Card component that displays a dependency/integrity summary for any entity. Accepts a `ValidationResult` from deletion check + optional status warnings, and renders:
- A compact list of dependency counts (e.g., "4 units · 2 leases · 3 cost entries")
- Blocker indicator: red badge "Delete blocked" or green "Deletable"
- Warnings list with severity-colored dots
- Recommended action text with Archive/Cancel/Terminate suggestion

### 2. PropertyDetail.tsx
After the Overview/Local Settings cards, add an `IntegritySummaryPanel` showing:
- `canDeleteProperty()` results: unit count, lease count, cost entries, receivables, receipts
- `canArchiveProperty()` warnings: active leases, open balances
- Delete blocked status with "Archive instead" recommendation
- Use existing `getDeletionImpact("property", id, integrityState)` and `canArchiveProperty()`

### 3. UnitDetail.tsx
After the header/inconsistency warning, add an `IntegritySummaryPanel` showing:
- `canDeleteUnit()` results: lease count, receivables, cost entries, tickets
- `getUnitIntegrityWarnings()` for open balances and multiple active leases
- Delete blocked status with "Mark unavailable instead" recommendation
- Already has occupancy inconsistency alert — keep that, add the summary panel below it

### 4. TenantDetail.tsx
After the Contact Info card, add an `IntegritySummaryPanel` showing:
- `canDeleteTenant()` results: lease count, receivables, receipts, guarantees
- `canChangeTenantStatus(id, "former")` blockers/warnings for active leases, open balances
- Delete blocked status with "Mark as former instead" recommendation

### 5. LeaseDetail.tsx
**Activation blocker panel** (when `draft`): Below header, show `canActivateLease()` results as a prominent panel listing what's missing (no tenant, unit mismatch, etc.) and what's warned (unsigned, no deposit).

**Lifecycle action buttons**: Update the Notice/Lease End card action area:
- Disable "Activate Lease" button when `canActivateLease()` is blocked; show tooltip with reason
- Disable "Mark Ended" / "Terminate" when `canChangeLeaseStatus()` is blocked
- Show `StatusTransitionAlert` inline below buttons when validation has warnings

**Delete blocker panel**: Add `canDeleteLease()` summary showing receivables, receipts, allocations, guarantees, move-in/out history — with "End or terminate instead" recommendation.

### 6. Action Button UX Improvements
For all detail pages where destructive or transition actions exist:
- Wrap blocked buttons in `Tooltip` showing the blocker reason
- Use `disabled` prop when action is blocked
- Show `StatusTransitionAlert` inline near action buttons when warnings exist

## Files Summary

| File | Action |
|------|--------|
| `src/components/shared/IntegritySummaryPanel.tsx` | Create — reusable dependency/integrity summary card |
| `src/pages/PropertyDetail.tsx` | Modify — add integrity summary panel |
| `src/pages/UnitDetail.tsx` | Modify — add integrity summary panel |
| `src/pages/TenantDetail.tsx` | Modify — add integrity summary + status warnings |
| `src/pages/LeaseDetail.tsx` | Modify — add activation blockers panel, disable blocked actions, delete summary |

