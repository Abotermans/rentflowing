# Fix move-out workflow

## Problems

1. In the Move-Out card, both "Edit" and "Complete" buttons call `openMoveOutForm()` and open the same dialog. The dialog has both `Schedule` and `Confirm move-out` buttons, so editing the scheduled date often ends up running the full "confirm" path — which silently auto-checks every checklist item AND ends the lease (`lifecycleStage: "ended"` in `confirmMoveOut`).
2. Completing the move-out should not auto-end the lease — ending a lease is a separate flow with its own integrity checks (balances, guarantees…).
3. Meters are exposed in the schedule step, but they should only be entered when the move-out is actually completed.
4. The "Under notice" alert shows "Intended move-out on {date}" using a phrase distinct from the `Intended move-out` label used elsewhere on the page, breaking label consistency.

## Changes (in `src/pages/LeaseDetail.tsx`)

### 1. Split the move-out dialog into two explicit modes

Add a `moveOutMode: "schedule" | "complete"` state. `openMoveOutForm` accepts `{ mode, prefillScheduled? }` and pre-fills the inputs from the lease.

- **Schedule / Edit mode** (header "Edit" button, end-of-lease suggestion, move-out card "Schedule" button):
  - Visible fields: Scheduled date, Notes.
  - Hidden: Actual date, electricity meter, water meter.
  - Single action button: `Save` → calls `handleScheduleMoveOut`, which only writes `moveOutScheduledDate` and `moveOutNotes` (do not touch meters or actual date).
- **Complete mode** (header "Complete" button):
  - Visible fields: Scheduled date (read-only display), Actual move-out date (required, defaults to today), electricity meter, water meter, Notes.
  - Single action button: `Confirm move-out` → calls a new `handleCompleteMoveOut` (see below). Disabled until an actual date is set.

Header wiring in `renderHeader` for the Move-Out card:
- `onOpen` → `openMoveOutForm({ mode: "schedule" })`
- `onComplete` → `openMoveOutForm({ mode: "complete" })`

### 2. Decouple "complete move-out" from "end lease"

Replace the call into `confirmMoveOut` with a local `handleCompleteMoveOut` that simply calls `updateLease(...)` with:
- `moveOutActualDate` (required from the form)
- `moveOutMeterReading`, `moveOutWaterMeterReading`, `moveOutNotes` from the form (falling back to existing values)
- `moveOutChecklist`: all items checked
- **No** change to `lifecycleStage` and **no** unit vacating / amendment cascading. Those remain the responsibility of the existing "End lease" flow (`handleEndLease`).

After saving, show a toast and, if the lease is still active, suggest the user end the lease from the existing End-lease action (no auto-redirect). Leave `confirmMoveOut` in `AppContext` untouched for now — just stop calling it from this screen.

### 3. Don't capture meters during scheduling

Already covered by Change 1 (meters removed from schedule mode). Also remove meter writes from `handleScheduleMoveOut` so reopening Edit never accidentally persists a blank meter.

### 4. Label consistency in the "Under notice" alert

Replace `leaseDetail.intendedMoveOutOn` usage in the alert with the existing `detail.intendedMoveOut` label, rendered as `"{Intended move-out}: {formattedDate}"` so it matches the rest of the lease detail page. Keep the alert layout unchanged.

## Out of scope

- Changing `confirmMoveOut` in `AppContext`, ending lease integrity rules, or notice-cancel semantics.
- Backend / schema changes.
- Translations beyond reusing existing keys (no new keys required; the alert reuses `detail.intendedMoveOut`).
