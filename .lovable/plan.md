## Goal
Align the move-in flow with the move-out flow on the lease detail page: same two-action header (Schedule / Record), a richer "Record move-in" modal with utility-meter icons and a notes field, and a warning banner when the move-in checklist is still incomplete on a signed/active/under-notice lease.

## Changes in `src/pages/LeaseDetail.tsx`

### 1. Move-in section header — mirror move-out
In the `renderHeader` call for move-in, pass the same `onOpen` / `onComplete` / `completeLabel` / `CompleteIcon` props as move-out:
- `onOpen` → `() => openMoveInForm({ mode: "schedule" })` (edit scheduled date)
- `onComplete` → `() => openMoveInForm({ mode: "complete" })` (record move-in)
- `completeLabel` → new i18n key `lease.recordMoveIn`
- `CompleteIcon` → `LogIn` from lucide-react

The existing header logic already shows "Schedule" / "Edit" + a primary "Record" button when status is `scheduled`, so no `renderHeader` change is needed beyond the new args.

### 2. Move-in dialog — two-mode (schedule vs complete) like move-out
- Add `moveInMode: "schedule" | "complete"` state and `moNotes`-equivalent `miNotes` + `miActualDate` states.
- Rework `openMoveInForm({ mode })`:
  - schedule mode → load scheduled date + meters + keys, no actual date.
  - complete mode → preload `miActualDate` with today (or existing actual), keep meters/keys editable, show scheduled date as read-only label.
- Rework handlers:
  - `handleScheduleMoveIn` → saves scheduled date, meters, keys, notes. **Does NOT touch the checklist** (same pattern as schedule move-out).
  - `handleConfirmMoveIn` → requires `miActualDate`; saves actual date + meters + keys + notes; **does NOT auto-check the checklist** (mirrors the move-out fix). Keep `moveInScheduledDate` filled in from the actual date if missing.
- Add `lease.moveInNotes` usage if it exists; otherwise reuse existing fields only (no schema changes — check `types/index.ts` during build; if `moveInNotes` is not present, skip the notes field rather than extending the model).

### 3. Modal visuals — utility icons
In the move-in dialog, wrap the electricity and water meter labels the same way the move-out dialog does:
```
<Label className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-warning" /> Electricity</Label>
<Label className="flex items-center gap-1.5"><Droplet className="h-3.5 w-3.5 text-primary" /> Water</Label>
```
Apply to both schedule and complete modes for visual consistency.

### 4. Warning banner — move-in checklist incomplete
Add a new conditional banner alongside the other lease banners (near the existing "move-out overdue" block, before the End-of-lease section). Show when:
- `lease.lifecycleStage` is `pending-signature`, `active`, or `under-notice` (i.e. lease is signed / live / under notice)
- AND at least one value in `lease.moveInChecklist` is `false`

Reuse the warning Alert styling already in the file (`border-warning/50 bg-warning/10 text-warning [&>svg]:text-warning`, `AlertTriangle` icon). Title + description show `{done}/{total} done` and offer two actions:
- Primary "Complete checklist" → scrolls to the move-in card (add `id="move-in-checklist"` + `scroll-mt-20` to it).
- Secondary "Record move-in" → `openMoveInForm({ mode: "complete" })`, hidden when `moveInActualDate` is already set.

Note: the exact lifecycle-stage trigger is "signed or active or under notice"; we map "signed" to `pending-signature` only if the lease is awaiting signature post-signing — in this codebase a signed lease becomes `active`, so the trigger effectively reduces to `active` or `under-notice`. We'll include `pending-signature` too so the banner fires the moment the user marks the lease signed before any other status change.

### 5. i18n — `src/i18n/translations.ts`
Add EN + FR strings:
- `lease.recordMoveIn` — "Record move-in" / "Enregistrer l'emménagement"
- `lease.moveInIncomplete.title` — "Move-in checklist incomplete"
- `lease.moveInIncomplete.description` — "Complete the move-in checklist. ({done}/{total} done)"
- `lease.moveInIncomplete.completeChecklist` — "Complete checklist"
- `lease.moveInIncomplete.recordMoveIn` — same as `lease.recordMoveIn`

## Files touched
- `src/pages/LeaseDetail.tsx` — header wiring, dialog refactor, banner, anchor id, `LogIn` import.
- `src/i18n/translations.ts` — new EN/FR keys.

## Out of scope
- No schema or data-model changes. Checklist auto-check behavior is intentionally removed from "Record move-in" to mirror the corrected move-out flow.
- No changes to meters table, keys card, or other sections.
