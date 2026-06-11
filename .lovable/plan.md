# Add Keys & Badges return tracking to the Complete Move-Out modal

## Goal
In the Move-Out dialog (complete mode), show the list of keys and badges that were handed over to the tenant, with a date input for each so the user can record the return date item-by-item — instead of having to scroll back to the Keys & Badges section on the lease page.

## Scope
- File: `src/pages/LeaseDetail.tsx`, Move-Out dialog complete branch (around lines 1545–1578).
- No business-logic changes outside this dialog. Each row writes directly to `lease.keys[*].returnedDate` via the existing `patchKeyItem` helper, so changes are immediately persisted in the same way as the inline edits in the Keys & Badges card.

## UI

Inserted between the meters row and the Notes textarea:

```text
Keys & Badges                                          (section label)
┌──────────────────────────────────────────────────────────────┐
│ [Type]  Identifier                          Returned         │
│  Key    Front door — K-12                   [ 2026-06-10 ▾ ] │
│  Badge  Garage remote — B-04                [            ▾ ] │
└──────────────────────────────────────────────────────────────┘
```

Rules:
- Only items with a `handedOverDate` set are listed (those are the ones actually given to the tenant). Items never handed over are hidden to keep the dialog short.
- Each row is read-only for type/identifier (small icon + label text) and editable only for the returned date.
- Empty state: if no handed-over items exist, the whole section is omitted (no empty box).
- Default value for each row's returned date is the current `k.returnedDate` if set, otherwise empty. The "Confirm move-out" button stays enabled regardless (returning keys is not blocking).
- Compact density (`h-8 text-sm`) consistent with the rest of the dialog.

## i18n
Reuses existing keys: `detail.keysBadges`, `detail.kindKey`, `detail.kindBadge`, `detail.returned`. No new translation strings needed.

## Out of scope
- No change to the schedule branch of the move-out dialog.
- No change to the move-out checklist logic (`keysReturned` flag continues to be derived as today).
- No change to the standalone Keys & Badges card on the lease page.
