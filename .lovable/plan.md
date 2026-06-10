
## Goal

Persist the demo dataset in the database so it no longer depends on in-memory mocks claimed via localStorage. A real portfolio named **Demo** will hold all the seed data, and your user account will be added as `owner` so you can access it from the portfolio switcher. The app keeps reading from `AppContext` for now — wiring pages to the DB is a follow-up.

## What gets created

### 1. Schema (one migration)

Tables added under `public`, all scoped by `portfolio_id` (FK to `portfolios`, `ON DELETE CASCADE`), all with `created_at` / `updated_at` + the existing `touch_updated_at` trigger:

- `properties`
- `units`
- `tenants`
- `leases`
- `guarantees`
- `lease_unit_assignments`
- `lease_amendments`
- `lease_amendment_changes`
- `receivable_items`
- `cash_receipts`
- `receipt_allocations`
- `maintenance_tickets`
- `vendors`
- `cost_categories`
- `cost_entries`
- `allocation_rules`
- `allocation_rule_unit_shares`
- `cost_allocation_results`

Columns mirror the TS types in `src/types/*`. Enum-like fields stored as `text` with `CHECK` constraints (no PG enums) to keep flexibility. Money stored as `numeric(14,2)`, dates as `date`, timestamps as `timestamptz`.

Each table follows the required order: `CREATE TABLE` → `GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated` + `GRANT ALL TO service_role` → `ENABLE RLS` → policies.

### 2. RLS

For every table, four policies (select/insert/update/delete) gated by `public.is_portfolio_member(portfolio_id, auth.uid())`, matching the pattern already used on `portfolios` / `portfolio_members`. Insert/update/delete additionally require `has_portfolio_role(..., ARRAY['owner','editor'])`.

### 3. Seed

One follow-up data insert (after migration approval):

1. Create a portfolio named **Demo** owned by your user (`alexanre.botermans@gmail.com`).
2. Add your user to `portfolio_members` as `owner`.
3. Insert the full contents of `src/data/mockData.ts`, `receivablesMockData.ts`, `maintenanceMockData.ts`, `costsMockData.ts` into the new tables, all stamped with the Demo portfolio id. IDs are remapped from the mock string ids (`p1`, `u3`, …) to fresh UUIDs via a deterministic mapping so FKs stay consistent.

### 4. No app code changes in this step

`AppContext` keeps using the in-memory mocks. The Demo portfolio is now selectable in the switcher and persists in the DB, ready to be wired up in the next step.

## Out of scope (next steps, separate request)

- Rewriting pages / CRUD to read/write Supabase.
- Removing `AppContext` mock state.
- The localStorage "claim" mechanism (`LS_DEMO_SEEDED_KEY`).
- Auto-adding future signups to the Demo portfolio.

## Technical notes

- One migration file creates all tables + RLS + GRANTs. No data inside the migration (data goes via `supabase--insert` after approval).
- FK choices: `properties.portfolio_id → portfolios(id) ON DELETE CASCADE`; child tables FK to their parent (`units.property_id → properties(id) ON DELETE CASCADE`, etc.) plus a redundant `portfolio_id` column for RLS scoping.
- `lease_unit_assignments`, `receipt_allocations`, `allocation_rule_unit_shares`, `cost_allocation_results`: junction/result tables — also carry `portfolio_id` for direct RLS.
- Mock-id → UUID mapping done in a single seed script using `gen_random_uuid()` collected into a temp table keyed by legacy id, so all relations resolve.
