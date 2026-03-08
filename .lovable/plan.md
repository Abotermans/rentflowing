

# Costs & Taxes Module — Implementation Plan

## Overview
Add a full Costs & Taxes module to the property management app: cost categories, cost entries, allocation rules, allocation results, and profitability views. All data is mock/in-memory following the existing AppContext pattern.

## Implementation Phases

Given the scope, this will be split into **3 implementation rounds**:

### Round 1 — Data Layer + Navigation + Cost Categories Page
**Files to create/edit:**

1. **`src/types/costs.ts`** — All new types:
   - `CostCategory` (id, code, name, nature, scope, recoveryTypeDefault, description, isActive, timestamps)
   - `CostEntry` (id, categoryId, propertyId, unitId?, label, frequency, amount, currencyCode, isTax, recoveryType, allocationRuleId?, vendorName?, invoiceReference?, status, timestamps)
   - `AllocationRule` (id, propertyId, name, method, applyOnlyToOccupiedUnits, includeUnavailableUnits, notes, timestamps)
   - `AllocationRuleUnitShare` (id, allocationRuleId, unitId, percentageShare?, fixedAmountShare?, coefficient?)
   - `CostAllocationResult` (id, costEntryId, propertyId, unitId, allocatedAmount, recoveryType, recoverableAmount, ownerBurdenAmount, periodStart?, periodEnd?, timestamps)
   - Enums/unions: `CostNature`, `CostScope`, `RecoveryType`, `CostFrequency`, `CostEntryStatus`, `AllocationMethod`
   - Label maps for all enums

2. **`src/data/costsMockData.ts`** — Seed data:
   - ~5 cost categories (property tax, building insurance, common maintenance, unit repair, unit tax)
   - ~6 cost entries across properties p1/p2
   - 2 allocation rules (surface-area for p1, manual-percentage for p2)
   - Unit shares for manual-percentage rule
   - Pre-computed allocation results (~12-15 records)

3. **`src/lib/costAllocation.ts`** — Allocation engine:
   - `computeAllocations(costEntry, rule, units, unitShares?)` → `CostAllocationResult[]`
   - Handles equal, surface-area, manual-percentage methods
   - Applies occupied-only / unavailable filters
   - Computes recoverable vs owner-borne splits

4. **`src/context/AppContext.tsx`** — Extend state:
   - Add `costCategories`, `costEntries`, `allocationRules`, `allocationRuleUnitShares`, `costAllocationResults` arrays
   - CRUD functions for each entity
   - `runAllocation(costEntryId)` — computes and stores results
   - Query helpers: `getCostEntriesByProperty`, `getCostEntriesByUnit`, `getAllocationResultsByUnit`, `getAllocationResultsByProperty`

5. **`src/i18n/translations.ts`** — Add ~80 translation keys for nav, labels, statuses, form fields

6. **`src/components/layout/AppSidebar.tsx`** — Add "Costs & Taxes" nav item with `Receipt` or `Coins` icon

7. **`src/App.tsx`** — Add routes: `/costs`, `/costs/categories`, `/costs/entries`, `/costs/allocations`, `/costs/rules`

8. **`src/pages/CostCategories.tsx`** — Table page with create/edit Sheet following existing patterns (filter bar, Sheet-based CRUD, StatusBadge)

### Round 2 — Cost Entries + Allocation Rules Pages

9. **`src/pages/CostEntries.tsx`** — Full operational table:
   - Columns: label, category, nature, property, unit, frequency, amount, recovery type, allocation rule, status
   - Filters: property, category, nature, recovery type, status
   - Create/edit Sheet with conditional fields (allocation rule selector only when no unit selected)

10. **`src/pages/AllocationRules.tsx`** — Table + create/edit Sheet:
    - For manual-percentage: inline unit share editor with % validation (must sum to 100%)
    - Shows method, property, occupied-only flag

11. **`src/pages/CostsAllocations.tsx`** — Profitability summary page:
    - KPI cards: total charges, total taxes, owner-borne, recoverable
    - Property allocation table with expandable unit breakdown
    - Category breakdown summary

### Round 3 — Detail Page Updates + Dashboard

12. **`src/pages/PropertyDetail.tsx`** — Add "Costs & Taxes" card:
    - KPI row: total charges, total taxes, owner-borne, recoverable
    - Cost entries table for the property
    - Unit allocation breakdown table

13. **`src/pages/UnitDetail.tsx`** — Add "Costs & Taxes" card:
    - Direct costs + allocated costs
    - Owner-borne vs recoverable
    - Annual burden summary

14. **`src/pages/Dashboard.tsx`** — Add "Costs" KPI section:
    - Total active costs, total active taxes, owner-borne total, recoverable total

## Architecture Notes

- All state is in-memory via AppContext, following existing patterns
- Allocation results are **stored** (not computed at render time) per requirements
- `runAllocation()` is called on cost entry creation/edit and can be re-triggered manually
- Surface-area allocation skips units with null/zero surfaceArea and redistributes proportionally
- Recovery split logic: owner-only → 100% owner; tenant-recoverable → 100% recoverable; partially-recoverable → default 50/50 placeholder; informational → excluded from burden totals

## Recommended Implementation Order

Start with **Round 1** (types, mock data, allocation engine, context, categories page, nav) — this is the foundation everything else depends on.

