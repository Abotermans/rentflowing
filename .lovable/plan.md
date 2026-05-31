## Goal

In Step 2 of the Create Lease wizard (`src/pages/Leases.tsx`), let the user either pick an existing tenant or create a new one inline. Steps 1 and 3 are unchanged.

## Step 2 UI

At the top of the step, a segmented toggle (Tabs or two buttons) with two modes:

- **Existing tenant** (default if there are tenants in the system)
  - Searchable Select listing all tenants (name + email), bound to `form.primaryTenantId`.
  - Small helper text under it.
- **New tenant**
  - Current inline tenant form (firstName, lastName, email, phone, DOB, status, ID, address, notes), bound to `tenantForm`.

State: `const [tenantMode, setTenantMode] = useState<"existing" | "new">(tenants.length ? "existing" : "new")`. Reset in `openAdd` and on dialog close.

## Validation (gating Next on Step 2)

- `existing`: require `form.primaryTenantId` to be set.
- `new`: require `tenantForm.firstName`, `lastName`, `email` (current rule).

## Final submit

In `executeLeaseSave` (create branch):

- If `tenantMode === "new"`: call `addTenant(tenantForm)` and use the returned id as `primaryTenantId` (current behavior).
- If `tenantMode === "existing"`: skip `addTenant`; use the already-selected `form.primaryTenantId`.

Then run the existing `addLease` flow (conflict checks + override dialog) unchanged.

## Translations

Add EN/FR keys in `src/i18n/translations.ts`:
- `leases.wizard.useExistingTenant` ("Select existing tenant" / "Sélectionner un locataire existant")
- `leases.wizard.createNewTenant` ("Create new tenant" / "Créer un nouveau locataire")
- `leases.wizard.selectTenantPlaceholder` ("Choose a tenant…" / "Choisir un locataire…")

## Out of scope

Edit-lease flow, co-tenants, tenant integrity changes, Tenants page.
