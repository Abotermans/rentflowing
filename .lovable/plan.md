
# Step 2 — Tenant Workspace Redesign

Scope: `src/components/leases/LeaseAddDialog.tsx` (Step 2 block only). Stepper, footer wiring, and steps 1 & 3 stay untouched. Same for `LeaseEditDialog` (not in scope unless you ask).

## State machine

Add local state inside Step 2:
- `subView: "workspace" | "search" | "create"` — default `"workspace"`
- `pendingExistingTenantId` (already exists) reused by the search sub-view
- `tenantForm` (already exists) reused by the create sub-view
- Remove the existing `tenantMode` toggle (replaced by `subView`)

`attachedIds = [primaryTenantId, ...coTenantIds].filter(Boolean)` continues to drive the populated/empty branch. Helpers `attachAsPrimary` and `removeAttached` are kept as-is.

## View A — Selection Workspace

Header row inside the Step 2 panel:
- Left: `Label` "Tenants" (use existing `leases.wizard.tenantDetails`)
- Right: `DropdownMenu` button "Select Tenant ▾" (primary style, `Plus` icon), with two items:
  - "Search Existing Tenant" → `Search` icon → `setSubView("search")` (disabled when no available existing tenants)
  - "Create New Tenant" → `Plus` icon → `setSubView("create")`

Body:
- If `attachedIds.length === 0`: render `EmptyState` (existing component) with an `Users` icon, title `"No tenants added to this lease yet"`, description `"Search for an existing tenant or create a new profile."` Both strings added as new i18n keys.
- Else: render the existing attached-tenants `Table` plus an additional left-most checkbox column (always checked, toggling it unattaches the row via `removeAttached`). Keep the existing row "X" remove button as a secondary control.

## View B1 — Search Existing Tenant

Replaces the workspace body (the header dropdown is hidden while in this sub-view). Uses the existing `Select` over `availableExisting` (or, optional polish, swap to `Command`/`Popover` autocomplete — only if trivial). Footer in this sub-view is local, overriding the global footer area:
- `Cancel` → `setSubView("workspace")`, clears `pendingExistingTenantId`
- `Add Selected` (primary, disabled until a tenant is picked) → `attachAsPrimary(pendingExistingTenantId)`, clear it, `setSubView("workspace")`

Implementation note: keep the global `DialogFooter` rendering but, when `step === 2 && subView !== "workspace"`, render the local action buttons instead of the global Back/Next pair (no markup duplication — branch inside the existing footer).

## View B2 — Create New Tenant

Replaces the workspace body with the existing tenant form fields (firstName, lastName, email, phone, dateOfBirth, status, identificationNumber, currentAddress, notes). Local footer:
- `Cancel` → discard `tenantForm`, `setSubView("workspace")`
- `Save Tenant` (primary) → run existing validation (first/last/email required) → `addTenant(tenantForm)` → `attachAsPrimary(created.id)` → reset form → `setSubView("workspace")` → toast.

## Global footer behaviour (unchanged contract)

- Step 2 with `subView === "workspace"`:
  - Left: `Back`
  - Right: `Next` — `disabled` iff `attachedIds.length === 0` (replaces current ad-hoc validation toast). The existing on-click guard is removed since the button is now disabled instead.
- Step 2 with `subView !== "workspace"`: footer shows the local `Cancel` / `Add Selected` or `Save Tenant` buttons described above.

## i18n keys to add (en + fr) in `src/i18n/translations.ts`

- `leases.wizard.tenantsEmptyTitle` — "No tenants added to this lease yet"
- `leases.wizard.tenantsEmptySubtitle` — "Search for an existing tenant or create a new profile."
- `leases.wizard.selectTenantMenu` — "Select tenant"
- `leases.wizard.searchExistingTenant` — "Search existing tenant"
- `leases.wizard.createNewTenant` already exists — reuse.
- `action.addSelected` — "Add selected"
- `action.saveTenant` — "Save tenant"

## Out of scope

- No changes to data model, AppContext, Step 1, Step 3, or `LeaseEditDialog`.
- No nested Dialog/Sheet — all sub-views render inline inside the existing wizard `DialogContent`, satisfying the "no nested modals" constraint.
- Stale leftover code on line 521-523 (the `"\n"` placeholder paragraph) is removed as part of the empty-state replacement.
