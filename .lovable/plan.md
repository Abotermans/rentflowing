# Wire app pages to the database

Goal: replace the in-memory mock state in `AppContext` with data loaded from Supabase, and persist every CRUD action back to the DB. All pages already consume `useAppData()` — they keep working unchanged. The mock files stop being the source of truth and are only used for one-time re-seeding of new portfolios.

## Strategy

Rather than rewriting every page (Properties, Units, Leases, Receivables, Maintenance, Costs, …), we keep the existing `AppContext` shape and swap its internals:

- **Load on mount / on portfolio switch**: fetch all 18 tables for the active portfolio and hydrate state.
- **Mutations**: every `addX` / `updateX` / `deleteX` performs the Supabase write first, then updates local state from the returned row. Cascade logic (e.g. deleting a property removes its units) already exists in `AppContext`; we route those follow-up writes through Supabase too.
- **Optimistic UI** is not used in v1 — we await the write and then patch state. Keeps semantics simple and consistent with current synchronous mock behaviour.

This keeps the diff scoped to `AppContext.tsx` + a new repository layer; pages, integrity, formatters, hooks all stay untouched.

## Work breakdown

### 1. Repository layer — `src/lib/repo/`
One module per entity, each exporting `list(portfolioId)`, `insert(row)`, `update(row)`, `remove(id)`. They translate between the camelCase TS types in `src/types/**` and the snake_case DB columns (mappers live alongside).

Files:
- `properties.ts`, `units.ts`, `tenants.ts`, `leases.ts`, `guarantees.ts`, `leaseUnitAssignments.ts`
- `amendments.ts` (covers `lease_amendments` + `lease_amendment_changes`)
- `receivables.ts` (covers `receivable_items`, `cash_receipts`, `receipt_allocations`)
- `maintenance.ts` (covers `maintenance_tickets`, `vendors`)
- `costs.ts` (covers `cost_categories`, `cost_entries`, `allocation_rules`, `allocation_rule_unit_shares`, `cost_allocation_results`)
- `index.ts` — barrel export + a `loadPortfolio(portfolioId)` helper that runs all 18 list calls in parallel and returns a single `PortfolioSnapshot`.

### 2. AppContext rewrite
- On `activePortfolioId` change: set `loading=true`, call `loadPortfolio`, hydrate every `useState` array, set `loading=false`. Expose `loading` and `error` on the context for the first page render.
- Each CRUD callback becomes `async`: write to Supabase via the repo, then merge the returned row into local state. Existing cascades (delete property → delete units → delete leases → …) reuse the same repo calls inside a single function.
- Derivations (`computeCycles`, `autoAllocate`, `computeAllocations`, status reconciliation, etc.) keep running client-side over the hydrated arrays — no behaviour change.
- Keep the existing function signatures synchronous-looking where callers don't await (toast on success / failure inside the context); UI doesn't need to change.

### 3. Loading & error UX
- `AppLayout` (or a small wrapper inside it) shows a centered spinner while `loading` is true and the active portfolio changes, and a retry banner on error. No per-page changes needed.

### 4. Cleanup of mock seeding
- `mockData.ts`, `receivablesMockData.ts`, `maintenanceMockData.ts`, `costsMockData.ts` stay on disk (still useful for tests and future re-seeds) but stop being imported by `AppContext`.
- Remove the `LS_DEMO_SEEDED_KEY` / localStorage "claim" path from `AppContext` and `portfolioScope.ts` — no longer needed since the Demo portfolio is real DB data scoped by RLS.

### 5. Verification
- Manual smoke on every top-level page (Dashboard, Properties, Units, Tenants, Leases, Lease detail, Payments, Maintenance, Vendors, Cost categories, Cost entries, Allocation rules, Costs allocations, Reports) against the Demo portfolio.
- Existing vitest suites (`leaseReceivables.test.ts`, `lifecycle.test.ts`, `multiUnitLease.test.ts`, `occupancy.test.ts`) keep passing — they exercise pure libs, not the context.

## Out of scope

- Realtime sync between tabs (no Supabase channels in v1).
- Optimistic updates / offline queue.
- Pagination — portfolios are small enough to load fully.
- Adding new fields / changing the schema. Migration from the previous step is treated as final for now; any column gaps surfaced during wiring are listed for a follow-up migration rather than patched in-flight.
- Touching page components, integrity rules, or formatters.

## Technical notes

- DB columns use `snake_case`; TS types use `camelCase`. Mappers do the conversion in one place per entity to keep the rest of the app unchanged.
- All writes set `portfolio_id = activePortfolioId`. RLS (`is_portfolio_member` + `has_portfolio_role`) already enforces access; the client just has to pass the id.
- Cascade deletes rely on the FK `ON DELETE CASCADE` already in the migration, so e.g. `deleteProperty` issues a single `properties` delete and the DB cleans up units, leases, receivables, etc. Local state is then re-derived by removing the matching rows.
- `updated_at` is maintained by the `touch_updated_at` trigger on every table — repos don't send it on update.
- `auth.users` is off-limits; nothing in the repo layer touches it. Membership stays in `portfolio_members`, which is already managed by `PortfolioContext`.

```text
page → useAppData() → AppContext state ← repo (Supabase)
                          ▲
                          └── loadPortfolio() on portfolio switch
```
