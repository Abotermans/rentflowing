# Kebab menu + Archive on Unit detail

## Goal
On `/units/:id`, the Delete button is too prominent. Demote it into a 3-dot (kebab) menu in the top-right header, alongside a new **Archive** action. Introduce an **Archived** status for units so archived units are visually distinguished and excluded from active operations.

## UI changes — `src/pages/UnitDetail.tsx`

Header right side becomes:
- `Create Lease` (primary, when no active lease + status is `vacant`/`reserved`) — unchanged
- `Make Vacant` (outline) — unchanged
- **Kebab menu** (`MoreVertical` icon, ghost icon button) containing:
  - `Archive` (or `Unarchive` if already archived)
  - `Delete` — opens the existing `DeleteDialog`

The standalone Delete button is removed; the dialog is triggered from the menu item via the `trigger` prop of `DeleteDialog`.

Archived units:
- Show the new "Archived" status badge in the header.
- Hide `Create Lease` and `Make Vacant` buttons (only Unarchive + Delete remain in the kebab).

## Data model — `src/types/index.ts`
Extend `UnitStatus`:
```ts
export type UnitStatus = "vacant" | "occupied" | "reserved" | "unavailable" | "archived";
```

## Status badge — `src/components/shared/StatusBadge.tsx`
- Add `"archived"` to the `StatusType` union.
- Style: `bg-muted text-muted-foreground border-border` with reduced opacity (visually muted, similar to `unavailable` but distinct — e.g. dashed border or italic label).
- Add label mapping → new i18n key `status.archived` ("Archived" / "Archivé").

## Integrity — `src/lib/integrity/unitIntegrity.ts`
Extend `canChangeUnitStatus` for `targetStatus === "archived"`:
- Block if any active lease exists (must be vacated first).
- Block if there are open receivables (warning + block with override allowed).
- Otherwise allow.

Add a small helper `canArchiveUnit(unitId, s)` that wraps the above for the action handler.

Unarchive = set status back to `vacant` (same rules as vacate, which already exist).

## Status select in edit dialog
Add `archived` to `UNIT_STATUSES` and `UNIT_STATUSES_NO_LEASE` so it can be set from the edit form too (mirrors the kebab action).

## Filtering existing lists
`Units.tsx`, `PropertyDetail.tsx` and dashboards already filter by status. Add an "Archived" entry to the unit-status filter dropdown but **exclude archived units by default** from the main list and KPIs (toggle "Show archived" in the filter). Occupancy KPIs ignore archived units entirely (treat like `unavailable` — not counted in vacancy rate).

## i18n — `src/i18n/translations.ts`
New keys (EN/FR):
- `status.archived` — "Archived" / "Archivé"
- `units.archiveAction` — "Archive" / "Archiver"
- `units.unarchiveAction` — "Unarchive" / "Désarchiver"
- `units.archiveBlocked` — "Cannot archive: …" / "Impossible d'archiver : …"
- `units.toastArchived`, `units.toastUnarchived`
- `units.moreActions` — "More actions" / "Plus d'actions" (kebab aria-label)
- `units.showArchived` — "Show archived" / "Afficher les archivés"

## Out of scope
- No DB/backend changes (mock data only).
- No bulk-archive UI.
- `PropertyDetail.tsx` per-unit row actions are unchanged in this pass — only the unit detail page header gets the kebab.
- Archive on tenants/leases/properties not included.
