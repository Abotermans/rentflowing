## Goal

In the lease detail Receivables list, the **Period** column currently shows only the cycle's start month (e.g. `2025-07`) for advance-billed rent/charges receivables, even though the bundled amount covers several months. Display the full covered range instead, e.g. `2025-07 → 2026-06`.

## Change

Single file: `src/pages/LeaseDetail.tsx`, only the Period cell of the receivables table.

Logic:
- If `ri.cycleEndDate` is set AND the receivable is `rent` or `charges` (advance cycle), render `${periodMonth} → ${cycleEndDate.slice(0,7)}`.
- Otherwise, keep current rendering (`ri.periodMonth ?? "—"`).

This uses data already present on `ReceivableItem` (`cycleEndDate`, populated in `src/lib/leaseReceivables.ts`). No changes to receivable generation, types, sort logic, KPIs, totals, scroll, or i18n. Sorting by Period continues to work since it keys off `periodMonth` (cycle start), preserving chronological order.

## Out of scope

- Monthly (`rentFormula = 1`) receivables — unchanged, still show single month.
- Non-rent/charges receivables (deposit, adjustments, advance-payment, etc.) — unchanged.
- Cash receipts, allocation history, and other sections.
