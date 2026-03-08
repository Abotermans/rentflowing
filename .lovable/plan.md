

## Test Results & Fix Plan: Properties Page

### What Was Tested

| Feature | Result |
|---------|--------|
| Page load, list display | Works — 5 properties, all columns render |
| Search filter | Works |
| Type filter (e.g. Commercial) | Works — correctly filters to 1 result |
| Country filter | Present and populated with used countries |
| Status filter | Present with Active/Inactive options |
| Add Property dialog | Opens, shows all fields with correct labels and required markers |
| Add validation (empty submit) | Works — blocks save on missing required fields |
| Edit Property dialog | Opens, pre-fills all existing data correctly |
| Delete confirmation | Shows dialog with Cancel/Delete buttons |
| Navigation to detail page | Works — shows property overview, KPIs, units table |
| Units table on detail page | Correct columns, currency/area formatting, status badges |
| Back navigation | Works — "Properties" link returns to list |

### Issues Found

**1. Delete confirmation lacks data viability checks (critical)**

The user explicitly requested: "Deletion should have counter check or confirmation for the viability of the data." Currently, the delete dialog shows a generic message: _"This will permanently delete this property and all its units."_

It should show contextual warnings like:
- "This property has **4 units**, **2 active leases**, and **3 pending payments**. Deleting it will permanently remove all associated data."
- For properties with no dependencies: "This property has no units or leases. It can be safely deleted."

This applies to both:
- **Property deletion** on `Properties.tsx` (line 96-99, 203-217)
- **Unit deletion** on `PropertyDetail.tsx` (line 74-77)

**2. PropertyDetail unit delete also lacks viability check**

`handleDeleteUnit` (line 74) deletes immediately with no warning about active leases on that unit.

### Fix Plan

**File: `src/pages/Properties.tsx`**
- In the delete dialog (lines 207-215), compute and display counts of related units, active leases, and payments for the property being deleted.
- Show a stronger warning when active leases exist (e.g. "This property has 2 active leases. Deleting it may cause data loss.").
- For properties with no dependencies, show a simpler safe-to-delete message.

**File: `src/pages/PropertyDetail.tsx`**
- In the unit delete dialog, check for active leases on the unit. If an active lease exists, warn: "This unit has an active lease (BAIL-PAR-001). Deleting it will orphan the lease."
- Show unit's occupancy status in the warning.

**Translation keys to add** in `src/i18n/translations.ts`:
- `properties.deleteWarningUnits` / `properties.deleteWarningLeases` / `properties.deleteSafe`
- `detail.deleteUnitWarningLease` / `detail.deleteUnitSafe`

### No New Features
This only fixes the delete confirmation UX to satisfy the "counter check" requirement. No new modules or flows are added.

