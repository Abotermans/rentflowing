## Goal

Make the lease lifecycle reflect the real-world contract flow:

```text
draft → pending-signature → signed → active → ended
                       ↑                ↘
                       └── cancel        terminated (manual)
```

Status changes happen automatically based on dates; the user only triggers the contractual milestones (send for signature, mark signed, cancel back to draft, terminate, manage move-out after ended).

## Lifecycle changes

Extend `LifecycleStage` in `src/types/index.ts`:

- `draft` — being edited; minimal validation; no operational actions.
- `pending-signature` (new) — finalized contract sent to tenants for signature.
- `signed` (new) — signed but start date not yet reached.
- `active` — start date ≤ today ≤ end date (auto-promoted from `signed`).
- `ended` — end date passed naturally OR user marked ended. Contract no longer renews, but operational tasks (move-out, guarantee release, charges reconciliation, final receipts/adjustments) remain open.
- `terminated` — early termination (unchanged).

Update `getLeaseStatus()` to keep its current display logic and add `pending-signature` / `signed`. `under-notice` and `overdue-end` remain display-only overlays.

### Auto-transition rules (lib helper `advanceLeaseLifecycle`)

Pure function, run on lease load / mutation:

- `signed` + `startDate ≤ today` → `active`
- `active` + `endDate < today` → `ended` (keep notice/move-out data intact)

Apply via the existing `loadPortfolio` hydration and on lease updates so the UI is always consistent without a cron.

### Manual transitions / actions per stage

| Stage              | Allowed transitions                       | Primary buttons                                       |
| ------------------ | ----------------------------------------- | ----------------------------------------------------- |
| draft              | → pending-signature                       | "Send for signature" (replaces "Activate")            |
| pending-signature  | → draft (cancel), → signed                | "Mark signed", "Cancel back to draft"                 |
| signed             | → active (auto), → terminated             | (waits for start date)                                |
| active             | → ended, → terminated, renew              | as today                                              |
| ended              | → terminated (only if not fully closed)   | move-out, guarantee release, reconciliation actions   |
| terminated         | terminal                                  | move-out, guarantee release, reconciliation actions   |

Update `ALLOWED_TRANSITIONS` in `src/pages/Leases.tsx` accordingly.

### Action gating

Currently the "Record cash receipt" and "Register notice" buttons are always visible (header in `LeaseDetail.tsx` lines 578-585). New rules:

- **Record cash receipt**: hidden when stage is `draft` or `pending-signature`. Visible from `signed` onward (including `ended` / `terminated` so leftover balances can be settled).
- **Register notice**: hidden when stage is `draft` or `pending-signature`. Visible on `signed` and `active` (today's behavior plus `signed`).
- **Move-out, guarantee, reconciliation, amendments**: remain available on `ended` and `terminated` (already true for most; verify the `lease.lifecycleStage !== "active"` checks in `LeaseDetail.tsx` lines 580 & 695 don't hide them inappropriately — relax to "not draft / pending-signature").

### Activation validations

`canActivateLease()` in `leaseIntegrity.ts` becomes the validator for the `draft → pending-signature` transition (rename internally to `canSendForSignature`, keep the structural checks: ≥1 tenant, ≥1 unit, property/unit consistency, no overlap).

- Drop the `LEASE_UNSIGNED` warning (line 80) — signing is the next stage, not a warning on draft.
- Add a new `canMarkSigned()` validator: requires `signedDate` to be set (prompt the user in a small dialog when they click "Mark signed", default = today).

`canChangeLeaseStatus()`: extend switch with cases for `pending-signature` and `signed`. `terminated` becomes reachable from `signed`, `active`, and `ended` (with warnings for residual open items).

### "Cancel" from pending-signature

New action `cancelSignature()` that sets `lifecycleStage = "draft"` and clears `signedDate`. No data loss otherwise. Confirmation dialog.

## UI changes

- `src/types/index.ts`: extend `LifecycleStage`, `LeaseStatus`, update `getLeaseStatus()`.
- `src/components/shared/StatusBadge.tsx`: add color + i18n keys for `pending-signature` and `signed` (e.g. amber and blue).
- `src/i18n/translations.ts`: add status labels EN/FR plus new action labels ("Send for signature", "Mark signed", "Cancel signature").
- `src/pages/LeaseDetail.tsx`:
  - Replace "Activate" dropdown item with stage-appropriate primary action ("Send for signature" on draft, "Mark signed" on pending-signature, "Cancel back to draft" on pending-signature).
  - Gate header buttons (cash receipt, notice) on stage.
  - Replace the activation blocker panel block (lines 638-644) so it shows for both `draft` (against `canSendForSignature`) and `pending-signature` (against `canMarkSigned`), without the unsigned warning.
- `src/pages/Leases.tsx`: update `ALLOWED_TRANSITIONS`, filter chips (add the two new statuses), and the status select inside the lease form dialog.
- `src/lib/repo/index.ts`: call `advanceLeaseLifecycle` on hydrate so leases auto-roll to `active`/`ended` whenever the app loads.

## Database

Add a migration that widens the `leases.lifecycle_stage` text values (no enum today — it's a free string column per current schema, to verify). No data backfill needed since existing rows keep their `draft`/`active`/`ended`/`terminated` values. If a CHECK constraint exists, expand it to include `pending-signature` and `signed`.

## Out of scope

- Background scheduler for date-driven transitions (we recompute on read, which is sufficient for an interactive app).
- Changing how amendments, receivables, or move-out flows themselves work.
- New columns; `signedDate` already exists and is reused.
