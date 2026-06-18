# Property Owners as Reusable Entities

Today the owner is a free-text `ownerName` string on each property. We'll turn it into a first-class, reusable record that any property can link to (one or many).

## Data model

New table `property_owners` (per portfolio):
- `name` (text, required)
- `type` (enum: `individual` | `corporation`, required)
- standard fields: `id`, `portfolio_id`, `created_at`, `updated_at`

Linking: many-to-many via new table `property_owner_links`:
- `property_id`, `owner_id`, `portfolio_id`
- unique on (`property_id`, `owner_id`)

`properties.ownerName` becomes legacy/optional. We keep the column for back-compat reads but the UI stops writing to it; existing values can be displayed as a fallback when a property has no linked owners. (We won't auto-migrate free-text values into real owner records — too risky to dedupe blindly. A small "import legacy owners" affordance can be added later if needed.)

## UI changes

**Property create/edit dialog** (`Properties.tsx`, `PropertyDetail.tsx`):
- Replace the single "Owner" text input with a multi-owner picker:
  - Searchable dropdown listing all owners in the portfolio (name + type chip).
  - Selecting an owner adds it as a chip; chips can be removed.
  - "+ Create new owner…" entry at the bottom of the dropdown (and when the search has no match) opens a small inline sub-dialog with two fields: **Name**, **Type** (Individual / Corporation). On save the new owner is created and auto-selected.

**Properties list page** (`Properties.tsx`):
- Owner column shows the linked owner names (comma-separated, truncated with tooltip if many). Falls back to legacy `ownerName` when no links exist.
- Add a new **Owner** multi-select filter in the existing filter row (using `MultiSelectFilter`, same pattern as other filters). Filtering matches properties whose linked owners include any selected owner.
- Search bar also matches linked owner names.

**Property detail page**:
- "Owner" row in the summary card lists linked owner names.

No dedicated Owners management page in this iteration — owners are managed inline from the property dialog. (Happy to add a Settings → Owners page later if you want full CRUD / merge.)

## Scope kept out
- No deletion/merge of owners (can be added later; would need integrity checks: block delete if linked to any property).
- No edit of an owner's name/type from the property dialog (only create + select). Edits can come with a future Owners admin page.
- No migration of existing free-text `ownerName` values into the new table.

## Technical notes
- New tables follow the standard 4-step migration (CREATE → GRANT to authenticated + service_role → ENABLE RLS → portfolio-member policies mirroring other tables), plus `updated_at` triggers.
- `repo` adds `propertyOwners` and `propertyOwnerLinks` loaders + mirror writes; `AppContext` exposes `propertyOwners`, `createPropertyOwner`, `setPropertyOwners(propertyId, ownerIds[])`, plus `getOwnersForProperty(propertyId)`.
- New types `PropertyOwner` and `PropertyOwnerLink` in `src/types/index.ts`.
- New component `src/components/properties/PropertyOwnersPicker.tsx` (search + chips + inline create) reused by the create and edit flows.
- i18n keys added for both EN and FR (`properties.owners`, `properties.owner.type.individual`, `…corporation`, `properties.owners.create`, etc.).
- No changes to costs/leases/profitability logic.
