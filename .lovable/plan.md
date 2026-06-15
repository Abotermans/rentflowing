# Profitability v1 — Polish & Validation Plan

The calculation engine and Property/Unit sections already exist. This plan closes the remaining gaps against the UI/UX, visualization, period, seed, and DONE requirements — without expanding scope to financing or a portfolio dashboard.

## 1. Fix calculation gaps in `src/lib/profitability.ts`

These are correctness issues uncovered while re-reading the file:

- **Property cost double-/under-counting.** Today `getPropertyCostSummary` adds "property-scoped entries" + "unit-direct entries" but ignores `costAllocationResults` for property-scoped costs (so an allocation split across units never reaches the property total when entries aren't unit-scoped). Rework so the property total = sum of every active cost entry tied to the property (whether unit-scoped or property-scoped), pro-rated to the window. Keep the split as: `direct unit` (entries with `unitId`), `direct property` (entries with `unitId === null`, no allocation), `allocated to units` (property-scoped entries that have allocation results — labeled accordingly).
- **Unit allocated costs missing property-direct allocations.** `getUnitCostSummary` already iterates `costAllocationResults` — good. But it pro-rates `a.allocatedAmount` again over the entry's lifespan, which can be wrong if the allocation `periodStart/End` already represents the window. Use the allocation period as the source-of-truth window, fall back to entry dates only when absent.
- **Recovery ratio capping.** `actualRecovered` (provisions collected) can exceed `actualRecoverable`, producing >100% ratio. Clamp `recoveryRatio` to `[0,1]` and add a `provisionsCollected` field so the UI can show both numbers without losing meaning.
- **Owner-borne formula.** Change to `ownerBorne = totalActual − min(actualRecovered, actualRecoverable)` so over-collected provisions don't artificially shrink owner burden. Surface the surplus separately as `provisionsSurplus`.
- **Period semantics.** Keep `defaultPeriod` = trailing 12 months; expose `currentMonthPeriod()` and `currentYearPeriod()` helpers so the UI can later add finer presets. No new UI preset added now — keep YTD / 12M / All.

## 2. UI refinements

### `src/components/profitability/PropertyProfitabilitySection.tsx`
- Add a top **Revenue vs Costs vs NOI summary card**: three labeled bars (Revenue / Owner-borne costs / NOI) with proportional widths and amounts on the right. Pure CSS — no chart lib.
- Restructure KPI grid into two rows of clearly themed cards:
  - Row 1 (Income): Theoretical rent, Billed rent, Collected rent, Vacancy loss, Unpaid loss, EGI.
  - Row 2 (Return): NOI, NOI margin, OER, Recovery ratio, Gross yield, Net yield.
- Relabel cost breakdown card to **Direct unit / Direct property / Allocated to units** (charges + taxes columns), making the property-vs-unit split obvious.
- Make the **per-unit comparison table sortable** (reuse `SortableTableHead` + `use-table-sort`) and default-sort by NOI desc — that's the "ranked" requirement.
- Add a small **legend chip row** under the section header: *Revenue · Owner-borne · NOI · Provisions ≠ Actuals*.
- Keep the "Before financing" badge; promote it into a slim inline alert under the header explaining: *"NOI shown here excludes loan interest, principal, and debt service."*

### `src/components/profitability/UnitProfitabilitySection.tsx`
- Same Revenue vs Costs vs NOI summary bar at the top.
- Group KPIs into Income / Costs / Return rows.
- In the **Charge accounting** card, render a 2-column compact view: *Provisions billed / Actual recoverable / Regularization delta* on the left, *Provisions collected / Recovered (capped) / Provisions surplus / Owner-borne remainder* on the right. Tooltip on "Regularization delta" explains positive = tenant owes, negative = refund.
- When `regularizationDelta ≠ 0`, show a single-line muted note: *"Provisions billed differ from actual recoverable charges — a regularization is due."*

### Helper text & clarity
- Add an info icon next to NOI everywhere with: *"Operational return. Excludes loans, interest, debt service."*
- Replace the bare "—" yields with a muted card body: *"Add a property valuation to compute yields."*

## 3. i18n keys (`src/i18n/translations.ts`)

Add a `profitability.*` namespace covering every label, hint, badge, alert, and column header introduced above. Wire both EN and FR. Replace hardcoded strings in both section components with `t(...)`. (Loop iterators stay non-`t` per existing constraint.)

## 4. Seed scenarios (`src/data/*` mock files)

Audit existing mocks and patch only what's missing. The DONE criteria require these five coherent scenarios to be present and visible:

1. **Profitable property w/ multiple units** — verify an existing property already qualifies; otherwise tweak rents/costs.
2. **Unit: strong rent, high allocated costs** — add a high-amount property-scoped cost entry with an allocation rule favoring this unit.
3. **Unit: low recovery ratio** — add a tenant-recoverable cost without matching provisions billed.
4. **Lease: provisions ≠ actual** — adjust one lease's `chargesReconciliation` so `provisionsBilled` differs materially from `actualRecoverable`.
5. **Property: taxes materially reduce NOI** — add a yearly property tax entry sized to ~10-15% of annual EGI.

Each tweak goes in the existing mock files (`costsMockData.ts`, `receivablesMockData.ts`) — no new data sources. After patching, run the dev build and visually confirm KPIs make sense on PropertyDetail and UnitDetail for the seeded items.

## 5. Verification

- `bun run build` (typecheck).
- `browser--view_preview` on `/properties/<seeded-id>` and `/units/<seeded-id>` to confirm:
  - Revenue/Costs/NOI bar renders proportionally.
  - Sortable unit table ranks by NOI.
  - Regularization note appears for scenario 4.
  - Yields show the muted "Add valuation" state.
- Quick math sanity-check the seeded scenarios against the displayed KPIs.

## Out of scope (explicit)

- Loans, debt service, DSCR, cash flow after financing.
- Portfolio-wide profitability dashboard or Reports page hookup.
- Charting libraries (recharts/d3) — bars are CSS only.
- Adding a `valuation` field to Property/Unit — yields stay in "unavailable" state.

## Technical summary (for reference)

```text
profitability.ts        → fix property cost split, recovery cap, ownerBorne formula
                          + add provisionsCollected / provisionsSurplus
PropertyProfitabilitySection.tsx → summary bar, regrouped KPIs, sortable unit table, relabeled breakdown
UnitProfitabilitySection.tsx     → summary bar, regrouped KPIs, 2-col charge accounting, regularization note
translations.ts         → new profitability.* keys (EN + FR)
costsMockData.ts        → scenarios 2, 3, 5
receivablesMockData.ts  → scenario 4 (provisions ≠ actuals)
```
