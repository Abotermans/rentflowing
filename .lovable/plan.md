# Improve Move-Out Flow

Tighten the link between Notice registration, the Move-Out card, and the natural end of the lease, and surface contextual suggestions as the end date approaches.

## 1. Sync notice ↔ move-out scheduled date

In `src/pages/LeaseDetail.tsx`, `handleSaveNotice`:
- When the user saves a notice, also write `moveOutScheduledDate` using the intended move-out date from the notice form (if `moveOutActualDate` is not yet set).
- This automatically flips the Move-Out card from "Not scheduled" to "Scheduled" (driven by existing `getMoveOutStatus`).
- `handleCancelNotice`: clear `moveOutScheduledDate` too, but only if move-out is not yet completed and the current scheduled date matches the notice's intended date (don't blow away a manually edited date).

## 2. Gate the move-out checklist on scheduling

In the Move-Out card (around lines 1046-1068):
- When `moveOutStatus === "not-scheduled"`, hide the checklist entirely and instead show a muted placeholder: "Schedule the move-out to start the checklist." The Schedule button in the header stays as the call to action.
- Keep the dates row visible (both will show "—").
- Checklist appears as soon as a scheduled date exists (status = `scheduled`), and becomes read-only after `completed` (already the case).

## 3. "Complete" move-out flow

Today the move-out Sheet already has a confirm path. Tighten the UX:
- In the Move-Out card header, when status is `scheduled`, add a primary `Complete` button next to the existing `Edit` button.
- Clicking `Complete` opens the existing move-out Sheet pre-focused on the **actual move-out date** field (required). Saving sets `moveOutActualDate` and marks all checklist items done (existing `handleConfirmMoveOut` logic).
- Keep `Edit` for adjusting scheduled date / meters / notes without completing.

## 4. End-of-lease suggestion banner

Add a new banner on `LeaseDetail` shown when **all** of these are true:
- `lease.lifecycleStage === "active"`
- `lease.endDate` is within the next 60 days (inclusive), based on today's ISO date
- `lease.moveOutActualDate` is null

Banner content:
- Headline: "The end of the lease is in X days" (X = days between today and `endDate`, min 0; "today" / "tomorrow" handled).
- If `endDate` is already past: "The lease end date has passed" (same banner, different copy).
- Two action buttons:
  - **Create an amendment** → opens the existing Amendment dialog (reuse the trigger used by the Amendments section; pass an optional pre-fill hint for `endDate`).
  - **Schedule move-out** → opens the existing Move-Out Sheet via `openMoveOutForm`, pre-filling scheduled date with `endDate` if empty.
- If notice is already given OR move-out is already scheduled, hide the "Schedule move-out" action and only show "Create an amendment".
- Styling: use the same warning Alert pattern as the existing pending-guarantee banner (`border-warning/50 bg-warning/10 text-warning` + `Clock` icon) for visual consistency.

Place the banner directly under the existing "under notice" banner block (around line 613) so all lifecycle alerts cluster together.

## 5. i18n keys (added to `src/i18n/translations.ts`, EN + FR)

- `lease.endingSoon.title` — "The end of the lease is in {days} days"
- `lease.endingSoon.today` / `tomorrow` / `passed`
- `lease.endingSoon.suggestAmendment` — "Create an amendment"
- `lease.endingSoon.suggestMoveOut` — "Schedule move-out"
- `detail.moveOut.checklistGated` — "Schedule the move-out to start the checklist."
- `detail.complete` — "Complete"

## Technical notes

- Threshold constant `END_OF_LEASE_WARNING_DAYS = 60`, local to `LeaseDetail.tsx`.
- Day-diff helper: compare ISO `YYYY-MM-DD` strings via `Date.UTC` to avoid timezone drift, consistent with existing `getLeaseStatus`.
- Notice→move-out sync uses `intendedMoveOutDate`; if blank, do nothing.
- No backend/schema changes — purely presentation + update calls into existing `updateLease`.
- No changes to `getMoveOutStatus`, `Lease` type, or domain integrity.

## Out of scope

- Auto-creating amendments or move-out records without user confirmation.
- Email/notification reminders.
- Changing the notice cancellation semantics beyond clearing the auto-set scheduled date.
