# Uniform currency formatting audit

## Goal
Every monetary figure across tables, detail pages, dialogs, KPIs and CSV exports renders in one canonical format:

- Grouping: non-breaking thin space every 3 digits → `1 790 €`, `12 500 €`, `1 250 000 €`
- Decimals: hidden when zero, shown (always 2) when non-zero → `1 790 €` vs `1 790,50 €`
- Symbol: always suffixed with a non-breaking space, regardless of currency → `1 790 €` / `1 790 £` / `1 790 $`
- Decimal mark: `,` (European), to stay consistent with the space grouping

## Single source of truth

Rewrite `src/lib/formatters.ts` → `formatCurrency(amount, currencyCode?, opts?)`:

- Build a `Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })` to get the number part (gives the European space grouping and `,` decimal).
- Append a non-breaking space + symbol resolved through `getCurrencySymbol(currencyCode)` (already exists). Defaults currency to the active portfolio's currency.
- Handle: `null`/`undefined`/`NaN` → `"—"`; negatives → minus sign in front of the digits (`-1 790 €`); zero → `0 €`.
- Add `formatCurrencyCompact(amount, currency)` for KPI tiles that today use `formatCompactNumber` style — same suffix rule, K/M abbreviation kept.
- Add `formatNumber(value, { decimals })` for non-currency numerics (m³, kWh, %) so grouping stays consistent (`1 250 kWh`, `1 790 m³`).

All call sites must consume these helpers — no ad-hoc `toLocaleString` / `toFixed` / `${symbol}${amount}` strings.

## Audit & rewrite scope

Searched the codebase: 210 existing `formatCurrency(...)` call sites (already centralised, only the helper changes) plus ~30 ad-hoc spots that need to be migrated:

Tables / lists
- `src/pages/Leases.tsx`, `Payments.tsx`, `Tenants.tsx`, `Properties.tsx`, `Units.tsx`, `Vendors.tsx`, `CostEntries.tsx`, `CostsAllocations.tsx`, `AllocationRules.tsx`, `Maintenance.tsx`, `Reports.tsx`, `Dashboard.tsx`

Detail pages
- `LeaseDetail.tsx` (incl. utility meter readings line 1738/1743 → `formatNumber`), `PropertyDetail.tsx`, `UnitDetail.tsx`, `TenantDetail.tsx`, `VendorDetail.tsx`, `MaintenanceDetail.tsx`

Dialogs / sections
- `ChargesReconciliationSection.tsx`, `AmendmentDialog.tsx` (lines 616-617 raw `toFixed(2)` → `formatCurrency`), `AmendmentChangesDialog.tsx`, `AmendmentConfirmDialog.tsx`, `LeaseEditDialog.tsx`, `LeaseAddDialog.tsx`, `CostEntryDialog.tsx`, `CashReceiptDialog.tsx`, `QuickPayReceivableDialog.tsx` (input default → `amount.toFixed(2)` kept as raw input value, not display), `RentTiersEditor.tsx`, profitability components

Exports
- `src/lib/exportCsv.ts` + `Reports.tsx`: route monetary columns through `formatCurrency` so CSVs match the on-screen format.

Out of scope (left untouched)
- Editable `<Input type="number">` values (raw numbers must stay machine-parseable).
- Percentages and ratios (`%`) — already consistent via `toFixed(1)`; only wrap with `formatNumber` where grouping matters.
- Date and area formatters.

## Validation

1. Grep guard: after the refactor, `rg -nP "toLocaleString\(|\.toFixed\(\d" src` must return only allowed call sites (file-size formatter, percentage helpers, input defaults).
2. Spot-check each surface listed above in the preview (Leases list, Lease detail KPI strip, Cost & taxes section, Payments table, Dashboard KPIs, Reports + exported CSV) to confirm:
   - `1 790 €` for whole amounts
   - `1 790,50 €` for amounts with cents
   - `-1 790 €` for negatives
   - Same suffix + space for `£` and `$` portfolios
3. Build passes (auto-run by the harness).

## Technical notes

- Use `\u202F` (narrow no-break space) between the number and the symbol so the pair never wraps and the spacing stays tight, matching the user's "1790 €" intent while keeping AFNOR-style readability.
- `Intl.NumberFormat("fr-FR")` already emits `\u202F` as its grouping separator in modern runtimes; we reuse the same character for the symbol gap for consistency.
- The portfolio's active currency comes from `PortfolioContext`; keep `formatCurrency`'s `currencyCode` parameter optional and fall back to that context at the call site (helper stays pure — call sites pass the currency, as they already do today).
