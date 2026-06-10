
# Authentication & Multi-Portfolio Access

## Naming decision

To avoid clashing with the existing **Tenant** (= renter of a unit), the SaaS-level container that groups properties, leases, vendors, etc. is called a **Portfolio**. A Portfolio is what a property manager logs into. One user can belong to several Portfolios and switch between them.

```text
User ──belongs to──▶ Portfolio ──owns──▶ Properties ──▶ Units ──▶ Leases ──▶ Tenants (renters)
                          └────────────▶ Vendors, Maintenance, Costs, Reports
```

Permissions are scoped at the **Portfolio level only** — not per property. Property-level ACLs would be overkill for this product; if a user needs different access to a subset of properties, they get a separate Portfolio. Permission *roles* (Owner / Admin / Editor / Viewer) are stored now but **enforcement is out of scope** for this task (authorization comes later, as you asked).

## Auth method

- Email + password only (Lovable Cloud).
- Self-serve signup creates a new Portfolio with the signer as Owner.
- Existing members invite teammates by email; invitee accepts → joined as a member of that Portfolio.
- Password reset flow included (`/forgot-password` + `/reset-password`).

## Data model (Lovable Cloud)

New tables:

- `profiles` — 1:1 with `auth.users`. Fields: `id` (FK auth.users), `first_name`, `last_name`, `avatar_url`, `locale`, `phone`, `created_at`, `updated_at`. Auto-created by trigger on signup.
- `portfolios` — `id`, `name`, `slug`, `default_currency`, `default_locale`, `created_by`, `created_at`, `updated_at`.
- `portfolio_members` — `portfolio_id`, `user_id`, `role` (`owner` | `admin` | `editor` | `viewer`), `joined_at`. Unique on `(portfolio_id, user_id)`. Roles stored here only — never on `profiles` — to prevent privilege escalation.
- `portfolio_invitations` — `id`, `portfolio_id`, `email`, `role`, `token`, `invited_by`, `expires_at`, `accepted_at`.

Existing domain tables (`properties`, `units`, `leases`, `tenants`, `vendors`, `maintenance_*`, `costs_*`, …) gain a `portfolio_id` column. RLS will be wired in the authorization pass; for this task we add the column + index and route all reads/writes through a "current portfolio" filter on the client.

Mock data stays in place during build; we'll seed a default Portfolio so the existing demo continues to work for logged-in users.

## App shell changes

- New routes (public): `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/accept-invite/:token`.
- All existing routes wrapped in a `<RequireAuth>` guard → redirects to `/login` if no session.
- A `<RequirePortfolio>` guard inside that → if the user has 0 portfolios after login (shouldn't happen post-signup, but possible via cleared invite), send them to `/onboarding/portfolio` to create one.
- **Portfolio switcher in the top header** (next to the user avatar): shows current portfolio name + chevron, dropdown lists all portfolios the user belongs to, plus a "Create new portfolio" item.
- Header avatar dropdown: Profile, Settings, Logout.

## Profile management page (`/profile`)

Single page, tabbed (consistent with existing B2B Dialog/density patterns — but a full page since it's a settings area):

1. **Personal info** — first name, last name, avatar upload, phone, preferred locale (mirrors `SettingsContext`).
2. **Email & password** — change email (re-verification), change password (current + new), sign-out everywhere.
3. **Portfolios** — list of portfolios the user belongs to, role badge, "Set as default", leave portfolio (blocked if last Owner).
4. **Sessions** *(optional, nice-to-have)* — list of active sessions with revoke.

## Portfolio settings page (`/portfolio/settings`, Owner/Admin only — UI-gated for now)

- General: name, default currency, default locale.
- Members: list of `portfolio_members` with role, remove member.
- Invitations: pending invites with resend / revoke; "Invite by email" form (email + role).

## State & context

- New `AuthContext` (wraps Supabase auth): `user`, `session`, `signIn`, `signUp`, `signOut`, `loading`. Uses `onAuthStateChange` + `getUser()` for trusted checks.
- New `PortfolioContext`: `currentPortfolioId`, `portfolios`, `switchPortfolio(id)`, persisted in `localStorage` per user. All data hooks read `currentPortfolioId` from here so switching instantly re-scopes the UI.
- `AppContext` mock data filtered by `currentPortfolioId` once portfolios exist on records.

## Out of scope (deferred)

- Role-based authorization / RLS enforcement (you confirmed permissions come later).
- Google / Apple / magic link / SSO.
- Per-property ACLs.
- Tenant-renter portals.

## Implementation order

1. Enable Lovable Cloud, create migrations for `profiles`, `portfolios`, `portfolio_members`, `portfolio_invitations` (+ grants), trigger to auto-create profile on signup, trigger to create a starter Portfolio + owner membership on signup.
2. `AuthContext` + public auth routes (login, signup, forgot/reset password).
3. `<RequireAuth>` guard around existing routes; logout in header.
4. `PortfolioContext` + header switcher + "Create portfolio" flow.
5. `/profile` page (Personal info, Email & password, Portfolios tabs).
6. `/portfolio/settings` page (General, Members, Invitations) + `/accept-invite/:token` page.
7. Add nullable `portfolio_id` to existing domain tables (migration only; enforcement later).
