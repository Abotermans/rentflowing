// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const originalMigration = readFile(new URL("../../supabase/migrations/20261015120000_prevent_duplicate_lease_receivables.sql", import.meta.url), "utf8");
const hotfix = readFile(new URL("../../scripts/hotfix-lease-billing-slot-guard.sql", import.meta.url), "utf8");
const portfolio = "00000000-0000-0000-0000-000000000001";
const lease = "00000000-0000-0000-0000-000000000011";

async function legacyDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.receivable_items (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid,
      unit_id uuid, item_type text NOT NULL, origin text NOT NULL,
      period_month text, due_date date NOT NULL, cycle_index integer,
      cycle_end_date date, status text
    );
  `);
  await db.exec(await originalMigration);
  return db;
}

describe("targeted lease billing slot hotfix", () => {
  it("rejects cross-unit and retimed duplicate bills but allows distinct segments", async () => {
    const db = await legacyDatabase();
    try {
      await db.exec(await hotfix);
      const insert = (id: number, unit: number, due: string, cycleEnd: string) => db.query(`
        INSERT INTO public.receivable_items
          (id, portfolio_id, lease_id, unit_id, item_type, origin,
           period_month, due_date, cycle_end_date, status)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'rent',
          'lease-schedule', '2026-10', $5::date, $6::date, 'open')`, [
        `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`,
        portfolio, lease,
        `00000000-0000-0000-0000-${String(unit).padStart(12, "0")}`,
        due, cycleEnd,
      ]);
      await insert(1, 21, "2026-10-01", "2026-10-31");
      await expect(insert(2, 22, "2026-10-01", "2026-10-31"))
        .rejects.toThrow("Duplicate lease-schedule receivable");
      await expect(insert(3, 22, "2026-10-20", "2026-10-31"))
        .rejects.toThrow("Duplicate lease-schedule receivable");
      await insert(4, 22, "2026-10-20", "2026-10-14");
      await db.query("UPDATE public.receivable_items SET status = 'paid' WHERE id = $1::uuid", [
        "00000000-0000-0000-0000-000000000001",
      ]);
      expect((await db.query("SELECT id FROM public.receivable_items")).rows).toHaveLength(2);
    } finally {
      await db.close();
    }
  });

  it("aborts without changing an unfamiliar target guard", async () => {
    const db = await legacyDatabase();
    try {
      await db.exec(`CREATE OR REPLACE FUNCTION public.prevent_duplicate_lease_receivable()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
      await expect(db.exec(await hotfix)).rejects.toThrow("hotfix aborted");
      await db.exec("ROLLBACK");
      const functionBody = await db.query<{ definition: string }>(`
        SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'prevent_duplicate_lease_receivable'
      `);
      expect(functionBody.rows[0].definition).toContain("RETURN NEW");
      expect(functionBody.rows[0].definition).not.toContain("cycle_end_date = NEW.cycle_end_date");
    } finally {
      await db.close();
    }
  });
});
