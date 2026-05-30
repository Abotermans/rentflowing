## Lease Lifecycle — Conceptual Model

Today the system has 4 raw `leaseStatus` values (`draft | active | ended | terminated`) and a `noticeGiven` flag, but the semantics, the required data, and the bidirectional sync with the unit are inconsistent. This plan formalises the lifecycle, fills the gaps, and makes the unit ↔ lease relationship symmetric.

### Canonical lifecycle

```text
draft ──activate──► active ──give notice──► active+notice ──move-out──► ended (natural)
                      │                           │
                      │                           └──cancel notice──► active
                      ├──terminate (early/breach)──► terminated
                      └──reach endDate─────────► overdue → user picks: end | renew | terminate
```

**Definitions (made explicit, currently ambiguous):**
- **Ended** = lease reached its planned end (natural expiry, mutual non-renewal, or after a notice period). Closed in the normal way.
- **Terminated** = early/forced closure before the planned end (breach, eviction, mutual early agreement, force majeure). Always requires a reason.
- **Notice** = announcement that the lease will end on `intendedMoveOutDate`. Lease stays `active` until move-out is confirmed; then it auto-flows to `ended`.

### Gaps identified in current code

1. `handleMarkEnded` / `handleMarkTerminated` mutate `leaseStatus` **without writing `endDate`** and without touching the unit status.
2. `confirmMoveOut` correctly ends the lease and frees the unit, but **does not update `endDate`** to the actual move-out date.
3. Unit → Lease direction is missing: `Make Vacant` on a unit does not end the active lease, does not register an end date, and does not open the move-out flow.
4. No proactive surfacing when `endDate < today` and lease is still `active`.
5. No `Renew` action — only end / terminate.
6. No reason captured for `ended` (mutual non-renewal vs natural expiry).
7. Notice cancellation is not exposed.

---

## Changes

### 1. Lease end actions require an end date + reason

`LeaseDetail.tsx` — replace the silent `handleMarkEnded` / `handleMarkTerminated` with two dialogs:

- **End Lease dialog**
  - `endDate` (required, defaults to `moveOutActualDate ?? intendedMoveOutDate ?? today`)
  - `endReason` (select: `natural-expiry | mutual-non-renewal | notice-completed | other`)
  - `notes` (optional)
  - On save: `leaseStatus = "ended"`, `endDate = chosen`, plus unit sync (see §4).

- **Terminate Lease dialog**
  - `endDate` (required, defaults to today)
  - `terminationReason` (required, free text or select: `breach | mutual-early | force-majeure | eviction | other`)
  - `notes` (optional)
  - On save: `leaseStatus = "terminated"`, `endDate = chosen`, unit sync.

Both dialogs run the existing integrity check (`canChangeLeaseStatus`) and feed the override flow when blocked.

### 2. `confirmMoveOut` writes the end date

`AppContext.confirmMoveOut` — also set `endDate: moveOutActualDate` so the lease record stays internally consistent. Unit currently goes to `vacant` (already correct).

### 3. Overdue-end detection + suggested actions

`getLeaseLifecycleStatus` — add a new derived state `overdue-end` when `leaseStatus === "active" && endDate < today && !noticeGiven`. Render a prominent banner on `LeaseDetail` (and a row badge on `Leases.tsx`) offering three actions:
- **Mark as Ended** → opens End dialog (§1)
- **Renew Lease** → opens new Renew dialog (§5)
- **Terminate** → opens Terminate dialog (§1)

This banner uses the existing `StatusTransitionAlert` styling pattern.

### 4. Bidirectional Lease ↔ Unit sync

**Lease → Unit** (when lease becomes `ended` or `terminated`):
- If unit is `occupied` / `reserved` and no other active lease references it → set unit `currentStatus = "vacant"`, `availableFrom = endDate`.
- If a move-out has not been recorded, prompt the user inside the End/Terminate dialog: checkbox "Also free the unit and start move-out" (default on) → opens move-out flow pre-filled with `endDate`.

