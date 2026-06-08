## Goal

Make the amendment ("avenant") workflow consistent, date-driven, and fully integrated with the parent lease — so amendments behave like a true lifecycle artifact whose active state always governs current lease terms, receivables, and edit controls.

## Findings from the audit

1. **Row vs modal mismatch** — the row shows `Schedule` / `Activate` / `Revert` / `Terminate` icons, but the modal only offers `Save Draft / Schedule / Activate`. Status transitions diverge.
2. **No date-driven activation logic for new amendments** — `addAmendment` always uses the chosen status as-is. If a user creates a `scheduled` amendment with a past effective date, it stays scheduled until the next 60s tick of the `useEffect` in `AppContext` (and only if effective date ≤ today).
3. **Active lease invariant not enforced** — there is no rule that an `active` amendment must have `effectiveDate ≤ today`. The dialog lets `Activate` fire on a future date.
4. **Mandatory data for scheduling not enforced** — `scheduleAmendment` only checks `effectiveDate`. The dialog gates by `title + effectiveDate` but not by structural validity (`liveValidation.allowed`).
5. **Save actions stay visible after activation** — opening an active amendment still shows `Save Draft` / `Schedule` / `Activate`. There is no read-only / "edit blocked" state.
6. **Activate button always rendered** — even when the amendment is already `active`.
7. **Previous amendment supersession works in `activateAmendment`** but only via row icon; doing it from the dialog (`save("active")` calls `activateAmendment` only on existing rows whose previous status was not active — newly created `active` amendments correctly call it, but the supersession path from the dialog is fine — the issue is UX: no warning surfaced as a confirmation.
8. **`terminateAmendment` exists** and is exposed as a row icon — user wants it removed (terminating an amendment is conceptually wrong; lease termination handles it).
9. **No confirmation modal** before Schedule/Activate listing all new terms and their consequences.
10. **Receivables are not regenerated** when an amendment activates. `generateLeaseReceivables` reads `lease.monthlyRent / monthlyCharges / endDate` (set at lease creation); activating an amendment updates assignments + `getEffectiveLeaseTerms` but never re-emits future receivables nor mutates the lease record.
11. **Lease record fields drift** — `lease.endDate`, `lease.monthlyRent`, `lease.monthlyCharges`, `lease.depositOrGuaranteeAmount`, `lease.noticePeriodText`, `lease.coTenantIds` are not updated on activation, even though the rest of the app (lease list, summary, KPIs, cycles) reads them directly.

## Plan

### 1. Single source of truth for status transitions

Add small helpers in `src/lib/amendments.ts`:

- `canSchedule(am, changes, state)` → boolean + reason. Requires `title`, `effectiveDate`, at least one change, and `validateAmendment(...).allowed`.
- `canActivate(am, ..., today)` → as above, plus `effectiveDate ≤ today`.
- `isAmendmentEditable(am)` → only `draft` and `scheduled` are editable.

Use these from both `AmendmentDialog` and `AmendmentsSection` so the row and the modal always agree.

### 2. Tighten `AppContext` actions

- `scheduleAmendment(id)`: also require at least one change row and validation passing (use shared helper). On success, if `effectiveDate ≤ today`, immediately call `activateAmendment(id)` (date-driven auto-activation, no waiting for the 60s tick).
- `activateAmendment(id)`: reject if `effectiveDate > today` with reason. Already supersedes previous active — keep.
- `addAmendment`: when the caller asks for `status: "active"` but date is future, downgrade to `scheduled` (and vice-versa: if `scheduled` with date ≤ today, auto-activate after insert).
- Remove `terminateAmendment` from the public context surface (and the row).
- Keep `revertAmendmentToDraft` available only for `scheduled` (already the case).
- After `activateAmendment` succeeds, mirror the new effective terms onto the parent `Lease` record (`monthlyRent`, `monthlyCharges`, `endDate`, `depositOrGuaranteeAmount`, `noticePeriodText`, `primaryTenantId`, `coTenantIds`) and **regenerate forward-dated receivables** (drop unpaid future receivables for this lease, re-run `generateLeaseReceivables` with the new lease snapshot, keep past/paid untouched). This makes amendment activation the single event that propagates new terms to billing.

### 3. Dialog UX

In `AmendmentDialog`:

- Compute `isEditable = isAmendmentEditable(existing)`. When false, hide `Save Draft`, `Schedule`, `Activate` and show a single `Close` button plus an inline notice "Active amendments are read-only — create a new amendment to change terms."
- Buttons (when editable):
  - `Save Draft` — disabled if current status is `active`.
  - `Schedule` — disabled if status is `active`, or `!canSchedule()`.
  - `Activate` — hidden entirely if status is `active`; otherwise disabled when `!canActivate()` (this enforces past-or-today effective date).
- On `Schedule` or `Activate`, open a new **`AmendmentConfirmDialog`** (next section) before persisting.

### 4. New `AmendmentConfirmDialog`

A small modal that, given the draft, renders a before/after diff:

- Effective date, derived type, list of categories.
- For each changed field: previous value → new value (rent, charges, end date, deposit, notice, primary tenant, co-tenants, units added/removed, share changes).
- Consequences block:
  - "Previous active amendment #N will be ended."
  - "Future receivables from <effectiveDate> will be regenerated."
  - "Lease summary (rent, charges, end date, deposit) will update accordingly."
- Buttons: `Cancel`, `Confirm <Schedule | Activate>`.

Reused for both Schedule and Activate so the user always sees the consequences.

### 5. Row actions in `AmendmentsSection`

- Remove `Terminate` (XCircle) icon entirely.
- Hide `Activate` when status is already `active`.
- Edit icon opens the dialog in read-only mode for `active` / `ended` (so the row and the modal stay consistent).
- Quick-action `Schedule` / `Activate` from the row also goes through `AmendmentConfirmDialog`.
- Replace the `window.confirm` for activation with the new modal.

### 6. Receivables + lease propagation (technical)

In `AppContext.activateAmendment` after the assignment updates and status flips:

```text
1. Build a synthetic lease snapshot from getEffectiveLeaseTerms(leaseId, eff).
2. setLeases: patch the lease record with new monthlyRent/monthlyCharges/endDate/
   depositOrGuaranteeAmount/noticePeriodText/primaryTenantId/coTenantIds.
3. setReceivableItems:
   - keep items with dueDate < eff OR allocatedAmount > 0 (paid/partly paid);
   - drop the rest;
   - regenerate via generateLeaseReceivables(patchedLease, {today: eff}) and
     append items with dueDate >= eff that don't already exist.
4. setAllocations / setCashReceipts unchanged.
```

This is the only place receivables get rewritten by an amendment, keeping the rest of the codebase unchanged.

### 7. Files to touch

- `src/lib/amendments.ts` — add `canSchedule`, `canActivate`, `isAmendmentEditable`.
- `src/context/AppContext.tsx` — tighten `scheduleAmendment`, `activateAmendment`, `addAmendment`; remove `terminateAmendment` from surface; propagate to lease + receivables; keep auto-tick for safety.
- `src/components/amendments/AmendmentsSection.tsx` — remove Terminate icon, hide Activate when active, route actions through the confirm dialog, open dialog read-only for non-editable.
- `src/components/amendments/AmendmentDialog.tsx` — read-only mode, button gating, route to confirm dialog.
- `src/components/amendments/AmendmentConfirmDialog.tsx` — **new** before/after + consequences modal.
- `src/i18n/translations.ts` — strings for the confirm dialog and the read-only notice (EN/FR).

### Out of scope

- No schema changes to `LeaseAmendment` / `LeaseAmendmentChange`.
- No changes to past/paid receivables — only forward billing is re-emitted.
- Lease-level termination workflow is untouched.

