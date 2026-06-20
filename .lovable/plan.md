## Goal

When the "Show Move-in / Move-out section" toggle is OFF for the current portfolio (`showOccupancyOps === false`), suppress every Lease Detail banner element that exposes scheduled move-in / move-out dates or their actions. The "under notice" banner stays — only its move-out date details and move-out-related actions are hidden when the feature is off.

## Scope (file: `src/pages/LeaseDetail.tsx`)

1. **"Under notice" banner** (around line 927) — KEEP the banner; trim move-out concepts only.
   - `description`: when `showOccupancyOps === false`, render only the "noticeGivenOn {date}" segment. Drop the separator and the `t("detail.intendedMoveOut")` segment.
   - `actions`: leave Edit notice / Cancel notice as-is (they are notice actions, not move-out scheduling).

2. **`LEASE_NO_MOVE_IN` warning banner** (warnings rendered around lines 1007-1023; action mapped at lines 969-974)
   - In `renderIssueGroup`, filter the warnings list: `check.warnings.filter(w => showOccupancyOps || w.code !== "LEASE_NO_MOVE_IN")`.
   - If after filtering both blockers and warnings are empty, return `null` so no empty wrapper renders.
   - The `LEASE_NO_MOVE_IN` case in `issueAction` can stay; it is unreachable when filtered out.

## Out of scope

- No change to integrity logic (`leaseIntegrity.ts`) — the warning is still produced, just hidden in the UI when the feature is off.
- No change to other banners (no-tenants, no-units, deposit, signed-date, etc.).
- No change to Settings, translations, or `OccupancyOperationsSection` itself (already gated).

## Verification

- Toggle OFF, lease under notice with intended move-out: under-notice banner still shows, but the description shows only the notice date and no intended move-out date.
- Toggle OFF, lease with no scheduled move-in: "Move-in date not scheduled" warning and its Schedule move-in action no longer appear.
- Toggle ON: existing behavior unchanged.
- TypeScript check passes.
