## Goal

Align amendment end-date logic with the new per-unit end-date model (introduced in the notice flow), simplify the unit-changes table, and drop the redundant "Role" concept on assignments.

## Changes

### 1. Per-unit end date on amendments

**UI — `src/components/amendments/AmendmentDialog.tsx`**
- Remove the global "New end date" field at the top of the dialog (the `newEndDate` state + input).
- Add an **End date** column to the unit-changes table, between *Charges share* and *Status*.
  - For current units: editable `<input type="date">`, defaults to the assignment's current `endDate` (or `lease.endDate` if null). Disabled when the row is marked for removal.
  - For units being added: editable `<input type="date">`, defaults to `lease.endDate`.
- Track edits in a new `editedEndDates: Record<unitId, string>` map, plus `endDate?: string` on each `AddDraft`.
- Add a small tooltip on the column header explaining: each unit can have its own end date; the lease end date is the latest of all unit end dates.

**Change-draft generation (same file, `changesDraft` memo)**
- Drop the `leaseEndDate` push.
- For each current unit whose `editedEndDates[unitId]` differs from the current assignment end date, push a new change of `fieldName: "unitEndDate"`, `changeType: "set"`, `metadata: { unitId }`, `oldValue`/`newValue` = ISO dates.
- For added units, include `endDate` in the `metadata` of the existing `unitAssignments` add change (read by `activateAmendment`).

### 2. New `unitEndDate` amendment field

**Types — `src/types/amendments.ts`**
- Add `"unitEndDate"` to `AmendmentFieldName`.
- Mark `"leaseEndDate"` as `@deprecated` (kept for legacy rows; still rendered read-only in `AmendmentChangesDialog`).

**Activation — `src/context/AppContext.tsx` `activateAmendment`**
- Inside the `nextAssignments` reducer, handle `c.fieldName === "unitEndDate"`: set the matching active assignment's `endDate = String(c.newValue) || null`.
- Inside the add branch, honour `c.metadata.endDate` when building the new assignment (instead of `endDate: null`).
- After computing `nextAssignments`, derive the lease's new `endDate` as the latest non-null `endDate` among active assignments for the lease, and apply it to `patched.endDate` (overriding the value coming from `libGetEffectiveLeaseTerms`).

**Integrity — `src/lib/integrity/amendmentIntegrity.ts`**
- Add a case for `c.fieldName === "unitEndDate"`:
  - Blocker if `newValue < lease.startDate` or `newValue < amendment.effectiveDate`.
  - Reuse `findOverlappingLeases` with the new per-unit `endDate` to catch extension overlaps.
- Drop the existing `leaseEndDate` overlap block once UI no longer emits it (keep the field handling for legacy rows: still validate but no UI path creates them).

**Derivation — `src/lib/amendments.ts`**
- In the effective-terms folding, replace the `leaseEndDate` aggregation with: lease end date = max of all active assignment end dates as of `asOfDate`. Keep legacy `leaseEndDate` change handling as a fallback when no per-unit changes exist.

**Diff display — `src/components/amendments/AmendmentChangesDialog.tsx`**
- Add a row renderer for `unitEndDate`: label `End date · {unitCode}`, before = formatted old date, after = formatted new date.

### 3. Allow removing any unit except the last one

**`src/components/amendments/AmendmentDialog.tsx`**
- Replace `canRemove = !r.assignment.isPrimary` with a computed `remainingCount = currentUnits.length - unitsToRemove.length + unitsToAdd.length`. `canRemove = !marked && remainingCount > 1`.
- When a row IS marked, always allow the undo button.
- The remove button is disabled (with a tooltip "A lease must keep at least one unit") when `remainingCount <= 1`.

**Integrity — `src/lib/integrity/leaseUnitAssignmentIntegrity.ts` / `amendmentIntegrity.ts`**
- Existing `LUA_NO_UNITS` / `AMD_NO_UNITS_LEFT` blockers already cover the empty case — no change.
- Drop `AMD_NO_PRIMARY_LEFT` and `AMD_MULTIPLE_PRIMARIES` enforcement (see step 4).

### 4. Remove the "Role" concept on assignments

The `assignmentType` field stays on the data model (some logic depends on it), but it is no longer surfaced as a user-facing "Role" choice — it is derived from the unit's own type.

**Helper — `src/lib/leaseAssignments.ts`** (new function)
- `deriveAssignmentTypeFromUnit(unit): LeaseUnitAssignmentType` — maps `unit.unitType` (`apartment`, `house`, `office`, `parking`, `cellar`, `storage`, …) to the matching `LeaseUnitAssignmentType` (`primary` for the lease's main residential/office unit type, otherwise the matching ancillary value).

**`src/components/amendments/AmendmentDialog.tsx`**
- Remove the `Role` column header and cells from the unit-changes table.
- Remove the `assignmentType` `Select` on rows being added; instead, set `assignmentType = deriveAssignmentTypeFromUnit(unit)` when the user picks a unit from the popover.
- Stop pushing/handling `isPrimary` state in this dialog; primary is no longer user-editable here.

**`src/components/leases/LeaseAddDialog.tsx` and `LeaseEditDialog.tsx`**
- Remove any "Role" / `assignmentType` selector and "Primary" toggle in the units sub-table (out of strict scope but required for consistency — confirm in the technical section below). Derive `assignmentType` from each unit. Default the first picked rentable unit to `isPrimary = true` automatically.

**Translations — `src/i18n/translations.ts`**
- Remove `amendments.role` from the EN/FR bundles (and any leftover `leases.role` keys used only in these tables).
- Add `amendments.unitEndDate`, `amendments.unitEndDateTooltip`, `validation.dates.unitEndBeforeStart`, `validation.dates.unitEndBeforeEffective`.

## Out of scope

- No database migration: per-unit `endDate` already exists on `lease_unit_assignments`; no new column needed.
- No changes to receivable generation other than the existing regen path triggered by lease updates on activation.
- No changes to the cancel-notice or move-out flows.

## Technical notes

- The derived lease `endDate` rule (max of active assignment end dates) supersedes the legacy `leaseEndDate` amendment field. Legacy amendment rows with `leaseEndDate` continue to display correctly in the changes dialog but new amendments no longer create them.
- Primary-unit invariants previously enforced by integrity (`AMD_NO_PRIMARY_LEFT`, `LUA_MULTIPLE_PRIMARY`, `LUA_NO_PRIMARY`) are relaxed to: "at least one unit remains". Existing leases keep their `isPrimary` flag but it is no longer mutated through the amendment UI.
- `deriveAssignmentTypeFromUnit` keeps the mapping centralised so future unit types only need updating in one place.
