## Unit detail: header actions + on-demand dependencies modal

**File:** `src/pages/UnitDetail.tsx`

### 1. Header action toolbar (top right)
Add a button group in the existing page header, right-aligned:
- **Create Lease** — `default` variant, `Plus` icon. Shown only when there is no active lease AND status is `vacant`/`reserved`. Navigates to `/leases?new=1&unitId={unit.id}`.
- **Make Vacant** — `outline` variant. Shown when status ≠ `vacant` AND no active lease. Calls `canChangeUnitStatus(unit.id, "vacant", state)`; on success updates the unit, on block opens `OverrideConfirmDialog`.
- **Delete** — `destructive` variant, `Trash2` icon. Uses shared `<DeleteDialog entityType="unit" entityId={unit.id} entityLabel={unit.unitCode} onDelete={...} />`. On confirmed delete: `deleteUnit(id)` then `navigate("/units")`.

### 2. Remove always-visible dependencies card
Delete the `<IntegritySummaryPanel title="Unit Dependencies" .../>` block and its now-unused imports (`IntegritySummaryPanel`, `canDeleteUnit`, `getUnitIntegrityWarnings`).

### 3. Dependencies modal on Delete
No new component needed — `DeleteDialog` already runs `getDeletionImpact` on open and renders a blocking `AlertDialog` listing each dependency with the recommended "Mark unavailable instead" action when deletion is blocked.

### Out of scope
- The amber occupancy reconciliation `Alert` stays where it is (separate concern).
- No changes to integrity logic, `DeleteDialog`, or other pages.
