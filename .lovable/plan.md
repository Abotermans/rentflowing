# Units module — language audit & full i18n coverage

## Audit findings

The Units pages already use `t()` for most labels, but several strings still leak English when the user is in `fr`. Below are the gaps I found, grouped by surface.

### `src/pages/Units.tsx` (list + add/edit dialog)
- `UNIT_TYPES` array: labels hardcoded ("Apartment", "Studio"…). Used in the type filter and in the add/edit dialog dropdown.
- `UNIT_STATUSES` / `UNIT_STATUSES_NO_LEASE`: labels hardcoded ("Vacant", "Occupied"…). Used in the status dropdown.
- `OCCUPANCY_FILTERS`: labels hardcoded ("All Occupancy", "Move-In Pending"…). Used in the occupancy filter.
- `getUnitTypeLabel(u.unitType)` in the table cell returns hardcoded English from `src/lib/formatters.ts`.
- Toast strings: `"Unit updated"`, `"Unit added"`, `"Validation Error"`, `"Property, unit code, and label are required."`, `"Status change blocked"`, `"Unit updated (overridden)"`, `"Override reason: …"`.
- `OverrideConfirmDialog actionLabel="Override and Save"`.
- `<DeleteDialog entityLabel="unit" />` passes a hardcoded label that surfaces in confirmation copy.

### `src/pages/UnitDetail.tsx`
- Inline `UNIT_TYPES` / `UNIT_STATUSES` / `UNIT_STATUSES_NO_LEASE` duplicated and hardcoded.
- `getUnitTypeLabel(unit.unitType)` in info items.
- Financial Defaults card: `"Rent (6-Month Advance)"`, `"Rent (1-Year Advance)"`, `(Monthly)` suffix.
- Occupancy card: `"Unapplied Credit"`, `"… on …"` (English `on` between amount and date).
- Costs & Taxes card (hardcoded title + every cell): `"Costs & Taxes Burden"`, `"Total Burden"`, `"Direct Costs"`, `"Allocated"`, `"Entries"`, `"direct + … alloc."`, `"Owner-Borne"`, `"Recoverable"`, `"Direct Entries"`, `"Label"`, `"Recovery"`, `"Amount"`.
- Edit dialog: validation toasts (`"Validation Error"`, `"Unit code and label are required."`, `"Property is required."`, `"Status change blocked"`, `"Unit updated (overridden)"`), generic save toast uses `t("units.edit")` which produces `"Edit Unit"` instead of `"Updated"`.
- Property dialog alert: `"Changing the property re-parents this unit. Property-level attributes …"`.
- Financials dialog placeholders: `placeholder="Optional"`, dialog rent advance labels (same as Financial Defaults).
- Reconciliation toast description shows raw status keys (`occupied → vacant` instead of localized terms); reconcile override `reason: "Reconciled to match lease state"` is hardcoded.

### `src/lib/occupancy.ts`
- `inconsistencyMessage` for both branches and `suggestedFix.label` / `suggestedFix.rationale` are hardcoded English. These surface in the reconciliation `Alert` and in tooltips on the list.
- `getUnitOccupancyWarnings` builds English sentences with interpolated dates.
- `getDerivedOccupancyLabel` returns hardcoded English (currently unused — safe to keep but route through `t()` for safety).

### `src/lib/formatters.ts`
- `getUnitTypeLabel` and `getUnitStatusLabel` return hardcoded English. Used by `Units.tsx`, `UnitDetail.tsx`, and `PropertyDetail.tsx`.

### French translations to verify/add
Existing `units.*` and `status.*` keys cover most labels. Missing FR keys needed:
- `units.advanceRent6m`, `units.advanceRent1y`, `units.rentMonthly` (suffix).
- `units.unappliedCredit`, `units.nextDuePrep` (small connector phrase or restructure to `"{amount} — {date}"`).
- `units.costsTaxesBurden`, `units.totalBurden`, `units.directCosts`, `units.allocated`, `units.entries`, `units.entriesBreakdown` ("{direct} direct + {alloc} alloc."), `units.ownerBorne`, `units.recoverable`, `units.directEntries`, `units.recovery`.
- `units.toastUpdated`, `units.toastAdded`, `units.toastDeleted`, `units.statusChangeBlocked`, `units.requiredFields`, `units.requiredProperty`, `units.updatedOverridden`, `units.overrideReason`, `units.overrideAndSave`, `units.changePropertyWarning`.
- `units.optional` (placeholder reuse from `common.optional` if suitable).
- `occupancy.inconsistencyManualOccupiedNoLease`, `occupancy.inconsistencyManualVacantWithLease`, `occupancy.inconsistencyReservedWithLease`, `occupancy.fixMarkVacant`, `occupancy.fixSyncOccupied`, `occupancy.rationaleNoLease`, `occupancy.rationaleLeaseExists`, `occupancy.rationaleReservationSuperseded`, `occupancy.reconcileReason`.
- `occupancy.warningUnderNotice` (`"Unit is under notice — available from {date}."`), `occupancy.warningMoveInPending`.

