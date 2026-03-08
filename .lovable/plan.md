

# Build Round 2: Cost Entries, Allocation Rules & Allocations Pages

The data layer, types, allocation engine, and context CRUD are already in place from Round 1. What's missing are the UI pages that let users actually assign costs/taxes to properties and units and view allocation results.

## What will be built

### 1. Cost Entries page (`src/pages/CostEntries.tsx`)
The main page for recording charges and taxes against specific properties or units.

- **Table columns**: label, category (with nature badge), property, unit (or "Property-level"), frequency, amount, recovery type, allocation rule, status
- **Filters**: property, category, nature (charge/tax), recovery type, status
- **Create/Edit Sheet** with fields: category, property, unit (optional), label, description, frequency, start/end dates, amount, recovery type, allocation rule (shown only when no unit selected), vendor name, invoice reference, status, notes
- When a unit is selected → direct unit cost, no allocation rule needed
- When no unit selected → property-level, can attach an allocation rule
- On save, auto-runs allocation if property-level with a rule

### 2. Allocation Rules page (`src/pages/AllocationRules.tsx`)
Manage how property-level costs get distributed across units.

- **Table columns**: name, property, method, occupied-only flag, includes unavailable, actions
- **Create/Edit Sheet**: property, name, method selector, toggle flags, notes
- When method = `manual-percentage`: inline unit share editor listing all property units with percentage inputs; validates total = 100%

### 3. Allocations / Profitability page (`src/pages/CostsAllocations.tsx`)
Summary view showing allocation results and profitability impact.

- **KPI cards**: total charges, total taxes, owner-borne total, recoverable total
- **Property allocation table**: grouped by property, showing total costs, allocated amounts, owner vs recoverable split
- **Unit burden summary**: expandable per-property showing each unit's direct costs + allocated costs + total burden

### 4. Navigation & Routing updates
- **`src/App.tsx`**: Add routes for `/costs/entries`, `/costs/rules`, `/costs/allocations`; change `/costs` default to Cost Entries (the operational page)
- **`src/components/layout/AppSidebar.tsx`**: The `/costs` nav item stays; sub-navigation will be handled via tabs or the pages themselves
- **`src/i18n/translations.ts`**: Add any missing translation keys for the new pages

### 5. Sub-navigation within Costs module
Add a tab-style nav bar at the top of each costs page (Categories, Entries, Rules, Allocations) so users can navigate between the sub-pages — following a consistent pattern.

## Technical approach
- Follow the exact same patterns as `CostCategories.tsx` (Sheet-based CRUD, filters, StatusBadge, EmptyState)
- Use existing `useAppData()` functions: `addCostEntry`, `updateCostEntry`, `deleteCostEntry`, `addAllocationRule`, etc.
- Allocation results are already stored via `runAllocation()` in context — the Allocations page just reads `costAllocationResults`
- Property/unit lookups use existing `getPropertyById`, `getUnitById` helpers

