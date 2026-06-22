## Goal

Reshape the "Register notice" flow on the lease detail page so it captures the **new lease end date** instead of the intended move-out date, and propagate that end date to the lease and to every assigned unit. Cancelling the notice restores the previous end dates.

## Changes

### 1. Notice dialog (`src/pages/LeaseDetail.tsx`)

- Rename the second field from "Intended move-out date" to "New end date" (new translation key, e.g. `leaseDialog.newEndDate`).
- Default value computation:
  - When opening the dialog (or when the user edits the notice date), compute `noticeDate + noticePeriod` using the existing `parseNoticeText` helper (`src/lib/noticePeriod.ts`) and the lease's effective `noticePeriodText`.
  - Pre-fill the field with this computed value if the field is empty or was previously auto-derived; never overwrite a value the user has manually edited.
  - User can freely modify the date.
- Validation: new end date must be ≥ notice date and (soft) ≥ today. Keep existing reason field.

### 2. Save notice handler (`handleSaveNotice`)

- Persist `noticeGiven`, `noticeDate`, `terminationReason` as today.
- New behaviour:
  - Capture the current `lease.endDate` into a new field `preNoticeEndDate` (only if not already set, so editing the notice twice keeps the original).
  - Set `lease.endDate = newEndDate`.
  - Clear `intendedMoveOutDate` (legacy) or set it equal to the new end date for backwards display compatibility — pick clearing.
  - Update every assignment of this lease in `leaseUnitAssignments` to set `endDate = newEndDate` (overwrite regardless of existing value, including currently-open `null` assignments). This requires a small helper in `AppContext` (e.g. `setLeaseUnitsEndDate(leaseId, endDate)`) that updates all assignments where `leaseId` matches, mirrors via `mirror.update`, and bumps `updatedAt`.
- Toast unchanged.

### 3. Edit notice

- Same dialog reused. When already under notice, pre-fill `nNewEnd` with current `lease.endDate`. Saving overwrites lease end date + unit end dates again (no second snapshot of `preNoticeEndDate`).

### 4. Cancel notice (`handleCancelNotice`)

- Restore `lease.endDate` from `preNoticeEndDate` (fallback: keep current if absent).
- Restore every assignment's `endDate` to `preNoticeEndDate` value (use the same helper).
- Clear `noticeGiven`, `noticeDate`, `terminationReason`, `preNoticeEndDate`, and `intendedMoveOutDate`.

### 5. Banner

- The "Under notice" banner currently shows the intended move-out date. Replace with the new lease end date (`{t("detail.newEndDate")}: …`).

### 6. Types & storage

- Add `preNoticeEndDate?: string | null` to the lease type in `src/types/index.ts`.
- Add the new helper to `AppContext` (signature, mirror upsert, exported in `useAppData`).
- Add a Supabase migration to add `pre_notice_end_date` column on `leases` and (no schema change needed for `lease_unit_assignments` — `end_date` already exists). Existing repo/mirror mapping for `leases` needs the new column wired.

### 7. i18n

- Add keys (EN/FR): `leaseDialog.newEndDate`, `detail.newEndDate`, `validation.dates.newEndBeforeNotice`.
- Keep legacy `leaseDialog.intendedMoveOut` for any remaining usage.

## Technical notes

- `parseNoticeText` returns `{ value, unit }` where unit ∈ days/weeks/months/years. Implement an `addNoticePeriod(date, value, unit)` util in `src/lib/noticePeriod.ts` returning an ISO date string.
- Validation reuses `validateDateOrder` (`src/lib/dateValidation.ts`).
- Auto-derivation should only fire when the user has not manually touched the new-end-date input — track via a `userEditedRef`/state flag.

## Out of scope

- Lease renewal flow (separate code path).
- Multi-unit per-unit independent end dates on notice — the user confirmed all units adopt the new lease end date.
- Receivable/charge recalculation triggered by the end date change.
