# All-inclusive lease pricing mode

Add a third, conceptually distinct lease pricing mode where the tenant owes one single monthly amount with no contractually defined charge component. Internally, actual allocated charges and taxes keep flowing through the cost engine so reporting and profitability stay truthful.

Existing `separated` (rent + recoverable provisions) and `flat-charges` (rent + contractually-fixed charges) modes are preserved unchanged.

## 1. Data model

In `src/types/index.ts`, extend `Lease`:

- `pricingMode: 'separated' | 'flat-charges' | 'all-inclusive'` — new explicit enum. Default `'separated'` for legacy leases. Derived from existing `chargesBillingMode` at load time when missing (`provision-reconciled → separated`, `flat-rate → flat-charges`).
- Conceptual mapping for `all-inclusive`:
  - `monthlyRent` = the single all-inclusive contractual monthly amount (the only thing the tenant sees).
  - `monthlyCharges` = `0` and treated as "not contractually defined" (never `>0` in this mode).
  - `chargesBillingMode` is forced to `'flat-rate'` for internal compatibility but UI never exposes reconciliation for this mode.
  - A derived helper `getChargesMode(lease)` returns `'separated' | 'flat' | 'included-unpriced'`.

Add a tiny helper module `src/lib/leasePricing.ts` exporting:

- `PRICING_MODES` constants + i18n label keys.
- `getPricingMode(lease)` (with legacy fallback).
- `getContractualMonthlyAmount(lease)` — `monthlyRent + monthlyCharges` for `separated`/`flat-charges`, just `monthlyRent` for `all-inclusive`.
- `isAllInclusive(lease)` / `hasContractualCharges(lease)` guards.

No DB migration is required for this iteration: the field is computed/persisted into the existing JSON `notes`-less surface via mock store. (If/when the lease table needs the column, a follow-up migration adds `pricing_mode TEXT NOT NULL DEFAULT 'separated'` plus GRANTs.)

## 2. Receivable logic

`src/lib/leaseReceivables.ts` + `src/lib/leaseCycles.ts`:

- When `isAllInclusive(lease)`:
  - Generate ONE receivable per cycle of `itemType: 'rent'`, amount = `monthlyRent × cycleMonths`, label `"All-inclusive rent"` (i18n).
  - Do NOT emit any `charges` receivable (skip the second block even if `monthlyCharges` is non-zero by data drift).
- Validate in `generateLeaseReceivables` that `monthlyCharges` is ignored for this mode; log a soft warning via existing integrity helper if it's >0.
- Status, allocation, advance cycles, and lead-time horizon remain identical.

`src/lib/amendments.ts`: renewals/amendments for an all-inclusive lease only edit `monthlyRent`; `monthlyCharges` change is rejected by `amendmentIntegrity`.

## 3. Analytical (cost/tax) layer — unchanged plumbing

Cost allocation (`src/lib/costAllocation.ts`) and reconciliation already compute per-unit allocated charges/taxes regardless of lease pricing. We only need to:

- Add `pricingMode`-aware aggregation in `src/lib/profitability.ts`:
  - For all-inclusive units, `revenue.gross = contractualMonthlyAmount × months`.
  - `recovery.tenantBilledCharges = 0` (no contractual charges receivable).
  - `recovery.ownerBorne = actualAllocatedRecoverable + actualOwnerOnly + actualAllocatedTaxes` (the owner absorbs everything not contractually re-billed).
  - `NOI = revenue.gross − recovery.ownerBorne` (formula already exists; inputs just shift).
  - New KPI `occupancyCostRatio = actualTotalOccupancyCost / contractualAmount` exposed for unit and aggregated at property.
- Mixed-mode property aggregation: sum per-lease NOI; surface a per-mode breakdown (count of leases per pricing mode) in `PropertyProfitabilitySection`.

`use-profitability.ts` consumes the same shape, with two new fields: `pricingMode`, `occupancyCostRatio`.

## 4. UI

### Lease add / edit (`LeaseAddDialog`, `LeaseEditDialog`)
- Replace the current `chargesBillingMode` Select with a `pricingMode` Select offering the three modes with helper text.
- When `all-inclusive`:
  - Single "Monthly all-inclusive amount" input (bound to `monthlyRent`).
  - `monthlyCharges` is hidden and forced to 0.
  - Per-unit charges share column is hidden.
  - `chargesBillingMode` field hidden (forced internally).

