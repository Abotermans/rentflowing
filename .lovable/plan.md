## Current state (verified in DB)

- Alexandre (`a7c2f1f5-…`) is `owner` of **two** portfolios:
  - `Alexandre Botermans's Portfolio`
  - `Demo` (5 properties, plus units/leases/etc.)
- Table grants on `public.*` to `authenticated`: present
- RLS policies are correct:
  - `portfolios` SELECT → `is_portfolio_member(id, auth.uid())`
  - `portfolio_members` SELECT → `is_portfolio_member(portfolio_id, auth.uid())`
  - `properties` (and siblings) SELECT → `is_portfolio_member(portfolio_id, auth.uid())`

Server-side, Alexandre already has full read access to Demo and every entity in it. **No further membership row or policy change is needed.**

## Why it still appears empty

The most likely cause is a **stale browser session/cache**: the JWT and the in-memory `PortfolioContext` were loaded *before* the grants and membership were in place, and React Query / local state never re-fetched. The localStorage key `currentPortfolioId:<userId>` may also be pointing at the old, empty starter portfolio.

## Plan

1. **Confirm from the browser** what the client actually sees:
   - Have Alexandre fully sign out, then sign back in (this issues a fresh JWT and re-runs `PortfolioContext.load`).
   - If the switcher then lists *both* "Alexandre Botermans's Portfolio" and "Demo", pick **Demo** — the 5 properties and related data will load.

2. **If after a fresh login Demo still doesn't appear**, capture the failing Supabase request:
   - Open DevTools → Network → filter `portfolio_members`
   - Share the response (status + JSON body)
   This will tell us whether it's an auth/JWT problem, a CORS issue, or a frontend bug in `PortfolioContext` — and we'll fix exactly that.

3. **No code or migration changes** are planned in this step. Adding another membership row or new RLS policy would not fix anything because the data the request needs is already reachable.

## Technical notes

- `src/context/PortfolioContext.tsx` runs once on mount with the current `user`. It does not subscribe to membership changes, so memberships added during an active session require a refresh/relogin to appear.
- The "default" selection in the switcher is `localStorage["currentPortfolioId:<uid>"] || portfolios[0]`. If localStorage holds the old empty portfolio id, the user sees an empty app even though Demo is in the dropdown — they just need to pick it.
