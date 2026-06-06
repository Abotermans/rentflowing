# Unify lease units table & formula gating

Refactor the Add/Edit Lease modal so units are managed in a single table (no more separate "Unit" field + "Additional units" block), and so the rent formula applies uniformly across every selected unit.

## UI changes (`src/pages/Leases.tsx`)

1. **Remove** the standalone Property/Unit two-column row that holds the primary unit `<Select>`.
2. **Keep** the Property `<Select>` on its own line (units depend on it).
3. **Replace** the "Additional units" panel with a single **Units** card:
   - Header: "Units *" on the left, `[+ Add unit]` button top-right (disabled until a Property is chosen).
   - Table columns:
     `Unit | Role | Monthly rent | Monthly charges | Total | ✕`
   - First row added is auto-tagged role = `primary`; subsequent rows default to `parking` (role editable via Select, with a constraint that exactly one row stays `primary`).
   - Each row's Rent / Charges are editable numbers; `Total = rent + charges` (read-only).
   - **Footer row**: sums of Monthly rent, Monthly charges, and a Grand total cell.
   - Empty state copy when no units yet: "Add at least one unit to this lease."

4. **Formula selector** (`leases.formula`):
   - Compute `commonTiers = intersection of getAllRentTiers(unit).durationMonths for every selected unit row` (must be non-empty; 1-month is always present if every unit has `baseRent`).
   - The `<Select>` only lists durations in `commonTiers`.
   - If no units selected yet, or the intersection is empty, disable the Select and show helper text:
     *"Select units that all share the same advance-payment tiers to enable a formula."*
   - When a formula is chosen, **rewrite every row's `rentShare`** to `getMonthlyRentForMonths(unit, months)` for that unit. Charges are untouched.
   - When a unit is added/removed or its unit id changes, re-validate the current `rentFormula` against the new intersection; if invalid, reset to `1` and clear any advance-cycle UI state.

5. **Lease totals** (`form.monthlyRent`, `form.monthlyCharges`) become **derived** from the table sums on every change (single source of truth = the rows). Remove the separate "Monthly rent / Monthly charges" inputs from step 3 and instead show a read-only summary line ("Monthly rent: X · Charges: Y · Total: Z"). `dueDay`, deposit, notice period, signed date, notes remain editable.

## State / persistence

- Replace `extraUnits` with a unified `unitRows: { unitId; assignmentType; rentShare; chargesShare }[]`.
- On open (add): start with `[]`; on edit: load all assignments (primary + ancillary), sorted with primary first.
- On save:
  - `form.unitId` ← the row flagged `primary`.
  - `form.monthlyRent` / `monthlyCharges` ← sums of rows.
  - `setLeaseUnits(leaseId, propertyId, rows.map(...))` — primary row uses `isPrimary: true`, others `false`.
- Validation: exactly one primary row; every row has a `unitId`; no duplicate unit ids; selected formula must exist on every unit.
- Keep the existing `validateLeaseUnits` integrity call (it already handles property mismatch / active-lease conflicts).

## Out of scope

- Per-unit formulas (explicit user note: to be done later).
- Changes outside the Add/Edit Lease modal (lease list table, LeaseDetail, receivables generation logic) — the resulting `lease.monthlyRent`/`monthlyCharges` and per-assignment shares feed the existing downstream code unchanged.

## Files touched

- `src/pages/Leases.tsx` — modal markup, `extraUnits` → `unitRows`, formula gating, save mapping.
- `src/i18n/translations.ts` — add keys: `leases.units.title`, `leases.units.empty`, `leases.units.total`, `leases.units.grandTotal`, `leases.formula.requiresCommonTiers`, French equivalents.
