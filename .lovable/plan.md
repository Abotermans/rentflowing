

## Plan: Phase 1 — Properties-Only Europe-First SaaS

The codebase is ~80% there. The key gaps are: missing `ownerName`/`regionOrState` fields, sidebar includes Units (should be Dashboard + Properties only), dashboard missing requested cards, property detail missing structured cards, properties list missing columns/filters.

---

### 1. Data Model Updates

**`src/types/index.ts`** — Add to Property interface:
- `ownerName: string`
- `regionOrState: string` (optional, can be empty string)
- Keep `address1`/`address2` field names (already correct)

Keep Unit type as-is (needed internally for stats even though Units pages are removed).

### 2. Mock Data Updates

**`src/data/mockData.ts`** — Add `ownerName` and `regionOrState` to each property:
- Paris: ownerName "SCI Rivoli Patrimoine", regionOrState "Île-de-France"
- Brussels: ownerName "Immo Terrasses SA", regionOrState "Bruxelles-Capitale"
- Amsterdam: ownerName "Keizersgracht BV", regionOrState "Noord-Holland"
- London: ownerName "Camden Property Ltd", regionOrState "Greater London"
- Berlin: ownerName "Friedrichstraße Verwaltung GmbH", regionOrState "Berlin"

### 3. Navigation — Remove Units

**`src/components/layout/AppSidebar.tsx`** — Remove Units nav item. Keep only Dashboard and Properties.

**`src/App.tsx`** — Remove `/units` and `/units/:id` routes. Remove imports.

### 4. Dashboard Enhancements

**`src/pages/Dashboard.tsx`** — Keep existing 8 KPI cards and Units by Status bar. Replace the two bottom cards with:
- **Recent Properties table**: last 5 properties by updatedAt (name, city, country, type, status, updated)
- **Portfolio by Country card**: group properties by countryCode, show count per country
- **Properties by Type card**: group by propertyType, show count per type
- **Portfolio Configuration Summary card**: list unique currencies, locales, measurement systems in use

### 5. Properties List Enhancements

**`src/pages/Properties.tsx`**:
- Add `ownerName` column to table
- Add `countryCode` filter dropdown (populated from EUROPEAN_COUNTRIES)
- Add `ownerName` to search filter logic
- Add `ownerName` field to the property form
- Add `regionOrState` field to the property form
- Update `emptyForm` with new fields

### 6. Property Detail Restructure

**`src/pages/PropertyDetail.tsx`**:
- Add structured **Overview card**: full address, ownerName, countryCode (display name), property type, status
- Add **Local Settings card**: locale, currencyCode, measurementSystem
- Add `ownerName` display in header area
- Keep existing KPI cards and units table
- Add placeholder card: "Unit management will be available in the next phase"
- Remove unit add/edit sheet (units not in scope for this phase's UI, but keep unit display as read-only for demo data)

Actually — the prompt says "DO NOT build yet: units pages". But PropertyDetail currently has inline unit management. I'll keep the units table as read-only display (no add/edit/delete) since units exist in mock data and the KPIs depend on them. Remove the unit form sheet and add/edit/delete actions.

### 7. Context — Add ownerName/regionOrState

**`src/context/AppContext.tsx`** — No structural changes needed, just ensure the Property type flows through. Already handles generic Property CRUD.

### 8. Formatters

Already complete — `formatCurrency`, `formatDate`, `formatArea`, `getCountryName` all exist and are locale-aware.

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/types/index.ts` — add ownerName, regionOrState |
| Modify | `src/data/mockData.ts` — add ownerName, regionOrState to all properties |
| Modify | `src/App.tsx` — remove unit routes |
| Modify | `src/components/layout/AppSidebar.tsx` — remove Units nav |
| Rewrite | `src/pages/Dashboard.tsx` — add 4 new cards |
| Modify | `src/pages/Properties.tsx` — add columns, filters, form fields |
| Rewrite | `src/pages/PropertyDetail.tsx` — structured cards, remove unit CRUD, keep read-only unit table |

