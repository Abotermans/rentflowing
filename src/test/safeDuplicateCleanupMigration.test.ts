// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-0000-0000-000000000001";
const lease = "00000000-0000-0000-0000-000000000011";
const unit = "00000000-0000-0000-0000-000000000021";
const otherUnit = "00000000-0000-0000-0000-000000000022";
const version = "2026-11-07T08:00:00Z";
const id = (suffix: number) => `00000000-0000-0000-0000-${String(suffix).padStart(12, "0")}`;

async function database(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT '00000000-0000-0000-0000-000000000099'::uuid $$;
    CREATE FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
      RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE public.receivable_items (
      id uuid PRIMARY KEY,
      portfolio_id uuid NOT NULL,
      lease_id uuid,
      tenant_id uuid,
      property_id uuid,
      unit_id uuid,
      item_type text NOT NULL,
      origin text NOT NULL,
      period_month text,
      due_date date NOT NULL,
      currency_code text NOT NULL,
      expected_amount numeric(14,2) NOT NULL,
      cycle_index integer,
      cycle_end_date date,
      allocated_amount numeric(14,2) NOT NULL,
      outstanding_amount numeric(14,2) NOT NULL,
      status text NOT NULL,
      label text NOT NULL,
      notes text NOT NULL,
      priority integer NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE public.receipt_allocations (
      id uuid PRIMARY KEY,
      receivable_item_id uuid NOT NULL REFERENCES public.receivable_items(id) ON DELETE CASCADE
    );
  `);
  const migration = await readFile(new URL("../../supabase/migrations/20261107010000_safe_duplicate_receivable_cleanup.sql", import.meta.url), "utf8");
  await db.exec(migration);
  return db;
}

async function insert(db: PGlite, suffix: number, overrides: {
  unitId?: string; currency?: string; status?: string; allocated?: number; outstanding?: number;
  expected?: number; cycleEndDate?: string;
} = {}) {
  await db.query(`INSERT INTO public.receivable_items (
    id, portfolio_id, lease_id, tenant_id, property_id, unit_id, item_type, origin,
    period_month, due_date, currency_code, expected_amount, cycle_end_date, allocated_amount,
    outstanding_amount, status, label, notes, priority, updated_at
  ) VALUES ($1, $2, $3, $4, $5, $6, 'rent', 'lease-schedule', '2026-10',
    '2026-10-01', $7, $8, $9, $10, $11, $12, 'Rent', '', 10, $13)`, [
    id(suffix), portfolio, lease, id(31), id(41), overrides.unitId ?? unit,
    overrides.currency ?? "EUR", overrides.expected ?? 100, overrides.cycleEndDate ?? null,
    overrides.allocated ?? 0,
    overrides.outstanding ?? overrides.expected ?? 100, overrides.status ?? "open", version,
  ]);
}

async function clean(db: PGlite, suffixes: number[], expectedVersion = version) {
  return db.query<{ result: { deleted: number } }>(
    "SELECT public.delete_duplicate_lease_receivables($1, $2::jsonb) AS result",
    [portfolio, JSON.stringify(suffixes.map(suffix => ({ id: id(suffix), expected_updated_at: expectedVersion })))],
  );
}

describe("safe duplicate receivable cleanup", () => {
  it("atomically removes exact untouched duplicates but never the last bill", async () => {
    const db = await database();
    try {
      await insert(db, 1);
      await insert(db, 2);
      await insert(db, 3);
      expect((await clean(db, [2, 3])).rows[0].result.deleted).toBe(2);
      await expect(clean(db, [1])).rejects.toThrow("No matching duplicate remains");
      const remaining = await db.query<{ id: string }>("SELECT id FROM public.receivable_items");
      expect(remaining.rows.map(row => row.id)).toEqual([id(1)]);
    } finally {
      await db.close();
    }
  });

  it("rolls back a batch that would remove both copies", async () => {
    const db = await database();
    try {
      await insert(db, 1);
      await insert(db, 2);
      await expect(clean(db, [1, 2])).rejects.toThrow("No matching duplicate remains");
      const remaining = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM public.receivable_items");
      expect(remaining.rows[0].count).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("allows a different unit attribution but rejects unequal bills", async () => {
    const db = await database();
    try {
      await insert(db, 1);
      await insert(db, 2, { unitId: otherUnit });
      expect((await clean(db, [2])).rows[0].result.deleted).toBe(1);
      await insert(db, 3, { unitId: otherUnit, expected: 150 });
      await expect(clean(db, [3])).rejects.toThrow("No matching duplicate remains");
      await insert(db, 6, { unitId: otherUnit, cycleEndDate: "2026-12-31" });
      await expect(clean(db, [6])).rejects.toThrow("No matching duplicate remains");
      const remaining = await db.query<{ id: string }>("SELECT id FROM public.receivable_items ORDER BY id");
      expect(remaining.rows.map(row => row.id)).toEqual([id(1), id(3), id(6)]);
    } finally {
      await db.close();
    }
  });

  it("rejects stale, different-currency, paid and receipt-linked rows", async () => {
    const db = await database();
    try {
      await insert(db, 1);
      await insert(db, 2, { currency: "GBP" });
      await expect(clean(db, [2])).rejects.toThrow("No matching duplicate remains");
      await insert(db, 3, { currency: "GBP", expected: 150 });
      await expect(clean(db, [3])).rejects.toThrow("No matching duplicate remains");
      await insert(db, 4, { status: "paid", allocated: 100, outstanding: 0 });
      await expect(clean(db, [4])).rejects.toThrow("paid, allocated, or no longer open");
      await insert(db, 5);
      await db.query("INSERT INTO public.receipt_allocations (id, receivable_item_id) VALUES ($1, $2)", [id(51), id(5)]);
      await expect(clean(db, [5])).rejects.toThrow("paid, allocated, or no longer open");
      await expect(clean(db, [5], "2026-11-06T08:00:00Z")).rejects.toThrow("changed since review");
      const remaining = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM public.receivable_items");
      expect(remaining.rows[0].count).toBe(5);
    } finally {
      await db.close();
    }
  });

  it("requires an owner or administrator", async () => {
    const db = await database();
    try {
      await insert(db, 1);
      await insert(db, 2);
      await db.exec(`CREATE OR REPLACE FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
        RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;`);
      await expect(clean(db, [2])).rejects.toThrow("not permitted");
    } finally {
      await db.close();
    }
  });
});
