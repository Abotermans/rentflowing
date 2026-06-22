## Goal

Make each unit row on a lease carry its own start and end date in the Add/Edit Lease dialogs, persist those dates per assignment, and remove the dialog's generic lease-level Start/End date inputs.

## Changes

### 1. Units table in dialogs — add Start / End columns

In `src/components/leases/LeaseAddDialog.tsx` and `src/components/leases/LeaseEditDialog.tsx`:

- Extend the local `UnitRow` type with `startDate: string` and `endDate: string | null`.
- New defaults when a row is added:
  - `startDate` = empty (user must fill); pre-filled from the prefilled unit's current assignment in edit mode, or copied from the first existing row in add mode.
  - `endDate` = `null` (open-ended).
- Add two `<TableHead>` cells "Start" and "End" between Role and Rent (compact `h-8` date inputs, same styling as the existing numeric inputs).
- In edit mode, hydrate each row from the existing `LeaseUnitAssignment.startDate` / `endDate`.

### 2. Remove the generic Start / End date fields

- Delete the two `<div>` blocks rendering `leases.startDate` / `leases.endDate` inputs (LeaseAddDialog line 714-715, LeaseEditDialog line 666-667) and the surrounding grid wrapper if it becomes empty.
- Remove `startDate` / `endDate` from form-level required-field validation. Replace with per-row validation:
  - Every row must have a `startDate`.
  - For each row, if `endDate` is set it must be ≥ `startDate` (uses the existing `validateDateOrder` helper / `t("validation.dates.endBeforeStart")`).
  - `signedDate` (if set) must be ≤ the earliest row `startDate`.

### 3. Derive lease-level dates from rows

The `Lease` entity keeps `startDate` / `endDate` (used by receivables, lifecycle, overlap, banners). They become derived at save time:

- `lease.startDate` = min of all row `startDate`s.
- `lease.endDate` = max of all row `endDate`s, or `null` if any row is open-ended.

Apply this derivation in both dialogs' submit handlers before calling `addLease` / `updateLease`.

### 4. Persist per-unit dates

- In the `DraftAssignment[]` passed to `validateLeaseUnits` and in the payload passed to `setLeaseUnits`, replace the current `startDate: form.startDate, endDate: null` with the row's own `startDate` and `endDate`.
- `setLeaseUnits` and the `lease_unit_assignments` table already accept `startDate` / `endDate` per row (used today by overlap detection), so no schema change is needed.

### 5. Translations

Add two keys (EN + FR) in `src/i18n/translations.ts`:
- `leases.col.startDate` → "Start" / "Début"
- `leases.col.endDate` → "End" / "Fin"

## Out of scope

- No DB migration (per-assignment dates already exist on `lease_unit_assignments`).
- No changes to amendment, receivables, or move-in/out flows — they keep reading `lease.startDate` / `lease.endDate`, which are now derived.
- Lease detail page units table is not modified in this change; only the Add/Edit dialogs.

## Open question

Confirm the derivation rule for `lease.endDate`: **max of row end dates, treating any row with no end date as making the lease open-ended (`endDate = null`)**. This matches today's "open lease" semantics. If you'd rather force every row to have an end date, say so and I'll add it as a blocker instead.
