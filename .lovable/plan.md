## Goal
Populate the **Demo** portfolio (`d26a0ef7…`) with realistic, consistent lease data — every lifecycle stage represented, single- and multi-unit leases — and fix the 3 existing leases that have no unit assignments.

## Current state (Demo portfolio)

Existing leases:
| Ref | Stage | Tenant | Units | Status |
|---|---|---|---|---|
| BAIL-PAR-001 | ended | Marie Dupont | 1 | OK |
| BAIL-PAR-002 | ended | Sophie Martin | **0** | broken |
| BAIL-BRU-001 | ended | Jan De Vries | 1 | OK |
| BAIL-BRU-002 | pending-signature | Luca Bianchi | 1 | OK |
| BAIL-BRU-003 | active | Jan De Vries | **0** | broken |
| BAIL-AMS-001 | active | Fatima El Amrani | 1 | OK |
| BAIL-LON-001 | active | Emma Williams | **0** | broken |

Lifecycle stages currently covered: `active`, `ended`, `pending-signature`.
Missing: `draft`, `signed`, `terminated`.

## Changes

### 1. Fix 3 inconsistent leases (add unit assignments)
Match each broken lease to a sensible unit in the right property/currency and align it with the unit's `current_status`:

- **BAIL-PAR-002** (ended, Sophie Martin, 1600 €, 2023-09-01 → 2025-12-31) → assign **PAR-A02** (Résidence du Parc, 3-bed apartment) as `primary`, assignment end = lease end.
- **BAIL-BRU-003** (active, Jan De Vries, 2200 €, 2025-07-01 → 2028-06-30) → assign **BRU-C01** (Bruxelles commercial unit, currently occupied) as `primary`, open-ended.
- **BAIL-LON-001** (active, Emma Williams, GBP 1800, 2024-10-01 → 2027-09-30) → assign **LON-F01** (Camden Mews 1-bed apartment, occupied) as `primary`, open-ended.

### 2. Add new leases — one per missing stage + multi-unit examples

All in the Demo portfolio. References follow the existing `BAIL-{CITY}-{NNN}` pattern.

| New ref | Stage | Tenant | Property | Units (assignment) | Rent | Period | Why |
|---|---|---|---|---|---|---|---|
| BAIL-AMS-002 | **draft** | Luca Bianchi | Keizersgracht Office Hub | AMS-O02 *(primary)* + AMS-P01 *(parking)* | €2 600 | 2026-09-01 → 2029-08-31 | Multi-unit office + parking lease being prepared |
| BAIL-PAR-003 | **signed** | Sophie Martin | Résidence du Parc | PAR-A01 *(primary)* + PAR-P01 *(parking)* + PAR-S01 *(ancillary studio used as home office)* | €2 320 | 2026-07-01 → 2029-06-30 | Signed but not yet started — multi-unit residential bundle |
| BAIL-BER-001 | **active** | Fatima El Amrani | Friedrichstraße Wohnhaus | BER-W02 *(primary)* + BER-K01 *(storage)* | €910 | 2025-04-01 → 2028-03-31 | Active multi-unit with ancillary storage |
| BAIL-LON-002 | **active** | Emma Williams (co-tenant: Marie Dupont) | Camden Mews | LON-F02 *(primary)* | GBP 2 200 | 2025-02-01 → 2028-01-31 | Active single-unit, GBP, joint tenancy |
| BAIL-AMS-003 | **active** | Jan De Vries | Keizersgracht Office Hub | AMS-O03 *(primary)* | €2 600 | 2024-04-01 → 2027-03-31 | Active single office, matches occupied unit |
| BAIL-BRU-004 | **terminated** | Luca Bianchi | Les Terrasses de Bruxelles | BRU-A01 *(primary)* | €1 100 | 2024-01-01 → 2025-05-31 | Early termination (job relocation) with termination reason, notice given |
| BAIL-PAR-004 | **ended** | Marie Dupont | Résidence du Parc | PAR-S01 *(primary)* | €820 | 2022-01-01 → 2023-12-31 | Older naturally-expired studio lease for history |

Notes on realism:
- Rents/charges align with each unit's `base_rent` / `base_charges`.
- Each lease uses `charges_billing_mode = 'provisions-with-reconciliation'` (residential) or `'flat-rate'` (parking-only / storage) consistent with project conventions.
- Multi-unit leases store the lease-level rent on the lease and use `rent_share` / `charges_share` on assignments to split between primary unit and ancillaries.
- `terminated` lease has `notice_given = true`, `notice_date`, `termination_reason = 'Tenant relocation'`, and `end_reason = NULL`.
- `ended` leases set `end_reason = 'natural-expiry'` (PAR-004) or `'notice-completed'` (PAR-001, PAR-002 keep current values).
- `signed` and `draft` leases have no `move_in_actual_date`.
- `pending-signature` already covered by existing BAIL-BRU-002 — no addition needed.

### 3. Final coverage check
After the migration:
- Stages present: `draft` ✓, `pending-signature` ✓, `signed` ✓, `active` ✓ (4 leases), `ended` ✓ (3 leases), `terminated` ✓
- Single-unit leases: 8 · Multi-unit leases: 3
- Currencies: EUR + GBP
- Property types covered: residential, commercial, office, with parking & storage ancillaries
- Zero leases without unit assignments

## Implementation
One `supabase--insert` call that, in a single transaction:
1. `INSERT` 7 new rows into `public.leases`.
2. `INSERT` unit assignments into `public.lease_unit_assignments` for the 3 fixed leases and the 7 new leases (10 leases × 1–3 assignments).

No schema changes. No code changes — pure data seeding.

## Out of scope
- Receivables, cash receipts, amendments, guarantees, maintenance tickets — not requested.
- Other portfolios are untouched.