## Goal

Restructure the Create New Lease dialog in `src/pages/Leases.tsx` into a 3-step wizard. Step 2 creates a brand-new tenant inline (no existing-tenant picker) and collects all mandatory tenant information; that tenant is committed to the system when the lease is created. Edit mode keeps the current single-form layout.

## Steps

**Step 1 — Lease details**
- Lease reference
- Property
- Unit
- Rent formula (tier)

**Step 2 — Tenant details (creates a new tenant)**
- First name *
- Last name *
- Email *
- Phone
- Date of birth
- Tenant status * (defaults to `active`)
- Identification number
- Current address
- Tenant notes

**Step 3 — Terms & financials**
- Start date / End date *
- Lifecycle status
- Monthly rent, monthly charges, due day
- Deposit / guarantee amount
- Notice period
- Signed date
- Lease notes

## Implementation

In `src/pages/Leases.tsx`:

1. **Wizard state**
   - `const [step, setStep] = useState(1)`; reset to 1 in `openAdd` and when the dialog closes.
   - Add a second form state `tenantForm` (same shape used in `Tenants.tsx`: firstName, lastName, email, phone, dateOfBirth, status, identificationNumber, currentAddress, notes), reset on `openAdd`.
   - Pull `addTenant` from `useAppData()` alongside the existing `addLease`.

2. **Dialog rendering**
   - Keep the existing `<Dialog>`/`<DialogContent>` shell.
   - When `editingLease` is set, keep today's full single-form layout untouched.
   - When creating: render a small stepper (3 segments using `bg-primary` / `bg-muted`) and a `Step X of 3 — <label>` line under the title. Show only the current step's fields inside the scroll container.
   - Remove the primary-tenant Select from the create flow (it stays in edit mode for now).

3. **Per-step validation (gates Next only)**
   - Step 1: reference, property, unit filled.
   - Step 2: firstName, lastName, email filled (mirrors the Tenants page validation); show inline toast on invalid Next click.
   - Step 3: dates present (existing required-field check still runs in `handleSave`).

4. **Final submit (Create lease button on step 3)**
   - Call `addTenant(tenantForm)` first and capture the returned tenant (or generate the id the same way `addTenant` does today — confirm by reading `AppContext`'s `addTenant` return value before implementing; if it doesn't return the new tenant, extend it to do so, or pre-generate the id with `crypto.randomUUID()` and pass it in).
   - Set `form.primaryTenantId` to that new tenant's id, then run the existing `handleSave` flow unchanged (conflict checks, override dialog, `addLease`).
   - On any failure after tenant creation, leave the tenant in the system (acceptable — user can edit on the Tenants page); do not attempt rollback.

5. **Footer**
   - Step 1: `Cancel` + `Next`
   - Step 2: `Back` + `Next`
   - Step 3: `Back` + `Create lease`

6. **Translations** — add to both EN and FR in `src/i18n/translations.ts`:
   - `leases.step.details`, `leases.step.tenant`, `leases.step.terms`
   - `leases.stepLabel` ("Step {n} of {total}")
   - `action.next`, `action.back` (only if missing)
   - Reuse existing `tenants.firstName`, `tenants.lastName`, `tenants.email`, etc. for the tenant step labels.

## Out of scope

- Edit-lease flow (unchanged).
- Selecting an existing tenant during creation (every new lease creates a new tenant in this flow).
- Co-tenants.
- Changes to the Tenants page or tenant integrity rules.
