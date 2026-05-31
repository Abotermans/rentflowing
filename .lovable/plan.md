
# Strict per-unit rent + charges on multi-unit leases

Today the lease form lets the user attach extra units (parking, cellar, …) but always writes `rentShare: null` / `chargesShare: null`. The data model already supports per-assignment shares — we'll make them mandatory ("strict per-unit"), derive the lease totals from the sum, and propagate this through display + validation. Receivables stay lease-level (one invoice, one receivable), shares are descriptive only.

## Data & business rules

- Every active `LeaseUnitAssignment` MUST carry `rentShare ≥ 0` and `chargesShare ≥ 0`.
- Lease totals become derived: `lease.monthlyRent = Σ rentShare`, `lease.monthlyCharges = Σ chargesShare` across active assignments.
  - We keep the columns on `Lease` (mirror) so receivables, payments, reports, advance-pricing, CSV exports, and TenantDetail keep working with no change. `setLeaseUnits` rewrites them from the draft.
- Single-unit (legacy) leases: migration seeds the primary row with `rentShare = lease.monthlyRent`, `chargesShare = lease.monthlyCharges`. Pure mirror, zero behaviour change.
- `validateLeaseUnits` (in `leaseUnitAssignmentIntegrity.ts`) gets new blockers:
  - `LUA_SHARE_MISSING` — any unit without a numeric `rentShare` or `chargesShare`.
  - `LUA_SHARE_NEGATIVE` — negative value.
  - The existing `LUA_SHARE_MISMATCH` warning is removed (sum is now the source of truth, mismatch is impossible by construction).
- Rent tier check (`getMonthlyRentForMonths`) still validates the **primary** unit's tier against `primary.rentShare`, not against the lease total. The ancillary units don't have rent tiers.

## UX in the lease form (`src/pages/Leases.tsx`)

The "Additional units" block becomes a small table:

```text
Unit              Role         Rent (€/mo)   Charges (€/mo)   [x]
A2-PK01 Parking   Parking      [   80.00 ]   [    0.00 ]      [x]
A2-CV03 Cellar    Cellar       [   20.00 ]   [    0.00 ]      [x]
─────────────────────────────────────────────────────────────────
Primary  3B Apt   Primary      [ 1 200.00]   [  150.00 ]
─────────────────────────────────────────────────────────────────
Lease total                      1 300.00       150.00
```

- The primary unit's rent & charges fields move **inside** this table (one row), so the rent/charges inputs that today sit at lease level are removed — the lease total is read-only and computed below the table.
- Rent tier dropdown for the primary unit stays (drives `form.rentFormula`); selecting a tier auto-fills `primary.rentShare`. The user can still edit it after.
- Adding an ancillary row defaults both shares to `0`.
- `form.monthlyRent` / `form.monthlyCharges` are kept in sync with the sum on every change (single `useMemo`). Validation runs against the sum.
- Cross-page editing pattern still works because `setLeaseUnits` writes the mirror back.

## Display

- **LeaseDetail** (`src/pages/LeaseDetail.tsx` L629-653): the existing table already has Rent share / Charges share columns — they'll now always be populated. Add a totals footer row.
- **UnitDetail**: where it shows the active lease info, append the unit's own `rentShare` + `chargesShare` ("Your contribution: 80€ rent / 0€ charges of lease L-2024-…").
- **Rent Roll report** (`src/pages/Reports.tsx`): expand the unit column so each ancillary unit becomes its own row with its share, instead of being hidden behind a `+N` chip. CSV export gets a `rentShare` / `chargesShare` column. Keep an aggregated mode toggle.
- **Lease list**: keep the `+N ancillary` chip as-is.

## Files to change

- `src/types/index.ts` — narrow `LeaseUnitAssignment.rentShare/chargesShare` from `number | null` to `number` (with a one-loop migration to backfill nulls). Update mock data.
- `src/lib/leaseAssignments.ts` — drop `checkInternalShareCoherence` (no longer needed) and add `sumLeaseShares(leaseId, assignments) → { rent, charges }`. Update `migrateLegacyLeaseAssignments` to seed shares from lease totals.
- `src/lib/integrity/leaseUnitAssignmentIntegrity.ts` — replace the mismatch warning with the two blockers above; drop the totals param.
- `src/context/AppContext.tsx` — `setLeaseUnits` accepts shares, writes them, and mirrors the sum into `lease.monthlyRent` / `lease.monthlyCharges`.
- `src/pages/Leases.tsx` — refactor the "Additional units" block into the table described above; remove top-level rent/charges inputs; recompute totals; pass shares to `setLeaseUnits` and `validateLeaseUnits`.
- `src/pages/LeaseDetail.tsx` — add totals footer row in the assignments table.
- `src/pages/UnitDetail.tsx` — show this unit's contribution.
- `src/pages/Reports.tsx` — per-unit Rent Roll rows + CSV column.
- `src/i18n/translations.ts` — keys: `leases.totalRent`, `leases.totalCharges`, `leases.unitContribution`, blocker messages (EN/FR).
- `src/lib/multiUnitLease.test.ts` — new scenarios: missing share blocked, negative share blocked, sum equals lease total, removing an ancillary updates lease total, legacy single-unit migration sets share = lease total.

## Out of scope

- Mid-lease price changes per unit (would need historised share rows).
- Per-unit receivables / invoices (project scope explicitly excludes invoice-level accounting).
- Owner-reporting allocation of revenue per cost center.
