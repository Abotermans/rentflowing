## Audit findings

The portfolio feature is broken at the **database permission layer**, not in the UI. Two consecutive cleanup migrations stripped grants that the Data API and RLS policies need:

### Bug 1 — Tables have zero Data API grants
`portfolios`, `portfolio_members`, and `portfolio_invitations` have **no privileges** granted to `authenticated` or `service_role`. PostgREST therefore returns `permission denied` for any client call, regardless of RLS. This is why:
- Creating a portfolio fails (insert blocked before RLS even runs).
- The switcher and Portfolio Settings page can't list members or invitations.

### Bug 2 — Helper functions revoked from `authenticated`
`is_portfolio_member`, `has_portfolio_role`, and `add_portfolio_creator_as_owner` had `EXECUTE` revoked from `authenticated`. Every RLS policy on these tables calls `is_portfolio_member(...)` or `has_portfolio_role(...)` in the caller's role context, so the policies themselves now raise `permission denied for function is_portfolio_member`. `SECURITY DEFINER` controls what the function does internally — it does not bypass the EXECUTE check.

### What's actually fine
- RLS policies are correctly written (separate `USING` / `WITH CHECK`, scoped to `authenticated`, owner/admin checks on writes).
- The `trg_add_portfolio_creator_as_owner` trigger correctly seeds the creator as `owner` (avoids the chicken-and-egg INSERT loop).
- `handle_new_user` correctly creates a starter portfolio + owner membership on signup.
- `PortfolioSwitcher.tsx` and `PortfolioSettings.tsx` already implement create / invite / role-update / remove flows — no UI changes needed.

## Plan

### 1. Single migration restoring grants

Grant Data API access on the three tables (auth-only — no `anon`):
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_members   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_invitations TO authenticated;
GRANT ALL ON public.portfolios, public.portfolio_members, public.portfolio_invitations TO service_role;
```

Restore EXECUTE on the helpers RLS policies depend on:
```sql
GRANT EXECUTE ON FUNCTION public.is_portfolio_member(uuid, uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_portfolio_role(uuid, uuid, portfolio_role[])       TO authenticated;
```

Keep `add_portfolio_creator_as_owner()` and `handle_new_user()` revoked from `authenticated` — they're only meant to be invoked by triggers (which run as table owner).

### 2. Verification after migration
- Run the Supabase linter; expect clean.
- Confirm: a logged-in user can create a portfolio, the trigger seeds them as owner, the new portfolio appears in the switcher, and Portfolio Settings can list members + send/cancel invitations.

### 3. No client code changes
`PortfolioSwitcher`, `PortfolioContext`, and `PortfolioSettings` are correct as-is once the grants are restored.

## Out of scope (call out, don't change now)
- `portfolio_invitations` accept flow (`AcceptInvite.tsx`) — works if grants are restored; if you want, a follow-up can harden it with a SECURITY DEFINER `accept_portfolio_invitation(token)` RPC so an invitee doesn't need a direct `portfolio_members` INSERT policy. Not required to unblock today's bug.
