

# Derived Occupancy Model

## Approach

Keep `unit.currentStatus` as the **availability dimension** (vacant, occupied, reserved, unavailable) but introduce a **derived occupancy state** computed from lease lifecycle and move-in/move-out data. The derived state becomes the source of truth for occupancy display, while the manual status is progressively constrained.

## New Module: `src/lib/occupancy.ts`

Pure function `getDerivedOccupancy(unitId, leases)` returning:

```ts
type DerivedOccupancy = 
  | "vacant"           // no active/draft lease
  | "move-in-pending"  // active lease, move-in scheduled but not completed
  | "occupied"         // active lease, move-in completed (or no move-in tracking)
  | "under-notice"     // active lease with noticeGiven=true
  | "move-out-scheduled" // active lease, move-out scheduled but not completed
  | "available-soon"   // under-notice or move-out-scheduled, with intended date

interface OccupancyInfo {
  derived: DerivedOccupancy;
  manualStatus: UnitStatus;
  inconsistent: boolean;        // manual vs derived don't align
  inconsistencyMessage?: string;
  activeLease?: Lease;
  availableFromDate?: string;   // derived from intended move-out or lease end
}
```

Logic:
- Find active lease for unit
- If no active lease → `vacant`
- If active lease + `noticeGiven` → `under-notice`
- If active lease + `moveOutScheduledDate` and no `moveOutActualDate` → `move-out-scheduled`
- If active lease + `moveInScheduledDate` but no `moveInActualDate` → `move-in-pending`
- Otherwise active lease → `occupied`

Inconsistency detection:
- manual=`vacant` but derived=`occupied` → inconsistent
- manual=`occupied` but derived=`vacant` → inconsistent
- manual=`reserved` but derived=`occupied` → inconsistent

Also export `getUnitOccupancyWarnings(unitId, leases)` returning warning strings.

## StatusBadge Updates

Add new status types: `"move-in-pending"`, `"move-out-scheduled"`, `"available-soon"` with appropriate styling.

## `getPropertyStats` Update (`AppContext.tsx`)

Change `getPropertyStats` to use derived occupancy for counts instead of manual `currentStatus`. This makes dashboard KPIs reflect lease reality.

## UI Changes

### Units List (`Units.tsx`)
- Import `getDerivedOccupancy` 
- Replace the status column: show derived occupancy badge as primary, show manual status as secondary small badge only if different
- Add a warning icon on rows where `inconsistent === true`
- Add `"available-soon"` date display when applicable
- Filter dropdown: add derived occupancy options

### Unit Detail (`UnitDetail.tsx`)
- Replace the single `StatusBadge` in the header with derived occupancy badge
- Show inconsistency warning alert when manual and derived don't align (using existing alert styling)
- Show `availableFromDate` prominently when under-notice

### Property Detail (`PropertyDetail.tsx`)
- Units table: show derived occupancy badge instead of manual status
- KPI cards already use `getPropertyStats` — they'll auto-update

### Property Detail unit form
- When derived occupancy is `occupied` or `under-notice`, disable switching to `vacant` (already handled by integrity layer's `canChangeUnitStatus`, but now show derived context)

## Files Summary

| File | Action |
|------|--------|
| `src/lib/occupancy.ts` | Create — derived occupancy logic |
| `src/components/shared/StatusBadge.tsx` | Modify — add new status types |
| `src/context/AppContext.tsx` | Modify — update `getPropertyStats` to use derived occupancy |
| `src/pages/Units.tsx` | Modify — show derived occupancy, inconsistency warnings |
| `src/pages/UnitDetail.tsx` | Modify — show derived occupancy in header + warning |
| `src/pages/PropertyDetail.tsx` | Modify — show derived occupancy in units table |

