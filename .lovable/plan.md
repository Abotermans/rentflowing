

## Plan: Unit Management Module

The foundation is solid — types, mock data, context CRUD, and formatters all exist. This is about building the UI layer and wiring it up.

---

### 1. Navigation & Routes

**`src/components/layout/AppSidebar.tsx`** — Add "Units" nav item (DoorOpen icon) after Properties.

**`src/App.tsx`** — Add routes: `/units` → Units, `/units/:id` → UnitDetail. Import both pages.

### 2. Units List Page (`src/pages/Units.tsx`)

Dense professional cross-property table with columns: unitCode, unitLabel, property name (linked), property referenceCode, city, unitType, floor, surface (formatted per property), baseRent (formatted per property), baseCharges, currentStatus badge, availableFrom, actions (view/edit/delete).

- Search: unitCode, unitLabel, property name, property referenceCode
- Filters: property (dropdown), country (dropdown), unitType, currentStatus
- "Add Unit" button opens a Sheet/Dialog with the unit form
- Edit opens the same form pre-filled
- Delete with confirmation dialog
- Empty state and no-results state

**Unit Form** (in Sheet): propertyId selector (mandatory), unitCode*, unitLabel*, unitType* dropdown, floor, surfaceArea, bedrooms, bathrooms, furnished (switch), currentStatus*, baseRent, baseCharges, availableFrom (date input), notes. Validation on required fields. Toast on success.

### 3. Unit Detail Page (`src/pages/UnitDetail.tsx`)

Already exists but needs enhancement:
- **Header**: unitCode, unitLabel, status badge, link to parent property, property referenceCode, edit button
- **Main info card**: unitType, floor, surfaceArea (formatted), bedrooms, bathrooms, furnished, availableFrom
- **Financial defaults card**: baseRent, baseCharges (formatted per property currency)
- **Occupancy card**: currentStatus with placeholder "Tenant and lease management coming in a future update"
- **Property context card** (NEW): property name, city, countryCode, locale, measurementSystem
- **Notes section**
- **Timestamps**: createdAt, updatedAt
- Add edit button that navigates back to units list or opens inline edit

### 4. Property Detail Update (`src/pages/PropertyDetail.tsx`)

- Add unit actions to the units table: view (link to `/units/:id`), edit, delete
- Add "Add Unit" button in the units section header
- Unit add/edit uses a Sheet with the unit form (propertyId pre-filled and locked)
- Delete with confirmation
- Remove the "phase placeholder" card — unit management is now live

### 5. Dashboard Update (`src/pages/Dashboard.tsx`)

Add below existing cards:
- **Recent Units table**: last 8 units by updatedAt (unitCode, unitLabel, property name, type, status, updated)
- **Vacancy Overview by Property**: table showing each property's name, total units, vacant count, occupancy %

Keep existing: 8 KPI cards, Units by Status bar, Portfolio by Country, Properties by Type, Portfolio Configuration.

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/App.tsx` — add unit routes |
| Modify | `src/components/layout/AppSidebar.tsx` — add Units nav |
| Create | `src/pages/Units.tsx` — full units list with CRUD |
| Rewrite | `src/pages/UnitDetail.tsx` — enhanced detail with property context |
| Modify | `src/pages/PropertyDetail.tsx` — add unit CRUD actions, remove phase placeholder |
| Modify | `src/pages/Dashboard.tsx` — add recent units + vacancy overview |

