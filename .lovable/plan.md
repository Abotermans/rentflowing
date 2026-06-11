## Goal
On the lease detail page, show a banner that draws attention to the **move-out checklist** once the scheduled move-out date has passed. Hide it as soon as the checklist is fully completed.

## Trigger conditions (status-independent)
Show the banner when ALL of the following are true:
- `lease.moveOutScheduledDate` is set AND is **strictly before today**
- The move-out checklist is **not** fully completed — i.e. at least one boolean in `lease.moveOutChecklist` is `false`

No condition on `lifecycleStage`. No condition on `moveOutActualDate` — the banner remains relevant whenever the checklist still has open items, even after the actual move-out has been recorded.

## Banner design
- Placement: in `src/pages/LeaseDetail.tsx`, alongside the other lease banners (after the "Under notice" block, before the End-of-lease section).
- Style: `Alert` with warning treatment (`border-warning/50 bg-warning/10 text-warning [&>svg]:text-warning`), `AlertTriangle` icon, consistent with other lease banners.
- Content:
  - Title (bold): "Scheduled move-out date has passed ({date})"
  - Description: "Complete the move-out checklist so the lease can be closed. ({done}/{total} done)"
  - Actions:
    - Primary: **Complete checklist** → scrolls to the existing move-out checklist section on the same page.
    - Secondary: **Record move-out** → opens the existing move-out form (`openMoveOutForm`). Hidden when `moveOutActualDate` is already set.

## i18n
Add new keys to `src/i18n/translations.ts` (EN + FR):
- `lease.moveOutOverdue.title`
- `lease.moveOutOverdue.description`
- `lease.moveOutOverdue.completeChecklist`
- `lease.moveOutOverdue.recordMoveOut`

## Files to change
- `src/pages/LeaseDetail.tsx` — add the new conditional banner block; add a small anchor/`id` on the move-out checklist section so the "Complete checklist" button can scroll to it.
- `src/i18n/translations.ts` — add EN/FR strings.

No business-logic, schema, or data-model changes.