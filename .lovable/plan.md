# Receivables: due-day-driven status & global lead time

Three coordinated changes so the lease's `dueDayOfMonth` truly drives when a receivable opens and when it goes overdue, and so the user can no longer create a lease without setting it.

## 1. Receivable due date = lease due day

Today every receivable is due on the cycle's `startDate` (always day 1 of the period). We'll instead use `lease.dueDayOfMonth` as the day-of-month for the due date.

In `src/lib/leaseReceivables.ts`:
- Replace `const dueDate = cycle.startDate;` with a computed date built from `cycle.startDate`'s year/month + `lease.dueDayOfMonth` (clamped to the month's last day so February stays valid).
- Keep `periodMonth` = cycle start month.
- `computeReceivableStatus` already flips to `overdue` when `dueDate < today`, so once the due date reflects the configured day, overdue is automatically driven by it. No change needed to the status helper.

## 2. Opening lead time moves to global Settings

Today lead time is `lease.advanceCycleLeadDays` (per-lease, advance billing only, default 15). We'll make it a single user-level setting that applies to ALL leases (monthly + advance).

- **SettingsContext** (`src/context/SettingsContext.tsx`): add `receivableLeadDays: number` + `setReceivableLeadDays`, persisted in `localStorage` under `app-receivable-lead-days` (default 15).
- **Settings page** (`src/pages/Settings.tsx`): add a numeric input "Open receivables N days before due date" bound to the new setting, with helper text.
- **i18n** (`src/i18n/translations.ts`): add EN/FR keys for the label + helper.
- **leaseReceivables.ts**:
  - Accept `leadDays: number` in `GenerateOptions` (required).
  - Drop the `isAdvance`-only gating; apply the horizon `today + leadDays` to BOTH monthly and advance leases (cycle 1 is still always emitted so future-dated leases keep a visible schedule).
  - Remove the read of `lease.advanceCycleLeadDays`.
- **AppContext** (`src/context/AppContext.tsx`): pull `receivableLeadDays` from `useSettings()` and pass it into every `generateLeaseReceivables` call (replaces the current per-lease `leadDays` calculation around line 326).
- **LeaseAddDialog / LeaseEditDialog**: remove the per-lease "Advance cycle lead days" input. Keep the field on the Lease type as deprecated/optional so legacy data doesn't break, but stop writing it from the UI.

## 3. Due day mandatory on lease creation

In `src/components/leases/LeaseAddDialog.tsx`:
- Initialize `dueDayOfMonth` as empty/undefined (instead of silently defaulting to 1) so the user must enter a value.
- Mark the field required in the form (asterisk on the Label).
- Add validation in the submit handler: if `dueDayOfMonth` is missing or not an integer between 1 and 28, block submit, focus the field, and show a toast/error message (reuse existing toast pattern). 1–28 keeps every month valid.
- Add the corresponding i18n error key.

`LeaseEditDialog` already requires the value implicitly (existing leases have one); we'll just add the same 1–28 validation for consistency.

## Technical notes

- Due-date computation helper (inline in `leaseReceivables.ts`):
  ```ts
  function cycleDueDate(cycleStart: string, dueDay: number): string {
    const [y, m] = cycleStart.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based -> day 0 of next month
    const day = Math.min(Math.max(dueDay, 1), lastDay);
    return `${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }
  ```
- Horizon comparison stays on `cycle.startDate` (the period start), NOT the new due date — opening N days before due would otherwise open the cycle AFTER the period already started for due days late in the month. Lead time is "open N days before the cycle starts" which, combined with the new due-date logic, gives a predictable "open early, overdue after configured day" behavior.
- Setting lives in `SettingsContext` (per-user, localStorage) to match how `locale` is stored today; no DB migration required.
- `advanceCycleLeadDays` on the Lease type is kept as optional/legacy for now (no migration), but no longer read or written.

## Files to change

- `src/lib/leaseReceivables.ts` — due date from `dueDayOfMonth`, lead days from options, drop per-lease lead.
- `src/context/SettingsContext.tsx` — add `receivableLeadDays`.
- `src/pages/Settings.tsx` — UI for the new setting.
- `src/i18n/translations.ts` — new EN/FR keys (setting label + validation error).
- `src/context/AppContext.tsx` — pass `receivableLeadDays` into generator.
- `src/components/leases/LeaseAddDialog.tsx` — mandatory due day + validation; remove per-lease lead days input.
- `src/components/leases/LeaseEditDialog.tsx` — remove per-lease lead days input; add 1–28 validation.
- `src/pages/Leases.tsx` — drop the `advanceCycleLeadDays: 15` seed if no longer needed.

## Out of scope

- No backend/DB migration (settings are local; receivables are recomputed client-side).
- No change to `computeReceivableStatus` itself — it already uses `dueDate < today`.
- Existing leases without an explicit due day keep their stored value; nothing to backfill.
