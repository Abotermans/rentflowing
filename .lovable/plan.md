# Formula-Driven Advance Payment Cycles

## Goal
Make `rentFormula` (1 / 3 / 6 / 12 months) the single source of truth for advance billing. Each cycle becomes a bundled rent receivable + bundled charges receivable; the next cycle's receivables are generated automatically a configurable number of days before the current cycle ends. The lease page replaces its long "Advance Payment" card with a compact summary.

## Cycle model

Cycles are anchored to the lease start date.

- Cycle 1: `start = lease.startDate`, `end = start + N months − 1 day`
- Cycle k: starts the day after cycle k−1 ends
- Last cycle is truncated at `lease.endDate` (shorter cycle, prorated receivables)
- For `rentFormula = 1`, behavior is unchanged: one monthly rent + one monthly charges receivable per month.

For `N > 1`, each cycle produces:
- one **rent** ReceivableItem: `expectedAmount = monthlyRent × cycleMonths`, `dueDate = cycle.start`, `periodMonth = cycle.start` month, label like "Rent — 6 months advance (Jan–Jun 2026)"
- one **charges** ReceivableItem: `expectedAmount = monthlyCharges × cycleMonths`, same due date, parallel label
- both tagged with `cycleIndex` and `cycleEndDate` (new optional fields on ReceivableItem) so the UI can group them.

## Auto-generation of the next cycle

- New lease field `advanceCycleLeadDays: number | null` (default 15).
- A pure helper `ensureUpcomingCycles(lease, existingReceivables, today)` returns any missing cycle receivables that fall within `today + leadDays`. Invoked from `AppContext` on load / when leases or today change, same way other derived state is refreshed.
- Idempotent: a cycle is identified by `(leaseId, cycleIndex)`; never duplicated.

## Removed configuration

Drop from the lease form and lease detail UI: `hasAdvancePayment`, `advancePaymentAmount`, `advancePaymentDate`, `advanceAllocationMethod`, `advanceAppliedTo`, `advanceAllocationStartDate`, `advanceAllocationDurationMonths`, `fixedMonthlyReductionAmount`. The TypeScript fields stay on the `Lease` type as deprecated/optional for one release so existing mock data still loads, but no code reads them anymore.

`computeAdvancePricing` and the prepayment branch of `generateLeaseReceivables` are removed. A new `generateCycleReceivables(lease)` replaces the rent/charges loop for `rentFormula > 1`.

## Lease page UI (new compact section)

Replaces the current "Advance Payment" card. Shown only when `rentFormula > 1`.

Header: **Advance Billing — every {N} months**

Single row of stats (matching the other compact cards):
- **Paid from** — start of current paid cycle
- **Paid until** — end of current paid cycle
- **Total paid (current cycle)** — `monthlyRent × N + monthlyCharges × N`
- **Monthly rent** / **Monthly charges** — unit values for clarity
- **Next payment due** — `nextCycle.start` and `nextCycle.totalAmount`

Below: a minimal table of past + upcoming cycles (cycle #, period, total, status from the underlying receivable). Collapsible, collapsed by default like the other new sections.

## Technical notes

Files affected:
- `src/types/index.ts` — add `advanceCycleLeadDays`, mark old advance fields deprecated
- `src/types/receivables.ts` — add optional `cycleIndex`, `cycleEndDate` on `ReceivableItem`
- `src/lib/leaseReceivables.ts` — branch on `rentFormula`: 1 → monthly (unchanged), >1 → bundled cycle receivables; drop prepayment receipt path
- new `src/lib/leaseCycles.ts` — `computeCycles(lease)`, `ensureUpcomingCycles(...)`, `getCurrentCycle(...)`, `getNextCycle(...)`
- `src/context/AppContext.tsx` — call `ensureUpcomingCycles` when leases change; remove prepayment receipt creation
- `src/pages/LeaseDetail.tsx` — remove the existing Advance Payment card, add the new compact `AdvanceCyclesSection`
- new `src/components/leases/AdvanceCyclesSection.tsx`
- Lease create/edit form — remove the advance payment block, add `advanceCycleLeadDays` (default 15) under the rent formula field
- `src/i18n/translations.ts` — new keys (`advanceCycles.*`), remove no-longer-used `rentPrepayment.*` keys
- `src/lib/leaseReceivables.test.ts` — update existing tests, add cycle tests
- `src/data/mockData.ts` / `receivablesMockData.ts` — regenerate any seeded prepayment data into cycle receivables

## Out of scope
- Migrating historical prepayment allocations from existing demo leases (data is mock; regenerated on load).
- Changes to reconciliation logic — cycle receivables flow through the same allocation engine.
- Owner reporting and invoice-level accounting (per project scope memory).
