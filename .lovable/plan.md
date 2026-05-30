## Goal

Convert every filter dropdown on the main list pages from single-select to multi-select, and display a meaningful icon next to each option (and next to the selected count in the trigger). Reports page is out of scope.

## 1. New shared component — `src/components/ui/multi-select-filter.tsx`

A Popover + Command-based multi-select built on existing shadcn primitives.

Props:
- `label` (string) — used as placeholder ("Status", "Type"…)
- `icon?` (LucideIcon) — leading icon on the trigger
- `options: { value: string; label: string; icon?: LucideIcon }[]`
- `values: string[]` and `onChange(values: string[])`
- `width?` class

Trigger behaviour:
- Empty selection → `<Icon /> Label` (acts as "All")
- Any selection → `<Icon /> Label · N` (just a count, per user choice)
- Right side: chevron, plus a small `×` to clear when N > 0
Dropdown behaviour:
- Searchable `Command` list, each row = checkbox + option icon + label
- Header row "Select all / Clear" toggle
- Keeps `h-9` to match current filter row density

## 2. Domain icon catalog — `src/lib/filterIcons.ts`

Single source of truth mapping every filter value to a Lucide icon. Pages import from here. Assigns sensible icons where none exist today.

| Domain | Values → Icons |
|---|---|
| Property type | residential `Home`, commercial `Store`, mixed-use `Building` |
| Property status | active `CircleCheck`, inactive `CircleSlash` |
| Country | `Flag` (generic; per-country flag emoji stays in label) |
| Unit type | studio `Bed`, apartment `Building2`, house `Home`, office `Briefcase`, retail `Store`, parking `Car`, storage `Package`, other `Box` |
| Unit occupancy | vacant `DoorOpen`, occupied `UserCheck`, reserved `CalendarClock`, notice-given `Bell`, unavailable `Ban` |
| Lease status | draft `FileEdit`, active `FileCheck`, expiring `Clock`, ended `FileX`, terminated `Ban` |
| Tenant status | active `UserCheck`, former `UserMinus`, blacklisted `UserX`, prospect `UserPlus` |
| Maintenance status | open `CircleDot`, in-progress `Loader`, on-hold `Pause`, resolved `CircleCheck`, closed `Archive`, cancelled `Ban` |
| Maintenance category | plumbing `Droplet`, electrical `Zap`, hvac `Thermometer`, appliance `WashingMachine`, structural `Hammer`, cosmetic `Paintbrush`, other `Wrench` |
| Priority | low `ArrowDown`, medium `Minus`, high `ArrowUp`, urgent `AlertTriangle` (reuse Maintenance.tsx colors) |
| Vendor status | active `CircleCheck`, inactive `CircleSlash` |
| Property filter (lists) | per-property `Building2` |
| Vendor filter (Maintenance) | per-vendor `HardHat` |
| Receivable status | open `CircleDot`, paid `CircleCheck`, partially-paid `CircleDashed`, overdue `AlertTriangle` |
| Receivable type | rent `Home`, charges `Receipt`, deposit `PiggyBank`, guarantee `ShieldCheck`, advance-payment `Wallet`, adjustment `Pencil`, late-fee `AlertTriangle`, repair-recharge `Wrench`, credit-note `Undo2`, other `Tag` |
| Cost nature | rental-charge `Receipt`, property-tax `Landmark`, insurance `Shield`, utility `Plug`, maintenance `Wrench`, other `Tag` |
| Cost scope | property `Building2`, unit `Home`, common-area `Users` |
| Cost entry status | draft `FileEdit`, posted `CheckCircle`, archived `Archive` |

## 3. Page wiring

For each list page below, replace each filter `Select` with the new `MultiSelectFilter`, change the corresponding state from `string` to `string[]` (default `[]` meaning "no filter"), and update the matching predicate from `=== "all"` to `values.length === 0 || values.includes(row.field)`. Remove the now-unused "All …" sentinel `SelectItem`s and `filter.all*` placeholders from the filter rows (translation keys stay in `translations.ts` since other pages use them).

- `src/pages/Properties.tsx` — country, type, status
- `src/pages/Units.tsx` — property, type, occupancy status
- `src/pages/Leases.tsx` — status, property
- `src/pages/Tenants.tsx` — status
- `src/pages/Vendors.tsx` — status
- `src/pages/Maintenance.tsx` — status, category, priority, property, vendor
- `src/pages/Payments.tsx` — property (header filter row) + Receivables tab: status, type (Cash Receipts / Allocations tabs already have no extra dropdowns to convert)
- `src/pages/CostEntries.tsx` — property, nature, category, status
- `src/pages/CostCategories.tsx` — nature, scope

URL/query-param edit flow (`?edit=…`) is untouched — only filter state shape changes.

## 4. Out of scope

- Reports page filters (per user choice — stays single-select)
- In-form `Select` dropdowns inside CRUD Dialogs (these remain single-select — picking one property, one unit, etc.)
- New translation keys; reuse existing `filter.*` and domain labels
- Persisting filter state across reloads
