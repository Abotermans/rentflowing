## Goal

Make every section on the Lease detail page (`src/pages/LeaseDetail.tsx`) visually consistent: same title size/weight/color, no icon prefixes on section titles, consistent right-side controls (status badge + action button), and consistent inline meta-status (icon + label).

## Current inconsistencies

Card titles all use `text-sm font-medium` (good), but several prefix the title with an icon — breaking consistency with cards that don't:
- "Avance" (Wallet)
- "Dépôt / Garantie" (Shield)
- "Move-In" (Home)
- "Move-Out" (PackageCheck)
- "Keys & Meters" (Key)
- "Return Status" (Gauge)
- "Notes" (StickyNote)

Also:
- The "Occupancy Operations" group heading uses `<h2>` with a `Truck` icon — inconsistent with all other sections which are plain card titles with no icons.
- The inline status pill rendered inside `CardTitle` (Guarantee, Move-In, Move-Out) keeps its small status icon — that's a status indicator, not a section icon, and stays.

## Changes (single file: `src/pages/LeaseDetail.tsx`)

1. Section titles — remove leading icons, keep `text-sm font-medium`, keep inline status pill on right of label where present:
   - Advance Payment card: drop `<Wallet />` from CardTitle.
   - Deposit/Guarantee card: drop `<Shield />` (keep guarantee status pill).
   - Move-In card: drop `<Home />` (keep move-in status pill).
   - Move-Out card: drop `<PackageCheck />` (keep move-out status pill).
   - Keys & Meters card: drop `<Key />`.
   - Return Status card: drop `<Gauge />`.
   - Notes card: drop `<StickyNote />`.

2. Occupancy Operations group heading: drop the `Truck` icon and use the same visual treatment as other section headings (plain `h2` with `text-lg font-semibold text-foreground mb-4`, no `flex/gap`, no icon).

3. Drop now-unused lucide imports: `Wallet`, `Shield`, `Home`, `PackageCheck`, `Key`, `Gauge`, `StickyNote`, `Truck`. Keep `Zap` and `Droplet` (still used inline inside the meters grid as data-row indicators, not section titles). Keep `Clock`, `Bell`, `AlertTriangle`, `CheckCircle2`, `XCircle`, `Undo2`, `RefreshCw`, `Trash2`, `MoreVertical`, `Plus`, `ChevronDown`, `Banknote`, `ArrowLeft` (used elsewhere).

4. No changes to colors, layout, spacing, padding, action buttons, or business logic. Right-side `Button variant="outline" size="sm"` and status badges are already consistent and untouched.

## Out of scope

- Color tokens, spacing, typography tokens — already consistent.
- Header/kebab area, banners, dialogs, tables.
- Inline icons inside data rows (electricity/water indicators, footer `Clock` timestamps) — these are data semantics, not section titles.
