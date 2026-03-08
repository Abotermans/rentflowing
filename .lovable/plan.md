

# Wire Status Transition Validation into Forms and Actions

## Overview
Integrate the existing integrity layer's `getStatusTransitionValidation()` and `canChangeLeaseStatus()` / `canChangeTenantStatus()` / `canChangeUnitStatus()` / `canArchiveProperty()` into every place where statuses are changed — forms and action buttons — showing blockers and warnings inline.

## Changes

### 1. Create `src/components/shared/StatusTransitionAlert.tsx`
A small reusable component that accepts a `ValidationResult` and renders:
- Blocker messages as a red alert with bullet list
- Warnings as an amber/yellow alert
- Recommended action text
Used inline in forms and next to action buttons.

### 2. Lease form save validation (`Leases.tsx` lines 69-89)
Before saving, call `canChangeLeaseStatus(leaseId, form.leaseStatus, integrityState)` when editing and the status changed. If blocked, show toast with blocker messages and prevent save. Import `useIntegrityState`.

### 3. Lease status dropdown in form (`Leases.tsx` lines 267-270)
Filter available statuses based on current lease status using allowed transitions map:
- `draft` → `active`, `draft` (self)
- `active` → `ended`, `terminated`, `active` (self)  
- `ended` / `terminated` → only self (no reversal)

Disable statuses that aren't valid transitions. When user selects a new status, run `canChangeLeaseStatus` and display `StatusTransitionAlert` below the dropdown.

### 4. LeaseDetail action buttons (`LeaseDetail.tsx` lines 161-162, 331-336)
- `handleMarkEnded` and `handleMarkTerminated`: call `canChangeLeaseStatus()` before updating. If blocked, show toast with blockers instead of proceeding. If warnings, show them in a confirmation dialog.
- Add an "Activate Lease" button when `leaseStatus === "draft"` that calls `canActivateLease()` and shows blockers/warnings before proceeding.

### 5. Tenant form save validation (`Tenants.tsx` lines 52-65)
When editing a tenant and status changed, call `canChangeTenantStatus(tenantId, form.status, integrityState)`. Block save if not allowed, show warnings inline.

### 6. Tenant status dropdown (`Tenants.tsx` lines 169-173)
After status change in form, display `StatusTransitionAlert` below the dropdown if validation returns blockers or warnings.

### 7. Unit form save validation (`Units.tsx` lines 76-89 and `PropertyDetail.tsx` lines 60+)
When editing a unit and status changed, call `canChangeUnitStatus(unitId, form.currentStatus, integrityState)`. Block save if not allowed, show warnings.

### 8. Unit status dropdown (`Units.tsx` lines 225-229 and `PropertyDetail.tsx`)
Display `StatusTransitionAlert` below the unit status dropdown when validation fails.

### 9. Property form save validation (`Properties.tsx` lines 81-94)
When changing property status from `active` to `inactive`, call `canArchiveProperty(propertyId, integrityState)`. Show warnings (not hard block) before save.

### 10. Property status dropdown (`Properties.tsx` lines 283-290)
Display `StatusTransitionAlert` inline when switching to inactive and warnings exist.

## File Summary

| File | Action |
|------|--------|
| `src/components/shared/StatusTransitionAlert.tsx` | Create — renders blockers/warnings from ValidationResult |
| `src/pages/Leases.tsx` | Modify — validate status on save, filter dropdown, show alerts |
| `src/pages/LeaseDetail.tsx` | Modify — validate before ended/terminated, add activate button |
| `src/pages/Tenants.tsx` | Modify — validate tenant status on save, show alerts |
| `src/pages/Units.tsx` | Modify — validate unit status on save, show alerts |
| `src/pages/PropertyDetail.tsx` | Modify — validate unit status on save in property context |
| `src/pages/Properties.tsx` | Modify — validate property inactive transition, show warnings |

