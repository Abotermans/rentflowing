

## Test Results & Fix Plan: Units Page

### What Was Tested

| Feature | Result |
|---------|--------|
| Page load, 18 units listed | Works |
| Search filter ("studio" → 2 results) | Works |
| Property / Type / Status dropdown filters | Work correctly |
| Add Unit sheet — all fields, labels, units (m²/EUR) | Works |
| Add Unit validation (empty submit) | Works |
| Delete confirmation dialog | Shows, but **generic message only** |
| Navigation: unit code → UnitDetail | Works |
| Navigation: tenant link (Marie Dupont) | Works — correct TenantDetail |
| Navigation: lease link (BAIL-PAR-001) | Works — visible and linked |
| Navigation: property link (Résidence du Parc) | Works |
| UnitDetail: all sections render | Works — info, financials, occupancy, property context, maintenance, notes |

### Issues Found

**1. Unit delete dialog lacks viability checks (critical — same issue as Properties)**

The delete `AlertDialog` in `Units.tsx` (lines 176-182) shows a generic message: _"This will permanently delete this unit."_ It does not warn about active leases, tenants, or pending payments associated with the unit. The user explicitly requested "counter check or confirmation for the viability of the data."

**Fix**: In the delete dialog, look up active lease and tenant for the unit being deleted. Show contextual warnings:
- If active lease exists: "This unit has an active lease (BAIL-PAR-001) with tenant Marie Dupont. Deleting it will orphan this data."
- If no dependencies: "This unit has no active leases. It can be safely deleted."

**2. UnitDetail Edit button navigates to /units instead of editing**

`UnitDetail.tsx` line 73: `<Link to="/units">` — the Edit button just goes back to the list. It should either open the edit sheet on the Units page with this unit pre-filled, or provide inline editing. Since the Units page edit flow uses a Sheet controlled by state, the simplest fix is to navigate to `/units?edit={unitId}` and have Units.tsx read the query param to auto-open the edit sheet.

**Fix**: 
- `UnitDetail.tsx`: Change Edit link to `/units?edit={unit.id}`
- `Units.tsx`: On mount, read `edit` query param and auto-open the edit sheet for that unit

**3. UnitDetail has remaining hardcoded English strings**

- Line 276: `Maintenance ({unitTickets.length})` — not translated
- Lines 286-290: Table headers "Title", "Category", "Priority", "Status", "Created" — not translated
- Lines 321-322: "Created:" and "Updated:" timestamp labels — not translated

**Fix**: Add translation keys and use `t()` for these strings.

### Plan

**File: `src/i18n/translations.ts`**
- Add keys: `units.deleteWarningLease`, `units.deleteSafe`, `detail.maintenanceCount`, `table.title`, `table.created`, `table.updated`, `table.category`, `table.priority`

**File: `src/pages/Units.tsx`**
- Import `useAppData`'s `getActiveLease` and `tenants` (already available)
- In the delete `AlertDialog`, compute active lease and tenant for unit `u`, and display contextual warning
- Read `edit` query param from URL on mount; if present, auto-open edit sheet for that unit

**File: `src/pages/UnitDetail.tsx`**
- Change Edit button link from `/units` to `/units?edit=${unit.id}`
- Replace hardcoded "Maintenance (X)" with `t("detail.maintenanceCount").replace("{count}", ...)`
- Replace hardcoded table headers and timestamp labels with `t()` calls

