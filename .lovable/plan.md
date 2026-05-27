## Goal

On `/units/:id`, edit actions should stay on the page and open a centered Dialog scoped to the section being edited, instead of redirecting to `/units?edit=...` (which opens the full unit form on the list page).

## Sections & fields

Each section gets its own Edit button (pencil icon, top-right of the card) opening a dedicated Dialog:

1. **Unit Information** — `unitCode`, `unitLabel`, `unitType`, `floor`, `surfaceArea`, `bedrooms`, `bathrooms`, `furnished`, `availableFrom`, `currentStatus` (with existing `StatusTransitionAlert` + override flow).
2. **Financial Defaults** — `baseRent`, `baseRentSixMonths`, `baseRentYearly`, `baseCharges`. Currency label derived from parent property (read-only display).
3. **Property Context** — `propertyId` only (re-parenting). Other fields shown there (city, country, locale, measurement) are property attributes, not unit-editable, so they stay read-only and the dialog explains that changing the property re-parents the unit.
4. **Notes** — small pencil on the Notes card to edit `notes` inline (bonus, same pattern, low cost).

## Implementation

- Replace the top-right `<Link to="/units?edit=...">` button with a removal — page-level edit no longer needed (sections cover it). Keep the back link.
- Add local state in `src/pages/UnitDetail.tsx`:
  - `editSection: "info" | "financials" | "property" | "notes" | null`
  - `form` initialized from current unit when opening a section, reset on close.
- Add one `<Dialog>` (centered, `max-w-lg max-h-[90vh] overflow-y-auto`) that switches its content based on `editSection`. Reuse field markup patterns from `src/pages/Units.tsx` (Select / Input / Switch / Label) so styling stays consistent.
- Save handler:
  - Validates required fields for the Information section (`unitCode`, `unitLabel`, `propertyId`).
  - For status changes, reuses `canChangeUnitStatus` + `OverrideConfirmDialog` + `useOverrideHistory` exactly as `Units.tsx` does today.
  - Calls `updateUnit({ ...unit, ...patch })` with only the touched fields merged in, then toasts and closes.
- Remove the `/units?edit=...` round-trip from this page. The list page keeps its own behavior unchanged (other entry points still work).

## Out of scope

- No changes to `Units.tsx` list, data model, integrity rules, or translations beyond adding section titles (`detail.editUnitInformation`, `detail.editFinancialDefaults`, `detail.editPropertyContext`) in `src/i18n/translations.ts` EN/FR.
- Property Context dialog re-parents only; it does not edit property-level fields.

## Verification

- Open `/units/u1`, click each section's pencil → centered Dialog opens with the right fields, save persists, page stays on `/units/u1`.
- Status change blocked by integrity → override dialog appears as on the list page.
- `bunx vitest run` — no regressions (no test touches this page).
