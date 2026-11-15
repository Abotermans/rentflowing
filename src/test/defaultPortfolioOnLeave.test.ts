// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const userId = "61000000-0000-4000-8000-000000000001";
const first = "61000000-0000-4000-8000-000000000002";
const second = "61000000-0000-4000-8000-000000000003";
const other = "61000000-0000-4000-8000-000000000004";

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE ROLE service_role;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, default_portfolio_id uuid);
    CREATE TABLE public.portfolio_members (
      id uuid PRIMARY KEY, user_id uuid NOT NULL, portfolio_id uuid NOT NULL,
      joined_at timestamptz NOT NULL
    );
    INSERT INTO public.portfolio_members VALUES
      ('61000000-0000-4000-8000-000000000012', '${userId}', '${first}', '2026-01-01'),
      ('61000000-0000-4000-8000-000000000013', '${userId}', '${second}', '2026-02-01');
  `);
  return db;
}

const migration = await readFile(new URL("../../supabase/migrations/20261107280000_keep_default_portfolio_accessible.sql", import.meta.url), "utf8");

describe("accessible default portfolio", () => {
  it("repairs an inaccessible legacy preference and blocks future forged defaults", async () => {
    const db = await database();
    try {
      await db.exec(`INSERT INTO public.profiles VALUES ('${userId}', '${other}')`);
      await db.exec(migration);
      const preferred = () => db.query<{ default_portfolio_id: string | null }>(
        `SELECT default_portfolio_id::text FROM public.profiles WHERE id = '${userId}'`,
      );
      expect((await preferred()).rows[0].default_portfolio_id).toBe(first);
      await db.exec(`UPDATE public.profiles SET default_portfolio_id = '${second}' WHERE id = '${userId}'`);
      expect((await preferred()).rows[0].default_portfolio_id).toBe(second);
      await expect(db.exec(`UPDATE public.profiles SET default_portfolio_id = '${other}' WHERE id = '${userId}'`))
        .rejects.toThrow("Default portfolio must be an active membership");
      expect((await preferred()).rows[0].default_portfolio_id).toBe(second);
    } finally {
      await db.close();
    }
  });

  it("chooses another membership after departure and clears the final preference", async () => {
    const db = await database();
    try {
      await db.exec(`INSERT INTO public.profiles VALUES ('${userId}', '${first}')`);
      await db.exec(migration);
      await db.exec(`DELETE FROM public.portfolio_members WHERE portfolio_id = '${first}'`);
      const preferred = () => db.query<{ default_portfolio_id: string | null }>(
        `SELECT default_portfolio_id::text FROM public.profiles WHERE id = '${userId}'`,
      );
      expect((await preferred()).rows[0].default_portfolio_id).toBe(second);
      await db.exec(`DELETE FROM public.portfolio_members WHERE portfolio_id = '${second}'`);
      expect((await preferred()).rows[0].default_portfolio_id).toBeNull();
    } finally {
      await db.close();
    }
  });
});
