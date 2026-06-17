## Plan (option B confirmed, skip force-password-change)

### 1. DB migration — role hardening
- Add `prevent_last_owner_removal` trigger on `portfolio_members` (blocks delete or demotion of the last Owner with a clear error).
- Rewrite write policies on `portfolio_members` and `portfolio_invitations`:
  - Admins can INSERT / UPDATE / DELETE rows where `role` is `admin`, `editor`, or `viewer`.
  - Owners can do all of the above and also manage Owner rows.
- `portfolios` policies unchanged.

### 2. `create-portfolio-user` edge function
Uses the service role. Inputs: `portfolio_id`, `email`, `password`, `role`, optional `first_name`, `last_name`.
1. Validate caller's JWT (`getClaims`).
2. Verify caller is `owner` or `admin` of `portfolio_id`. If `role = owner`, caller must be `owner`.
3. Zod-style input validation (email format, password 8–128 chars, role in enum).
4. Look up the auth user by email; if missing, `admin.createUser({ email, password, email_confirm: true, user_metadata })`.
5. Upsert `profiles`, upsert `portfolio_members` with the chosen role.
6. Return `{ user_id, created, email }`.

### 3. Portfolio Settings UI (`src/pages/PortfolioSettings.tsx`)
- **Members tab**: new "Add member" card (owners/admins) with email + first/last name + password + role; role dropdown hides Owner unless caller is Owner. Existing-row role dropdown hides Owner for Admin viewers and disables the row entirely when the target is an Owner.
- **Invitations tab**: add an "Owner" option only when the current user is Owner.
- Small inline legend describing each role.
- Friendly toast on the "last owner" guard.

### 4. No changes
`PortfolioContext`, `PortfolioSwitcher`, `AcceptInvite`, grants, or business-data RLS.

### Skipped (per your call)
Force password change on first login.
