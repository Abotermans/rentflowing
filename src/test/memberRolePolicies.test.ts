// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-0000-0000-000000000001";
const ownerA = "00000000-0000-0000-0000-000000000011";
const ownerB = "00000000-0000-0000-0000-000000000012";
const admin = "00000000-0000-0000-0000-000000000013";
const editor = "00000000-0000-0000-0000-000000000014";
const newMember = "00000000-0000-0000-0000-000000000015";

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
    CREATE TABLE public.portfolios (id uuid PRIMARY KEY);
    CREATE TABLE public.portfolio_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
      user_id uuid NOT NULL,
      role public.portfolio_role NOT NULL,
      UNIQUE (portfolio_id, user_id)
    );
    CREATE TABLE public.portfolio_invitations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
      invited_by uuid NOT NULL,
      role public.portfolio_role NOT NULL
    );
    CREATE FUNCTION public.has_portfolio_role(_portfolio_id uuid, _user_id uuid, _roles public.portfolio_role[])
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.portfolio_members
        WHERE portfolio_id = _portfolio_id AND user_id = _user_id AND role = ANY(_roles))
    $$;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_members TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_invitations TO authenticated;
    GRANT SELECT, UPDATE ON public.portfolios TO authenticated;
    ALTER TABLE public.portfolio_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.portfolio_invitations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY member_read ON public.portfolio_members FOR SELECT TO authenticated
      USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin','editor','viewer']::public.portfolio_role[]));
    CREATE POLICY invitation_read ON public.portfolio_invitations FOR SELECT TO authenticated
      USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));
    INSERT INTO public.portfolios (id) VALUES ('${portfolio}');
    INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES
      ('${portfolio}', '${ownerA}', 'owner'),
      ('${portfolio}', '${ownerB}', 'owner'),
      ('${portfolio}', '${admin}', 'admin'),
      ('${portfolio}', '${editor}', 'editor');
  `);
  const migration = await readFile(new URL("../../supabase/migrations/20260617120859_5ae3b4ad-60cd-446b-b697-ed652370d745.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec("SET ROLE authenticated");
  return db;
}

async function signInAs(db: PGlite, userId: string) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function upsertRole(db: PGlite, userId: string, role: string) {
  return db.query(`INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (portfolio_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [portfolio, userId, role]);
}

describe("portfolio member role RLS", () => {
  it("does not let an admin promote themselves or demote an owner through upsert", async () => {
    const db = await createDatabase();
    try {
      await signInAs(db, admin);
      await expect(upsertRole(db, admin, "owner")).rejects.toThrow();
      await expect(upsertRole(db, ownerA, "viewer")).rejects.toThrow();
      await expect(upsertRole(db, newMember, "owner")).rejects.toThrow();
      await upsertRole(db, newMember, "editor");
      const roles = await db.query<{ user_id: string; role: string }>(
        "SELECT user_id, role FROM public.portfolio_members WHERE user_id IN ($1, $2, $3) ORDER BY user_id",
        [ownerA, admin, newMember],
      );
      expect(roles.rows).toEqual([
        { user_id: ownerA, role: "owner" },
        { user_id: admin, role: "admin" },
        { user_id: newMember, role: "editor" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("allows an owner to grant owner membership", async () => {
    const db = await createDatabase();
    try {
      await signInAs(db, ownerA);
      await upsertRole(db, editor, "owner");
      const result = await db.query<{ role: string }>(
        "SELECT role FROM public.portfolio_members WHERE user_id = $1", [editor],
      );
      expect(result.rows).toEqual([{ role: "owner" }]);
    } finally {
      await db.close();
    }
  });

  it("rejects a duplicate add without changing an existing member's role", async () => {
    const db = await createDatabase();
    try {
      await signInAs(db, ownerA);
      await expect(db.query(
        "INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES ($1, $2, 'viewer')",
        [portfolio, ownerB],
      )).rejects.toThrow("duplicate key");
      const result = await db.query<{ role: string }>(
        "SELECT role FROM public.portfolio_members WHERE user_id = $1", [ownerB],
      );
      expect(result.rows).toEqual([{ role: "owner" }]);
    } finally {
      await db.close();
    }
  });
});
