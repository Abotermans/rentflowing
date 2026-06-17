## Goal
Allow tenants to be either an Individual or a Corporation, with form fields adapted to the chosen kind. Surface the kind on the list and detail pages. Designed to allow more kinds (e.g. association, SCI) later.

## Data model (src/types/index.ts)
- New: `export type TenantKind = "individual" | "corporation";` (extensible).
- Extend `Tenant` with:
  - `kind: TenantKind` (default `"individual"` for legacy rows)
  - Corporation-only fields (all nullable):
    - `companyName: string | null`
    - `legalForm: string | null` (free text — SARL, SAS, SCI, etc.)
    - `registrationNumber: string | null` (SIREN / company ID)
    - `vatNumber: string | null`
    - `contactFirstName / contactLastName / contactRole: string | null` (signatory / main contact)
- Update `getTenantFullName(t)` → for corporation return `companyName` (fallback to contact name); for individual unchanged. Used everywhere tenants are shown so list/lease/etc. surfaces work without further edits.
- Mock data + Supabase mapper (`src/lib/repo/*`) gain `kind: "individual"` default and nullable corporation columns. No DB migration in this step — fields persisted as-is on the existing JSON-ish tenant row via the repo layer (matches how other optional fields like `dateOfBirth` are handled). If the repo writes typed columns and rejects unknown ones we'll add a single migration adding the columns; flagged for the implementation phase.

## Form (src/components/tenants/TenantDialog.tsx)
- At the very top of the form, a required `Select` for **Tenant type** with options Individual / Corporation (i18n). Disabled when editing an existing tenant to keep semantics simple (can revisit later).
- Conditional rendering:
  - **Individual** (current behaviour): firstName*, lastName*, email*, phone, dateOfBirth, identificationNumber, currentAddress.
  - **Corporation**: companyName*, legalForm, registrationNumber, vatNumber, email*, phone, currentAddress (label becomes "Registered address"), then a "Main contact" subsection with contactFirstName*, contactLastName*, contactRole, plus contact email/phone reusing the existing email/phone fields.
- Required-field validation adapts to the kind. Status select + notes remain shared.
- `firstName`/`lastName` for a corporation are stored as the contact's name so existing `getTenantFullName` and downstream lease screens keep working — OR alternatively kept empty and full name derives from `companyName`. We'll go with the second option (cleaner) and update `getTenantFullName` accordingly.

## List (src/pages/Tenants.tsx)
- New "Type" column (between Name and Email) showing a small `Badge` ("Individual" / "Corporation") with i18n.
- Add the kind to the search predicate (match company name too).
- Add a `MultiSelectFilter` for Type alongside the Status filter.
- Sort key `kind` added.

## Detail (src/pages/TenantDetail.tsx)
- Show kind as a Badge next to the tenant's display name in the header.
- Replace the personal-info card with a kind-aware card:
  - Individual → current fields.
  - Corporation → company block (companyName, legalForm, registrationNumber, vatNumber, registered address) + Main contact block (name, role, email, phone).

## i18n (src/i18n/translations.ts)
- Add EN/FR keys under `tenants.*`: `kind`, `kind.individual`, `kind.corporation`, `companyName`, `legalForm`, `registrationNumber`, `vatNumber`, `mainContact`, `contactRole`, `registeredAddress`, plus filter label `filter.type`.

## Out of scope
- No new lease-side logic (billing tenant still works the same).
- No DB migration unless the repo layer requires it; will add a minimal one (add nullable columns + default `kind`) only if needed during implementation.
- No additional kinds beyond Individual/Corporation in this pass — the enum is extensible.
