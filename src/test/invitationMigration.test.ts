// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolioId = "00000000-0000-0000-0000-000000000001";
const ownerId = "00000000-0000-0000-0000-000000000011";
const inviteeId = "00000000-0000-0000-0000-000000000012";
const otherId = "00000000-0000-0000-0000-000000000013";

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL, email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.portfolios (id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE public.portfolio_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
      user_id uuid NOT NULL REFERENCES auth.users(id),
      role public.portfolio_role NOT NULL,
      UNIQUE (portfolio_id, user_id)
    );
    CREATE TABLE public.portfolio_invitations (
      id uuid PRIMARY KEY,
      portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
      email text NOT NULL,
      role public.portfolio_role NOT NULL,
      token text NOT NULL UNIQUE,
      invited_by uuid NOT NULL REFERENCES auth.users(id),
      expires_at timestamptz NOT NULL,
      accepted_at timestamptz
    );
    CREATE FUNCTION public.has_portfolio_role(_portfolio_id uuid, _user_id uuid, _roles public.portfolio_role[])
      RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.portfolio_members
        WHERE portfolio_id = _portfolio_id AND user_id = _user_id AND role = ANY(_roles))
    $$;
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
      ('${ownerId}', 'owner@example.com', now()),
      ('${inviteeId}', 'Invitee@Example.com', now()),
      ('${otherId}', 'other@example.com', now());
    INSERT INTO public.portfolios (id, name) VALUES ('${portfolioId}', 'Test portfolio');
    INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
      VALUES ('${portfolioId}', '${ownerId}', 'owner');
  `);
  const migration = await readFile(new URL("../../supabase/migrations/20261017140000_secure_portfolio_invitation_acceptance.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const confirmationGuard = await readFile(new URL("../../supabase/migrations/20261018235700_require_verified_email_for_invitations.sql", import.meta.url), "utf8");
  await db.exec(confirmationGuard);
  return db;
}

async function signInAs(db: PGlite, userId: string | null) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
}

async function addInvite(db: PGlite, token: string, options: { email?: string; role?: string; inviter?: string; expired?: boolean } = {}) {
  await db.query(`INSERT INTO public.portfolio_invitations
    (id, portfolio_id, email, role, token, invited_by, expires_at)
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now() + $6::interval)`, [
    portfolioId, options.email ?? "invitee@example.com", options.role ?? "editor",
    token, options.inviter ?? ownerId, options.expired ? "-1 day" : "7 days",
  ]);
}

describe("token-scoped portfolio invitation migration", () => {
  it("previews only a matching token and accepts it exactly once", async () => {
    const db = await createDatabase();
    try {
      await addInvite(db, "valid-token");
      const preview = await db.query<{ email: string; portfolio_name: string }>(
        "SELECT email, portfolio_name FROM public.get_portfolio_invitation($1)", ["valid-token"],
      );
      expect(preview.rows).toEqual([{ email: "invitee@example.com", portfolio_name: "Test portfolio" }]);
      const missing = await db.query("SELECT * FROM public.get_portfolio_invitation($1)", ["unknown-token"]);
      expect(missing.rows).toHaveLength(0);

      await signInAs(db, null);
      await expect(db.query("SELECT public.accept_portfolio_invitation($1)", ["valid-token"]))
        .rejects.toThrow("Sign in before accepting");
      await signInAs(db, inviteeId);
      const accepted = await db.query<{ accept_portfolio_invitation: string }>(
        "SELECT public.accept_portfolio_invitation($1)", ["valid-token"],
      );
      expect(accepted.rows[0].accept_portfolio_invitation).toBe(portfolioId);
      const member = await db.query<{ role: string }>(
        "SELECT role FROM public.portfolio_members WHERE user_id = $1", [inviteeId],
      );
      expect(member.rows).toEqual([{ role: "editor" }]);
      await expect(db.query("SELECT public.accept_portfolio_invitation($1)", ["valid-token"]))
        .rejects.toThrow("already accepted");
    } finally {
      await db.close();
    }
  });

  it("rejects wrong-email, expired, and revoked-inviter invitations", async () => {
    const db = await createDatabase();
    try {
      await addInvite(db, "wrong-email");
      await signInAs(db, otherId);
      await expect(db.query("SELECT public.accept_portfolio_invitation($1)", ["wrong-email"]))
        .rejects.toThrow("another email address");

      await addInvite(db, "expired-token", { expired: true });
      await signInAs(db, inviteeId);
      await expect(db.query("SELECT public.accept_portfolio_invitation($1)", ["expired-token"]))
        .rejects.toThrow("Invitation expired");

      await addInvite(db, "revoked-token");
      await db.query("DELETE FROM public.portfolio_members WHERE user_id = $1", [ownerId]);
      await expect(db.query("SELECT public.accept_portfolio_invitation($1)", ["revoked-token"]))
        .rejects.toThrow("inviter no longer has permission");
      const members = await db.query("SELECT user_id FROM public.portfolio_members WHERE user_id = $1", [inviteeId]);
      expect(members.rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("does not elevate an existing member's role", async () => {
    const db = await createDatabase();
    try {
      await addInvite(db, "existing-member", { role: "admin" });
      await db.query("INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES ($1, $2, 'viewer')", [portfolioId, inviteeId]);
      await signInAs(db, inviteeId);
      await expect(db.query("SELECT public.accept_portfolio_invitation($1)", ["existing-member"]))
        .rejects.toThrow("already a portfolio member");
      const member = await db.query<{ role: string }>(
        "SELECT role FROM public.portfolio_members WHERE user_id = $1", [inviteeId],
      );
      expect(member.rows).toEqual([{ role: "viewer" }]);
      const invite = await db.query<{ accepted_at: string | null }>(
        "SELECT accepted_at FROM public.portfolio_invitations WHERE token = $1", ["existing-member"],
      );
      expect(invite.rows[0].accepted_at).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("requires a confirmed account email and preserves the invitation for retry", async () => {
    const db = await createDatabase();
    try {
      await addInvite(db, "unconfirmed-token");
      await db.query("UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1", [inviteeId]);
      await signInAs(db, inviteeId);
      await expect(db.query("SELECT public.accept_portfolio_invitation($1)", ["unconfirmed-token"]))
        .rejects.toThrow("Confirm your email");
      const before = await db.query<{ accepted_at: string | null }>(
        "SELECT accepted_at FROM public.portfolio_invitations WHERE token = $1", ["unconfirmed-token"],
      );
      expect(before.rows[0].accepted_at).toBeNull();
      const memberBefore = await db.query("SELECT id FROM public.portfolio_members WHERE user_id = $1", [inviteeId]);
      expect(memberBefore.rows).toHaveLength(0);

      await db.query("UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1", [inviteeId]);
      const joined = await db.query<{ accept_portfolio_invitation: string }>(
        "SELECT public.accept_portfolio_invitation($1)", ["unconfirmed-token"],
      );
      expect(joined.rows[0].accept_portfolio_invitation).toBe(portfolioId);
    } finally {
      await db.close();
    }
  });
});
