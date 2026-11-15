// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolioA = "00000000-0000-0000-0000-000000000001";
const portfolioB = "00000000-0000-0000-0000-000000000002";
const owner = "00000000-0000-0000-0000-000000000011";
const admin = "00000000-0000-0000-0000-000000000012";
const viewer = "00000000-0000-0000-0000-000000000013";
const outsider = "00000000-0000-0000-0000-000000000014";

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE TABLE public.portfolios (id uuid PRIMARY KEY);
    CREATE TABLE public.portfolio_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
      user_id uuid NOT NULL REFERENCES auth.users(id),
      role public.portfolio_role NOT NULL,
      joined_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION public.has_portfolio_role(_portfolio_id uuid, _user_id uuid, _roles public.portfolio_role[])
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.portfolio_members
        WHERE portfolio_id = _portfolio_id AND user_id = _user_id AND role = ANY(_roles))
    $$;
    INSERT INTO auth.users (id, email) VALUES
      ('${owner}', 'owner@example.com'), ('${admin}', 'admin@example.com'),
      ('${viewer}', 'viewer@example.com'), ('${outsider}', 'outsider@example.com');
    INSERT INTO public.portfolios (id) VALUES ('${portfolioA}'), ('${portfolioB}');
    INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES
      ('${portfolioA}', '${owner}', 'owner'),
      ('${portfolioA}', '${admin}', 'admin'),
      ('${portfolioA}', '${viewer}', 'viewer'),
      ('${portfolioB}', '${outsider}', 'owner');
  `);
  const migration = await readFile(new URL("../../supabase/migrations/20261018235800_list_manageable_portfolio_members.sql", import.meta.url), "utf8");
  await db.exec(migration);
  return db;
}

async function asUser(db: PGlite, userId: string) {
  await db.exec("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

describe("manageable portfolio member list", () => {
  it("returns account emails only to owners and admins of that portfolio", async () => {
    const db = await createDatabase();
    try {
      for (const userId of [owner, admin]) {
        await asUser(db, userId);
        const result = await db.query<{ email: string }>(
          "SELECT email FROM public.list_portfolio_members_for_management($1)", [portfolioA],
        );
        expect(result.rows.map((row) => row.email).sort()).toEqual([
          "admin@example.com", "owner@example.com", "viewer@example.com",
        ]);
        const other = await db.query("SELECT * FROM public.list_portfolio_members_for_management($1)", [portfolioB]);
        expect(other.rows).toHaveLength(0);
      }

      await asUser(db, viewer);
      const viewerResult = await db.query("SELECT * FROM public.list_portfolio_members_for_management($1)", [portfolioA]);
      expect(viewerResult.rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("denies anonymous execution", async () => {
    const db = await createDatabase();
    try {
      await db.exec("SET ROLE anon");
      await expect(db.query("SELECT * FROM public.list_portfolio_members_for_management($1)", [portfolioA]))
        .rejects.toThrow("permission denied");
    } finally {
      await db.close();
    }
  });
});
