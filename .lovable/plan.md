## Goal

Rework the amendment ("avenant") workflow so it mirrors the lease lifecycle:

```text
draft  ──►  scheduled  ──►  active  ──►  ended (auto, superseded by a later amendment)
                                    └►  terminated (manually stopped)
```

- **draft** — being prepared / edited.
- **scheduled** — signed and locked, waiting for `effectiveDate`.
- **active** — `effectiveDate ≤ today`; the amendment's changes are in force. Transition from `scheduled` is automatic.
- **ended** — a later amendment took over (today's `superseded`, renamed for parity with lease `ended`).
- **terminated** — operator stopped it. Historical effect is preserved (no rollback of assignments); future periods revert to whatever the next-most-recent active amendment / original lease dictates.

## 1. Type & data model (`src/types/amendments.ts`)

- `AmendmentStatus = "draft" | "scheduled" | "active" | "ended" | "terminated"`.
- Drop `"pending-signature"`, `"cancelled"`, `"superseded"` (no real persistence layer yet, just mock data — straight rename in `src/data/mockData.ts`: `pending-signature → scheduled`, `cancelled → terminated`, `superseded → ended`).
- Update `AMENDMENT_STATUS_LABELS` accordingly.

## 2. State transitions (`src/context/AppContext.tsx`)

Replace the current ad-hoc helpers with a single coherent set:

- `addAmendment` — always creates in `draft`.
- `scheduleAmendment(id)` — `draft → scheduled`. Requires `effectiveDate` set and integrity check (reuse `validateAmendment`, blockers must be empty).
- `activateAmendment(id)` — `scheduled → active`. Writes the assignment side-effects (existing logic in lines 562–631). Also fires when auto-activation runs.
- `terminateAmendment(id)` — `active → terminated` (and `scheduled → terminated` allowed too). No assignment rollback per decision.
- `revertAmendmentToDraft(id)` — `scheduled → draft` for edits before activation.
- `deleteAmendment` — restricted to `draft` only (UI already gates this; keep guard).

Remove `cancelAmendment` and `supersedeAmendment` from the public API. Replace internal supersession with: when an amendment activates, every other `active` amendment on the same lease whose touched-field set overlaps gets moved to `ended` and `supersedesAmendmentId` is set on the new one.

### Auto-activation on date crossing

Add an effect inside `AppProvider`:

```text
useEffect(() => {
  const tick = () => {
    const today = new Date().toISOString().slice(0,10);
    amendments
      .filter(a => a.status === "scheduled" && a.effectiveDate <= today)
      .forEach(a => activateAmendment(a.id));
  };
  tick();
  const id = setInterval(tick, 60_000); // re-check every minute while app is open
  return () => clearInterval(id);
}, [amendments, activateAmendment]);
```

This guarantees a `scheduled` amendment becomes `active` without user action once its date passes.

## 3. Integrity (`src/lib/integrity/amendmentIntegrity.ts`)

- Rename status references (`pending-signature` → `scheduled`, `active` unchanged) in `validateAmendment` conflict detection.
- Add a new helper `canScheduleAmendment` = `validateAmendment` with `effectiveDate` required blocker.
- Existing `canActivateAmendment` is still used (now called by the scheduler before flipping to `active`, and by the auto-activation tick — auto-activation should silently keep amendment as `scheduled` and surface a warning toast if blockers appear, rather than activating into a broken state).

## 4. UI (`src/components/amendments/AmendmentsSection.tsx` + `AmendmentDialog.tsx`)

Row action buttons by status:

| Status      | Actions                              |
|-------------|--------------------------------------|
| draft       | Edit · Schedule · Delete             |
| scheduled   | Edit (→ revert to draft + reopen) · Activate now · Terminate |
| active      | Terminate                            |
| ended       | (read-only)                          |
| terminated  | (read-only)                          |

- Replace the current "Activate" icon for `draft` with "Schedule" (calendar icon). Activation icon only on `scheduled` rows (manual override; auto-tick usually beats the user).
- Replace "Cancel" tooltip/icon (currently shown for `active`) with "Terminate".
- `STATUS_CLS` map: extend with `scheduled` (info/blue) and `terminated` (destructive muted). Keep `active` (success), `ended` (muted), `draft` (secondary).
- `AmendmentDialog` save button: when creating/editing a `draft`, primary action stays "Save draft"; add a secondary "Save & schedule" that runs `addAmendment` then `scheduleAmendment`.
- Read-only mode for `scheduled` (locked; user must revert-to-draft to edit).

## 5. Lifecycle filtering (`src/lib/amendments.ts`)

- `getActiveAmendmentsOn` already keys on `status === "active"`. No change in filter, but the renamed statuses just propagate.
- `getLeaseAmendmentImpact` simulation already flips to `"active"` — unchanged.

## 6. i18n (`src/i18n/translations.ts`)

Rename / add keys (EN + FR):
- `amendments.statusLabel.scheduled`, `amendments.statusLabel.terminated`, `amendments.statusLabel.ended`.
- `amendments.tooltip.schedule`, `amendments.tooltip.terminate`, `amendments.tooltip.revertDraft`.
- `amendments.action.saveAndSchedule`.
- Remove old `pending-signature` / `cancelled` / `superseded` keys.

## 7. Tests

- `src/lib/lifecycle.test.ts` — update or add a case asserting `scheduled` → `active` transition via the auto-activation effect (or extract the predicate so it can be unit-tested without timers).
- `src/lib/multiUnitLease.test.ts` — update any status string literals.

## Out of scope

- Auth/permissions on who can schedule vs terminate.
- Surfacing scheduled amendments in dashboards.
- Backend persistence (still mock state).
- Receivable rewrites at termination.
