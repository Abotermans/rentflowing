
# Operational Profitability — Property & Unit

Add a first profitability layer that measures **operational return before financing** (no loans, no debt service, no DSCR). It plugs into existing data: leases, receivables, cash receipts, cost entries, and cost-allocation results.

## Scope (this prompt only)

In:
- Calculation helpers for property/unit operational profitability
- "Operational Return" section on Property Detail and Unit Detail
- KPI cards, cost & recovery breakdown, unit profitability table
- Allocation-aware aggregation (uses existing `cost_allocation_results` + unit-direct costs)
- Charge regularization delta (provisions billed vs actual recoverable)
- Graceful "unavailable" indicators where data is missing (valuation, vacancy loss, other income)

Out (explicitly not built now):
- Loans / debt service / DSCR / cash flow after financing
- Portfolio-wide overview dashboard
- AI features and accounting exports

## Period model

A single optional `{ start, end }` window (ISO dates). Default: trailing 12 months ending today. The section header offers three quick presets: **YTD**, **Last 12 months**, **All time**. Period is local to the section; no global filter.

## Data sources (already in app)

- `leases`, `leaseUnitAssignments` → billed rent (theoretical & cycle-based), assignments
- `receivableItems` (rent / charges / charges-adjustment) → billed amounts
- `cashReceipts` + `receiptAllocations` → collected amounts
- `costEntries` + `costAllocationResults` → actual charges & taxes, recoverable split, owner-burden
- `leaseReceivables.ts` cycles → theoretical rent generation
- `chargesReconciliation.ts` `computeLeaseCostOverview` / `computeReconciliation` → recoverable + provisions

## Helper layer — `src/lib/profitability.ts`

Pure functions, no state. All amounts in the property's currency; cross-currency is out of scope for v1 (fallback: use property `currencyCode`; if a cost is in another currency we surface a "mixed currency" notice and skip it from totals).

```ts
type Period = { start: string; end: string };

interface RevenueSummary {
  theoreticalRent: number;      // sum of scheduled rent in window (lease.monthlyRent * months active)
  billedRent: number;           // receivableItems.expectedAmount where itemType in {rent}
  collectedRent: number;        // sum of receiptAllocations against rent receivables in window
  otherIncome: number;          // 0 for v1 — flagged unavailable
  vacancyLoss: number;          // theoreticalRent - billedRent for vacant periods (derived)
  unpaidLoss: number;           // billedRent - collectedRent on past-due items
  egi: number;                  // billedRent + otherIncome - vacancyLoss - unpaidLoss
  flags: { otherIncomeUnavailable: true; vacancyDerived: true };
}

interface CostSummary {
  directCharges: number;        // unit/property cost entries (nature=charge) pro-rated to window
  directTaxes: number;          // cost entries with isTax=true OR category.nature=tax
  allocatedCharges: number;     // from costAllocationResults pro-rated (charges)
  allocatedTaxes: number;       // from costAllocationResults pro-rated (taxes)
  totalActual: number;
}

interface RecoverySummary {
  provisionsBilled: number;     // receivableItems itemType=charges expected in window
  actualRecoverable: number;    // costAllocationResults.recoverableAmount pro-rated
  actualRecovered: number;      // collected charges receipts in window
  ownerBorne: number;           // totalActual - actualRecovered
  regularizationDelta: number;  // actualRecoverable - provisionsBilled (positive = under-billed tenant)
  recoveryRatio: number | null; // recovered / recoverable, null if recoverable == 0
}

interface YieldMetrics {
  grossYield: number | null;    // annualizedTheoreticalRent / valuation
  netYield: number | null;      // annualizedNOI / valuation
  valuationAvailable: boolean;
}

interface Profitability {
  period: Period;
  currencyCode: string;
  revenue: RevenueSummary;
  costs: CostSummary;
  recovery: RecoverySummary;
  noi: number;                  // egi - (totalActual - actualRecovered)
  noiMargin: number | null;     // noi / egi
  oer: number | null;           // ownerBorne / egi
  yields: YieldMetrics;
  notes: { code: string; severity: "info" | "warn" }[]; // e.g. mixed-currency, missing-valuation
}
```