**Unit → Lease** (when user clicks `Make Vacant` on a unit with an active lease):
- Today `handleMakeVacant` in `UnitDetail.tsx` only changes the unit. Update it to detect the active lease and instead open an **"End Lease + Move-Out" combined dialog**:
  - Show the affected lease, prompt for `endDate`, `endReason`, then run `confirmMoveOut` (which now writes `endDate`, ends lease, frees unit).
- If no active lease exists, behaviour is unchanged.

Centralise the sync in a new helper `src/lib/lifecycle/leaseUnitSync.ts` with:
- `endLeaseAndSyncUnit(lease, { endDate, reason, freeUnit })`
- `vacateUnitAndEndLease(unit, { endDate, reason })`

These call the existing context mutators so integrity checks and override flow stay intact.

### 5. Renew action

New dialog on `LeaseDetail`:
- `newEndDate` (required, > current `endDate`)
- Optional: adjust `monthlyRent`, `monthlyCharges`, `rentFormula`
- On save: extend the same lease (update `endDate`, optionally rent fields), keep status `active`. No new lease record in this pass (avoids cascading guarantees/receivables migration).

### 6. Notice cancellation

Add a "Cancel Notice" button next to the existing notice banner when `noticeGiven === true && !moveOutActualDate`. Clears `noticeGiven`, `noticeDate`, `intendedMoveOutDate`, `terminationReason`.

### 7. Integrity rules update

`leaseIntegrity.ts`:
- `canChangeLeaseStatus("ended" | "terminated", …)` — require `endDate` to be provided by the caller (validated in the dialog before submit, not in the rule itself; rule keeps current warning-based behaviour).
- Add `canRenewLease(leaseId, newEndDate, s)` — blocks if lease is not `active`, warns if `noticeGiven`, blocks if `newEndDate <= currentEndDate`.

`unitIntegrity.ts`:
- `canMakeUnitVacant` — when an active lease exists, return a warning recommending the combined End+Move-Out flow (not a blocker; the new UI will route the user there).

### 8. Types & translations

- `src/types/index.ts` — extend `LeaseLifecycleStatus` with `"overdue-end"`; add optional `endReason: "natural-expiry" | "mutual-non-renewal" | "notice-completed" | "other" | null` on `Lease`.
- `src/i18n/translations.ts` — new keys: `lease.endDialog.*`, `lease.terminateDialog.*`, `lease.renewDialog.*`, `lease.overdueEndBanner.*`, `lease.endReason.*`, `lease.cancelNotice`, `unit.vacantWithActiveLease.*`.
- `StatusBadge` — add `overdue-end` style (amber, like `ending-soon` but stronger).

---

## Out of scope (kept simple on purpose)

- No renewal as a brand-new lease record (only date extension).
- No automatic prorated invoicing on early termination — left to manual adjustments.
- No bulk lifecycle actions on `Leases.tsx` list.
- No backend / DB changes (project is mock-data front-end).
- No changes to guarantees release flow (already covered by existing move-out checklist).

---

## Files touched

- `src/types/index.ts` — `LeaseLifecycleStatus`, `Lease.endReason`, helper update.
- `src/context/AppContext.tsx` — `confirmMoveOut` writes `endDate`; new `endLease`, `terminateLease`, `renewLease`, `vacateUnitAndEndLease` actions delegating to new helper.
- `src/lib/lifecycle/leaseUnitSync.ts` *(new)* — centralised bidirectional sync.
- `src/lib/integrity/leaseIntegrity.ts` — add `canRenewLease`, tighten end/terminate guidance.
- `src/lib/integrity/unitIntegrity.ts` — `canMakeUnitVacant` warning when active lease exists.
- `src/pages/LeaseDetail.tsx` — replace plain buttons with End / Terminate / Renew / Cancel-Notice dialogs; overdue-end banner.
- `src/pages/UnitDetail.tsx` — `Make Vacant` routes through combined End-Lease dialog when an active lease exists.
- `src/pages/Leases.tsx` — show `overdue-end` badge + quick action in row.
- `src/components/shared/StatusBadge.tsx` — `overdue-end` variant.
- `src/i18n/translations.ts` — new keys (EN + FR).
