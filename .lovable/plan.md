## Goal
Track every lease lifecycle status change (e.g. `draft → active`, `active → ended`, `active → terminated`, signature cancellation `active → draft`) with a persisted audit log, surface it inside the Lease detail page, and add a "Status history" entry in the existing kebab menu that opens a modal listing all changes.

## Scope
- Persist status changes to the backend so they survive reload (the existing override history is in-memory only and is not enough for an audit log).
- Log every lifecycle transition centrally, not only override-driven ones.
- Read-only display — no editing of past entries.

## Data model
New table `public.lease_status_changes`:
- `lease_id` (FK → leases, cascade)
- `portfolio_id` (for RLS — copied from lease)
- `from_stage` text nullable (null for initial creation)
- `to_stage` text not null
- `reason` text nullable (uses end/termination/override reason where applicable)
- `notes` text nullable
- `changed_by` uuid nullable (auth.uid())
- `changed_at` timestamptz default now()
- Standard `id`, `created_at`

RLS: same pattern as `leases` — members can read, editors/owners can insert. No update/delete (immutable log).

Initial backfill: insert one row per existing lease with `to_stage = current lifecycle_stage` and `reason = 'backfill'`, so each lease has at least one history entry.

## Where to log
Single helper `logLeaseStatusChange(leaseId, fromStage, toStage, { reason, notes })` called from every place that mutates `lifecycle_stage`:
- `LeaseDetail.performEndLease` (→ ended)
- `LeaseDetail.performTerminate` (→ terminated)
- `LeaseDetail.handleCancelSignature` (active/signed → draft)
- `LeaseEditDialog` when `lifecycleStage` changes (e.g. activation from draft, manual edits)
- Any other call to `updateLease` that flips `lifecycleStage` (audit and add)

The helper is invoked alongside the existing `updateLease`. If the user used the override flow, the override `reason` is also stored on the status change row, so both logs stay consistent.

## UI

### Kebab menu (LeaseDetail header)
Add a new item `Status history` (always enabled) above the destructive section, with a `History` icon. Selecting it opens a modal.

### Status history modal
Centered `Dialog` (project convention — never Sheet). Contents:
- Header: lease reference + current status badge.
- Compact table, newest first:
  - Date/time (DD/MM/YYYY HH:mm, European format)
  - From → To (status badges)
  - Reason (e.g. `natural-expiry`, `notice-completed`, free text from termination, `backfill`)
  - Notes (truncated, tooltip for full)
  - Changed by (user name from profiles, or "—")
- Empty state: "No status changes recorded yet." (shouldn't appear after backfill).
- Footer: Close button.

### Inline summary on lease page
In the lease header card, under the status badge, show "Last change: <date> · <from → to>" as a small muted line linking to the history modal. Keeps the change discoverable without forcing the modal.

## i18n
Add EN/FR keys under `lease.statusHistory.*`: `title`, `columns.date/from/to/reason/notes/by`, `empty`, `lastChange`, `menuItem`, plus reason labels (`reason.naturalExpiry`, `reason.noticeCompleted`, `reason.terminated`, `reason.signatureCanceled`, `reason.backfill`).

## Technical notes
- Migration runs first (creates table + GRANTs + RLS + backfill insert).
- After migration, add `src/hooks/useLeaseStatusHistory.ts` (list + add) and the `<LeaseStatusHistoryDialog>` component.
- Wire the helper into the four call sites listed above; keep the existing override audit log untouched (it complements, not replaces, this log).
- No change to `leases` schema.

## Out of scope
- Editing/deleting log entries.
- Exporting the history.
- Logging non-status field changes (covered separately by amendments).
