# Unit status — one source of truth

## Diagnosis (case PAR-A02 / u2)

- Stored on the unit: `currentStatus = "occupied"` (no active lease — lease `l4` is ended).
- `getDerivedOccupancy` returns `derived = "vacant"` + `inconsistent = true` (alert: "marked as occupied but no active lease").
- The list and the detail header render `StatusBadge status={occupancy.derived}` → user sees **Vacant**.
- The edit dialog binds to `form.currentStatus` (initialised from `unit.currentStatus`) → user sees **Occupied**.

Two surfaces, two values, same unit. The alert text ("marked as occupied") refers to the stored value, but the badge already overrode it to derived, so the user reads the alert as contradicting the badge.

## Decision: stored manual status is the displayed truth

Rationale:
- The badge and the edit dialog must show the same value — that value has to be the editable/persisted one (`unit.currentStatus`).
- Derived occupancy (from active lease) is the **reality check**, not the displayed status. When it disagrees, that is exactly the inconsistency the panel is supposed to surface and let the user reconcile.
- Once the user clicks the suggested fix, stored aligns with reality and the badge updates naturally. No dual-badge confusion.

This matches the requirement already in the memory ("Derived Occupancy Model") — derived drives detection and suggested actions, not the displayed status.

## Changes

### 1. `src/pages/UnitDetail.tsx`
- Header badge (line 200): render the **stored** status — `<StatusBadge status={unit.currentStatus} />` (covers `occupied | vacant | reserved | unavailable`).
- Occupancy card badge (line 309): same — `unit.currentStatus`.
- Keep the secondary contextual badges next to it (`lifecycle`, `scheduled`, `returnStatus`) as today; they describe lease lifecycle, not unit status.
- Keep the reconciliation `Alert` exactly as is — it already names the stored status, explains the mismatch with reality, and offers the one-click fix.

### 2. `src/pages/Units.tsx`
- Table "Occupancy" column (line 259): render `<StatusBadge status={u.currentStatus} />` instead of `occupancy.derived`. Keep the warning icon + tooltip driven by `occupancy.inconsistent` / `occupancy.inconsistencyKey` (already there at line 260+) — that's the inconsistency signal.
- Filter behaviour: the "Occupancy" filter currently matches on `occupancy.derived`. Switch it to match on `u.currentStatus` so the filter and the visible badge agree. The filter options (`vacant`, `occupied`, `reserved`, `unavailable`, plus `move-in-pending`/`under-notice`/`move-out-scheduled` etc.) need to be split:
  - Stored-status options (`vacant`, `occupied`, `reserved`, `unavailable`) match against `currentStatus`.
  - Lifecycle-nuance options (`move-in-pending`, `under-notice`, `move-out-scheduled`, `available-soon`) keep matching against `occupancy.derived` since those exist only as derived states.
  - Rename the filter label to `t("occupancy.statusFilterLabel")` (new key: EN "Status" / FR "Statut") to reflect that it now filters the stored status with lease-lifecycle extras.

### 3. `src/pages/PropertyDetail.tsx`
- Units table: same swap — show `u.currentStatus` in the badge, keep the inconsistency tooltip from `getDerivedOccupancy`.

### 4. `src/lib/occupancy.ts`
- No logic change. `getDerivedOccupancy` continues to compute reality and inconsistencies. Only its consumers change which field they render.
- Keep `getDerivedOccupancyKey` (it remains useful inside the alert/tooltip copy if we later want to say "Reality per active lease: Vacant").

### 5. i18n
- Add `occupancy.statusFilterLabel` (EN: "Status", FR: "Statut") to `src/i18n/translations.ts`.
- No other string changes — the existing inconsistency keys already read correctly when the badge shows the stored value.

### 6. Tests
- `src/lib/occupancy.test.ts` — no changes needed; logic untouched.
- Manual check on `/units/u2` (PAR-A02): badge shows **Occupied**, amber alert says "marked as occupied but no active lease", click "Mark Vacant" → unit persists as `vacant`, badge updates to **Vacant**, alert disappears, edit dialog matches.

## Out of scope
- Adding a secondary "Reality" badge next to the stored badge (rejected: re-introduces the two-badge confusion the user complained about).
- Changing how leases drive `derived` — the detection logic stays as is.
- Other modules.
