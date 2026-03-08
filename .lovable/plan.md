

## Plan: Europe-First Property & Unit Management SaaS (Phase 1)

### Scope
Rebuild the app to focus exclusively on **Properties**, **Units**, and a **Dashboard**. Remove tenant/lease/payment routes from navigation and routing (keep files for future use). All data models, formatting, and UI rebuilt with Europe-first international logic.

---

### Data Layer Changes

**`src/types/index.ts`** — New Property and Unit types:
- **Property**: id, name, referenceCode, address1, address2, city, postalCode, countryCode (ISO 3166), locale, currencyCode, measurementSystem (metric|imperial), propertyType (residential|commercial|mixed-use), description, status (active|inactive), createdAt, updatedAt
- **Unit**: id, propertyId, unitCode, unitLabel, unitType (apartment|studio|office|parking|storage|house|commercial-unit), floor, surfaceArea, bedrooms, bathrooms, furnished, currentStatus (vacant|occupied|reserved|unavailable), baseRent, baseCharges, availableFrom, notes, createdAt, updatedAt

**`src/lib/formatters.ts`** — Locale-aware helpers:
- `formatCurrency(amount, currencyCode, locale)` — dynamic via `Intl.NumberFormat`
- `formatDate(dateStr, locale)` — locale-aware display
- `formatArea(value, system)` — "85 m²" or "915 sq ft"
- `getCountryName(countryCode, locale)` — via `Intl.DisplayNames`

**`src/data/mockData.ts`** — European portfolio:
- 5 properties: Paris (fr-FR/EUR), Brussels (fr-BE/EUR), Amsterdam (nl-NL/EUR), London (en-GB/GBP), Berlin (de-DE/EUR)
- ~18 units with mixed types/statuses, realistic European rents (€600–€3,500, £800–£2,500)

**`src/context/AppContext.tsx`** — Strip tenant/lease/payment state. Keep Property + Unit CRUD only.

---

### Navigation & Layout

**`src/components/layout/AppSidebar.tsx`** — 3 nav items: Dashboard, Properties, Units

**`src/components/layout/AppLayout.tsx`** — Enhanced top bar: app name left, search placeholder center, user avatar placeholder right

**`src/App.tsx`** — Routes: `/`, `/properties`, `/properties/:id`, `/units`, `/units/:id`. Remove tenant/lease/payment routes.

**`src/components/shared/StatusBadge.tsx`** — Add `reserved` (blue), `unavailable` (dark gray), `inactive` (gray) status styles

---

### Pages

**Dashboard** (`src/pages/Dashboard.tsx`):
- 8 KPI cards: Total Properties, Total Units, Occupied, Vacant, Reserved, Unavailable, Occupancy Rate %, Units Available Soon (within 30 days)
- Recent Units table (last 8 by updatedAt)
- Vacancy Overview by property (name, total, vacant, occupancy %)
- Units by Status visual bar

**Properties List** (`src/pages/Properties.tsx`):
- Professional table: name, reference, city, country, type, units count, occupancy summary, status badge, actions (view/edit)
- Search (name/reference/city), filters (type, status), "Add Property" button
- Empty state, no-results state

**Property Detail** (`src/pages/PropertyDetail.tsx`):
- Header: name, reference, full address with country, type/status badges, edit button
- 6 KPI cards: total, occupied, vacant, reserved, unavailable, occupancy rate
- Units table with currency formatted per property settings
- Description/notes panel

**Units List** (`src/pages/Units.tsx` — NEW):
- Global cross-property table: unit code, label, property, type, floor, surface (m²/sq ft per property), rent, charges, status, available from, actions
- Search, filters (property, type, status), "Add Unit" button

**Unit Detail** (`src/pages/UnitDetail.tsx` — NEW):
- Header with status badge and property link
- Main info card (type, floor, surface, bedrooms, bathrooms, furnished, available from)
- Financial defaults card (rent, charges — formatted per parent property currency)
- Occupancy card with placeholder: "Tenant and lease management coming soon"
- Notes section, created/updated timestamps

---

### Forms

**Property form (Dialog)**: name*, referenceCode*, address1*, address2, city*, postalCode, countryCode* (dropdown with European countries), propertyType*, currencyCode* (EUR/GBP/CHF/SEK/etc.), locale* (auto-suggested from country), measurementSystem*, description, status. Validation on required fields.

**Unit form (Sheet)**: property* (dropdown), unitCode*, unitLabel*, unitType* (dropdown), floor, surfaceArea, bedrooms, bathrooms, furnished (switch), currentStatus*, baseRent, baseCharges, availableFrom (date), notes. Validation on required fields.

---

### Files Summary

| Action | File |
|--------|------|
| Rewrite | `types/index.ts`, `data/mockData.ts`, `context/AppContext.tsx`, `lib/formatters.ts` |
| Rewrite | `shared/StatusBadge.tsx`, `layout/AppSidebar.tsx`, `layout/AppLayout.tsx` |
| Rewrite | `pages/Dashboard.tsx`, `pages/Properties.tsx`, `pages/PropertyDetail.tsx` |
| Create | `pages/Units.tsx`, `pages/UnitDetail.tsx` |
| Modify | `App.tsx` (routes only) |