## Implementation steps

### 1. `src/i18n/translations.ts`
Append the missing keys above to both `en` and `fr` blocks. Wording for fr to use European real-estate terminology already established (lot/bien/bail).

### 2. `src/lib/formatters.ts`
Convert `getUnitTypeLabel` and `getUnitStatusLabel` from string-returning helpers into `(type, t)` overloads OR — simpler and consistent with the rest of the codebase — replace usages with `t("units.<typeKey>")` / `t("status.<statusKey>")` directly. Choose: introduce `UNIT_TYPE_KEYS` / `UNIT_STATUS_KEYS` maps to `TranslationKey` and use `t(map[value])` at call sites. Delete now-unused helpers from `formatters.ts` (or keep as fallback for non-React contexts).

### 3. `src/pages/Units.tsx`
- Replace local hardcoded `UNIT_TYPES`, `UNIT_STATUSES`, `UNIT_STATUSES_NO_LEASE`, `OCCUPANCY_FILTERS` arrays with `{ value, labelKey }` shape; render labels via `t(labelKey)`.
- Replace `getUnitTypeLabel(u.unitType)` with `t(UNIT_TYPE_KEYS[u.unitType])`.
- Route all toast titles/descriptions through `t()` using new keys.
- Pass `actionLabel={t("units.overrideAndSave")}` to `OverrideConfirmDialog`.

### 4. `src/pages/UnitDetail.tsx`
- Same array refactor as Units.tsx.
- Translate Financial Defaults / Costs & Taxes / Occupancy card hardcoded strings.
- Replace `"… on …"` with formatted template using locale-aware ordering (`{amount} — {date}`).
- Fix the `toast({ title: t("units.edit") })` after persist → use `t("units.toastUpdated")`.
- Reconciliation `Alert`: render `inconsistencyMessage` and `suggestedFix.label/rationale` via `t()` (these now come from `occupancy.ts` as translation keys rather than literal strings).
- Reconcile toast description: replace `${prev} → ${target}` with `${t(STATUS_KEYS[prev])} → ${t(STATUS_KEYS[target])}`.
- Property dialog alert: wrap in `t("units.changePropertyWarning")`.

### 5. `src/lib/occupancy.ts`
Change the shape of `OccupancyInfo`:
- Replace `inconsistencyMessage?: string` with `inconsistencyKey?: TranslationKey` (and optional `params` for interpolation).
- Replace `suggestedFix.label` and `suggestedFix.rationale` strings with translation keys (`labelKey`, `rationaleKey`).
- Update `getUnitOccupancyWarnings` to either return keys+params or to take `t` as an argument. Simplest: return `{ key, params }[]` and translate at the call site (only used in detail pages; survey usages).

### 6. PropertyDetail.tsx & any other consumers of `getUnitTypeLabel`
Update call sites to use the new translation map for consistency.

### 7. Verification
- `bunx vitest run` to confirm existing occupancy tests still pass after shape change (update tests to assert keys rather than literal strings).
- Manual check in preview: toggle Settings → Language to Français, walk through `/units`, open an item, open each section's edit dialog, trigger an inconsistent state, confirm every visible string is in French.

## Files touched
- `src/i18n/translations.ts` (add keys, EN + FR)
- `src/lib/occupancy.ts` (return keys instead of literal English)
- `src/lib/occupancy.test.ts` (adjust assertions)
- `src/lib/formatters.ts` (export maps; deprecate or remove `getUnitTypeLabel`/`getUnitStatusLabel`)
- `src/pages/Units.tsx`
- `src/pages/UnitDetail.tsx`
- `src/pages/PropertyDetail.tsx` (small: swap `getUnitTypeLabel` call)

## Out of scope
- Other modules (Leases, Payments, Maintenance, Vendors, Costs pages). Their i18n audit is a separate task.
- New language additions beyond EN/FR.
- Data migrations or schema changes.