### Lease detail (`LeaseDetail.tsx`)
- Header badge "All-inclusive pricing" next to the existing rent block.
- Pricing section shows only the single contractual amount + an explainer: "Charges are included in the rent and not contractually itemised."
- `ChargesReconciliationSection`: when `isAllInclusive`, render a compact informational state instead of the reconciliation table: "Internal cost allocation only — no tenant regularization in this pricing mode" with a link/jump to the analytical block.
- A new "Internal cost view" sub-section reuses the existing allocated charges/taxes table to show: allocated recoverable charges, allocated taxes, total occupancy cost, owner-borne amount, occupancy cost ratio.

### Unit detail (`UnitDetail.tsx`) + `UnitProfitabilitySection`
- When the active lease is all-inclusive, show: contractual all-inclusive monthly amount, annualized amount, actual allocated charges, actual allocated taxes, total occupancy cost, net contribution before financing, occupancy cost ratio.
- Hide "recovery ratio" KPI (not meaningful — there is no provision vs actual comparison).

### Property detail
- `PropertyProfitabilitySection` adds a "Pricing mix" line: counts of leases per pricing mode and aggregated NOI computed correctly across mixed modes (no double-count of charges).

## 5. i18n

Add EN/FR keys in `src/i18n/translations.ts` under:

- `leases.pricingMode.{label,separated,flatCharges,allInclusive,*Help}`
- `leases.allInclusive.{amountLabel,internalCostNote,reconciliationDisabled}`
- `prof.allInclusive.{occupancyCostRatio,netContribution,internalCostView}`

## 6. Validation & integrity

In `src/lib/integrity/leaseIntegrity.ts`:

- All-inclusive lease must have `monthlyRent > 0`.
- All-inclusive lease must have `monthlyCharges === 0` (block with explanatory message; offer auto-fix).
- Block enabling charge regularization on an all-inclusive lease.
- Soft warning when `actualTotalOccupancyCost / contractualAmount > 0.4` (threshold constant, tunable).

## 7. Seed / test scenarios

Update `src/data/*Mock*` to include three example leases on the same office property:

1. Separated rent + recoverable provisions (existing case).
2. Flat-charges (existing case).
3. All-inclusive office, low actual allocated cost.
4. All-inclusive office, high actual allocated cost (margin erosion visible in profitability).

Add a Vitest spec `src/lib/__tests__/leaseReceivables.allInclusive.test.ts` asserting:
- Single rent receivable per month/cycle.
- No `charges` receivable is generated.
- Cycle totals respect rent tiers.

## 8. Out of scope (explicit)

Dashboard redesign, AI suggestions, accounting export, loan/credit, amendment engine refactor beyond compatibility, full UI redesign.

## Files touched (technical)

```text
src/types/index.ts                          (+pricingMode)
src/lib/leasePricing.ts                     (new)
src/lib/leaseReceivables.ts                 (skip charges receivable)
src/lib/leaseCycles.ts                      (zero-charges path)
src/lib/amendments.ts                       (compat)
src/lib/profitability.ts                    (mixed-mode aggregation, KPIs)
src/lib/integrity/leaseIntegrity.ts         (rules)
src/components/leases/LeaseAddDialog.tsx    (pricingMode UI)
src/components/leases/LeaseEditDialog.tsx   (pricingMode UI)
src/components/leases/ChargesReconciliationSection.tsx  (all-inclusive state)
src/pages/LeaseDetail.tsx                   (badge + internal cost view)
src/pages/UnitDetail.tsx                    (analytical KPIs)
src/components/profitability/UnitProfitabilitySection.tsx
src/components/profitability/PropertyProfitabilitySection.tsx
src/hooks/use-profitability.ts              (expose new fields)
src/i18n/translations.ts                    (EN/FR keys)
src/data/*Mock*.ts                          (seed scenarios)
src/lib/__tests__/leaseReceivables.allInclusive.test.ts (new test)
```

## Done criteria

- New `pricingMode = 'all-inclusive'` selectable on lease add/edit.
- Lease detail shows a single contractual amount, no fake split, reconciliation hidden.
- Receivable generation emits exactly one rent receivable per month/cycle for all-inclusive leases.
- Unit and property profitability reflect actual allocated costs and show occupancy cost ratio + net contribution.
- Existing separated and flat-charges leases behave identically to before.
- New tests pass; build is green.
