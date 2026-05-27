
# Vacancy & Occupancy Logic — Deep Analysis and Plan

## 1. Problem observed (LON-F02)

Unit LON-F02 displays **two badges side-by-side**: `Vacant` (derived from no active lease) and `Occupied` (the stored `currentStatus`). This is the root cause of confusion. The system is correctly detecting an inconsistency but then renders both sides of it as if both were equally true.

Today's logic in `src/lib/occupancy.ts` is sound — it already designates a single `derived` value as the truth and exposes `manualStatus` + `inconsistent` separately. The UI in `src/pages/UnitDetail.tsx` (lines 179–182 and 258–263) and `src/pages/Units.tsx` (lines 247–258) does not respect that hierarchy: it renders the manual status as a second badge whenever it differs.

## 2. Conceptual model (the answers to your questions)

**Can a unit be occupied without a lease?** In the European residential/commercial rental context this tool targets: **no**. Lawful occupancy requires a contract (bail / contrat de location / Mietvertrag / contratto di locazione). Even informal arrangements — tolerated occupants, squatters, family-of-owner — are not "occupied" from a property-management standpoint; they are exceptional situations the manager must regularise.

**Can a user mark a unit "occupied" without creating a lease?** Today, yes (the dropdown allows it). That is the bug. The manual `currentStatus` field is acting as a free-form override and producing the LON-F02 contradiction.

**Recommendation: one source of truth = the lease ledger.** Occupancy is **derived**, not set. The manual field is demoted to an operational hint (e.g., `unavailable` for renovation, `reserved` for a pre-letting hold) that **only applies when there is no active lease to contradict it**.

### Final state machine (single truth)

```text
Active lease exists?
├─ Yes ─ status = lease-driven
│         ├─ moveInScheduled & !moveInActual   → move-in-pending
│         ├─ noticeGiven                       → under-notice (availableFrom = intendedMoveOut)
│         ├─ moveOutScheduled & !moveOutActual → move-out-scheduled
│         └─ otherwise                         → occupied
└─ No  ─ status = manual hint (vacant default)
          ├─ unavailable (renovation, legal hold) → unavailable
          ├─ reserved (pre-letting commitment)    → reserved
          └─ vacant                               → vacant
```

`manualStatus = "occupied"` is **never** a valid terminal state on its own — it is always a data-entry error to be surfaced and fixed.

## 3. UI principle — show one truth, suggest the fix

Replace the dual-badge pattern with:

1. **One badge** = the derived status (the truth).
2. **One inline action card** when inconsistent, describing the discrepancy and offering a one-click reconciliation:
   - "Marked occupied but no active lease." → buttons: *Create lease* · *Mark vacant*
   - "Marked vacant but has active lease L-042." → button: *Sync status to occupied* (one click, audited)
   - "Marked reserved but has active occupied lease." → button: *Sync status to occupied*

The fix-it action writes `currentStatus` to match the derived state and logs an override-history entry (reusing `useOverrideHistory`). The user remains in control but the contradiction can be cleared in one click instead of digging into the edit dialog.

## 4. Concrete changes

### 4.1 `src/lib/occupancy.ts`
- Extend `OccupancyInfo` with `suggestedFix?: { targetStatus: UnitStatus; label: string; rationale: string }`.
- Compute `suggestedFix` whenever `inconsistent` is true. Examples:
  - active lease + manual `vacant`/`reserved` → suggest `occupied`.
  - no active lease + manual `occupied` → suggest `vacant` (or "Create lease" path handled by UI).
- Add `getEffectiveStatus(unit, leases)` returning a single `DerivedOccupancy` for use everywhere — this is the **only** value the UI may render as a badge.

### 4.2 `src/pages/UnitDetail.tsx`
- Header (lines 177–183): render **only** `<StatusBadge status={occupancy.derived} />`. Remove the `({unit.currentStatus})` muted suffix.
- Occupancy card (lines 258–263): render **only** the derived badge plus genuinely additive overlays (`move-in scheduled`, `return status`). Remove the second `StatusBadge status={unit.currentStatus}` rendered when they differ.
- Replace the existing amber `Alert` (lines 197–204) with a richer **Reconciliation panel**:
  - Heading: "Status needs attention"
  - Body: `inconsistencyMessage`
  - Primary action: `Sync to {suggestedFix.targetStatus}` (calls `updateUnit` + records override-history entry `status_reconcile:{old}→{new}`).
  - Secondary action when applicable: `Create lease` (link to `/leases?new=1&unitId=...`).

### 4.3 `src/pages/Units.tsx`
- Table cell (lines 245–258): keep the single derived badge + AlertTriangle tooltip — already correct. Ensure the manual status is never shown as a second badge anywhere.
- Filter dropdown stays on derived occupancy (already the case).

### 4.4 Edit form (Information section dialog in `UnitDetail.tsx` and `Units.tsx`)
- Restrict the **Status** dropdown options based on lease presence:
  - With active lease: dropdown is **disabled** with a tooltip: "Status is driven by the active lease. End the lease or mark notice to change occupancy."
  - Without active lease: only `vacant`, `reserved`, `unavailable` are selectable. `occupied` is removed from the choices (enforcing the rule that occupancy requires a lease).
- This eliminates the LON-F02 class of bug at the source.

### 4.5 Data migration (in-memory mock)
- One-shot pass on app load: for any unit with `currentStatus = "occupied"` and no active lease, demote to `vacant` and log a system override-history entry so the audit trail is preserved. Or leave the data and rely on the new Reconciliation panel to surface and fix each case manually — recommended for transparency.

### 4.6 i18n (`src/i18n/translations.ts`)
- Add EN/FR strings: `occupancy.needsAttention`, `occupancy.syncToStatus`, `occupancy.createLeaseAction`, `occupancy.statusLockedByLease`, `occupancy.suggestedFixRationale`.

## 5. European market alignment

- **Bail-driven occupancy** matches French *loi du 6 juillet 1989*, German BGB §535, Italian L.431/98 and Spanish LAU: a unit is "louée" only when a contract exists. Property managers reconcile against the contract register, not a free field.
- **Préavis (notice)** is a first-class state in every EU jurisdiction (1–3 months residential). Already modelled correctly via `under-notice`.
- **État des lieux / move-in protocol** is legally required; `move-in-pending` captures the gap between contract start and physical handover. Keep.
- **Vacance locative** (vacancy KPI) requires a clean vacant/occupied count — duplicate-badge UI breaks reporting. Single-truth model makes the KPI honest.
- **`unavailable`** covers travaux/renovation, owner-occupation, legal seizure — useful and kept.
- **`reserved`** covers signed pre-letting hold before contract start — useful and kept, but auto-clears when the lease becomes active.

## 6. Out of scope
- No backend schema changes (this codebase is mock-data).
- No changes to lease lifecycle, integrity rules, or reporting beyond what the single-truth model unblocks.
- No changes to other pages' status displays beyond Units list and Unit detail.

## 7. Verification
- Open `/units/u14` (LON-F02): a single `Vacant` badge + reconciliation panel offering *Create lease* and *Mark vacant*. No double badge.
- Create an active lease for a `vacant` unit: derived flips to `occupied`, panel offers *Sync to occupied*; one click clears it.
- Edit Information dialog with an active lease present: Status select is disabled with tooltip.
- Edit Information dialog without a lease: `occupied` option is absent from the dropdown.
- `bunx vitest run` — extend `src/lib/occupancy.test.ts` with cases for `suggestedFix` and run all suites green.