Exports:
- `getPropertyRevenueSummary(propertyId, period?)`
- `getPropertyCostSummary(propertyId, period?)`
- `getPropertyRecoverySummary(propertyId, period?)`
- `getPropertyYieldMetrics(propertyId, period?)`
- `getPropertyProfitability(propertyId, period?)`
- `getUnitRevenueSummary(unitId, period?)`
- `getUnitCostSummary(unitId, period?)`
- `getUnitRecoverySummary(unitId, period?)`
- `getUnitYieldMetrics(unitId, period?)`
- `getUnitProfitability(unitId, period?)`

Each takes the relevant slices from `useAppData()` as args (mockable) — wrap as hooks `useAppData()`-aware in a thin `useProfitability` hook used by the UI.

Vacancy derivation: for each unit-month in the window with no active lease assignment, vacancyLoss += unit.baseRent (or 0 if no baseRent). Flagged `vacancyDerived: true` so the UI shows a tooltip.

## UI — Property Detail

New `<ProfitabilitySection>` rendered between existing sections (below the units list, before settings). Composition:

1. Header with period switcher (YTD / 12M / All) and badge **"Operational return — before financing"**.
2. KPI card row (high-density, `text-xs` labels, `text-lg` values, currency formatting): EGI, NOI, NOI margin, OER, Recovery ratio, Gross yield, Net yield. Missing values render as `—` with a tooltip explaining what's missing.
3. Cost & recovery card: actual charges, actual taxes, recovered charges, owner-borne charges, regularization delta (color-coded sign).
4. Unit profitability table with columns: Unit, Billed rent, Collected rent, Actual costs, Taxes, Recovered, NOI, NOI margin, Recovery ratio, Vacancy (badge when any vacant month in window). Sortable via existing `SortableTableHead`.
5. Footer note: "Operational return only — financing not included."

## UI — Unit Detail

New `<ProfitabilitySection>`:
1. Header + period switcher + same badge.
2. KPI cards: Billed rent, Collected rent, Actual charges, Actual taxes, Recovered charges, NOI, NOI margin, Gross yield, Net yield.
3. Detailed cost breakdown card: direct unit charges, direct unit taxes, allocated property charges, allocated property taxes, owner-borne net cost.
4. Charge accounting summary card: provisions billed, actual charges allocated, regularization delta, recovered charges, owner-borne remainder. When `chargesBillingMode = "flat-rate"` for the active lease, show an info note that provisions/regularization don't apply.

## Graceful handling

- Valuation field doesn't exist in the schema yet → yields render as "Unavailable" with an inline hint "Add valuation to enable yield". No DB change in this prompt.
- Other income source doesn't exist → KPI shows 0 with a small "(no source yet)" tag; not silently invented.
- Cross-currency costs vs property currency → excluded from sums; a `notes` chip reports the count excluded.

## Files

New:
- `src/lib/profitability.ts` — pure calc helpers
- `src/hooks/use-profitability.ts` — wires helpers to `useAppData()`
- `src/components/profitability/ProfitabilityKpis.tsx`
- `src/components/profitability/PropertyProfitabilitySection.tsx`
- `src/components/profitability/UnitProfitabilitySection.tsx`
- `src/components/profitability/UnitProfitabilityTable.tsx`
- i18n keys under `profitability.*` in `src/i18n/translations.ts` (EN + FR)

Edited:
- `src/pages/PropertyDetail.tsx` — mount `<PropertyProfitabilitySection propertyId={id} />`
- `src/pages/UnitDetail.tsx` — mount `<UnitProfitabilitySection unitId={id} />`

No DB migrations, no backend changes, no edits to `src/integrations/supabase/*`.

## Acceptance

- Property and Unit detail pages each show an Operational Return section with KPIs and breakdowns.
- All numbers reconcile: Property NOI = sum of unit NOIs + property-level owner-borne residuals (validated via a unit test snippet).
- Missing valuation / other income / vacancy data shows clearly as unavailable, never invented.
- No financing-related terms (loan, debt, DSCR, interest) appear anywhere in the new code or UI.
