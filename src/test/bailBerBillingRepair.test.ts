// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const repair = readFile(new URL("../../scripts/repair-bail-ber-001.sql", import.meta.url), "utf8");
const leaseId = "52694c9c-1ec2-4581-b289-5bfcd618326f";
const mainUnitId = "7effa754-d886-46a9-a601-df68fe7b65bc";

async function demoDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.leases (
      id uuid PRIMARY KEY, portfolio_id uuid, lease_reference text, lifecycle_stage text,
      property_id uuid, billing_tenant_id uuid, start_date date, end_date date,
      due_day_of_month integer, rent_formula integer, monthly_rent numeric, monthly_charges numeric
    );
    CREATE TABLE public.lease_unit_assignments (
      id uuid PRIMARY KEY, lease_id uuid, portfolio_id uuid, unit_id uuid,
      start_date date, end_date date, rent_share numeric, charges_share numeric
    );
    CREATE TABLE public.receivable_items (
      id uuid PRIMARY KEY, lease_id uuid, portfolio_id uuid, property_id uuid,
      tenant_id uuid, unit_id uuid, origin text, currency_code text, status text,
      allocated_amount numeric, outstanding_amount numeric, expected_amount numeric,
      due_date date, period_month text, item_type text, cycle_index integer,
      cycle_end_date date, label text, notes text, priority integer
    );
    CREATE TABLE public.receipt_allocations (id uuid PRIMARY KEY, receivable_item_id uuid);
    CREATE TABLE public.cash_receipts (id uuid PRIMARY KEY, lease_id uuid);
    CREATE TABLE public.charges_reconciliations (id uuid PRIMARY KEY, lease_id uuid, receivable_item_id uuid);
    CREATE TABLE public.lease_amendments (id uuid PRIMARY KEY, lease_id uuid);
    INSERT INTO public.leases VALUES (
      '${leaseId}', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'BAIL-BER-001', 'active',
      '222d1577-6e88-4606-8b32-97ff5794a222', '4c4ca095-b6c4-4bc8-af5f-f895c56b9c4b',
      '2025-04-01', '2028-03-31', 1, 1, 910, 250
    );
    INSERT INTO public.lease_unit_assignments VALUES
      ('00000000-0000-4000-8000-000000000001', '${leaseId}',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '${mainUnitId}',
       '2025-04-01', '2028-03-31', 850, 190),
      ('00000000-0000-4000-8000-000000000002', '${leaseId}',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       'fa7daf21-cb8b-48a6-9c6a-132eefcf4b08',
       '2025-04-01', '2028-03-31', 60, 0);
    WITH months AS (
      SELECT n, ('2025-04-01'::date + (n || ' months')::interval)::date AS due_date
      FROM generate_series(0, 19) AS n
    )
    INSERT INTO public.receivable_items
    SELECT
      ('00000000-0000-4000-8000-' || lpad((m.n * 4 + t.offset_id + v.variant + 1)::text, 12, '0'))::uuid,
      '${leaseId}'::uuid, 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid,
      '222d1577-6e88-4606-8b32-97ff5794a222'::uuid,
      '4c4ca095-b6c4-4bc8-af5f-f895c56b9c4b'::uuid,
      CASE WHEN m.n < 16 AND v.variant = 0 THEN '${mainUnitId}'::uuid
        ELSE 'fa7daf21-cb8b-48a6-9c6a-132eefcf4b08'::uuid END,
      'lease-schedule', 'EUR', 'open', 0, t.amount, t.amount,
      m.due_date, to_char(m.due_date, 'YYYY-MM'), t.item_type, m.n + 1,
      (date_trunc('month', m.due_date) + interval '1 month - 1 day')::date,
      t.label, '', t.priority
    FROM months m
    CROSS JOIN (VALUES ('rent', 910, 10, 'Monthly Rent', 0),
      ('charges', 250, 20, 'Monthly Charges', 2)) AS t(item_type, amount, priority, label, offset_id)
    CROSS JOIN LATERAL generate_series(0, CASE WHEN m.n < 16 THEN 1 ELSE 0 END) AS v(variant);
  `);
  return db;
}

async function counts(db: PGlite): Promise<{ rows: number; charges: number; storage: number; leaseCharges: number }> {
  const rows = (await db.query<{ rows: number; charges: number; storage: number }>(`
    SELECT count(*)::int AS rows,
      count(*) FILTER (WHERE item_type = 'charges' AND expected_amount = 190)::int AS charges,
      count(*) FILTER (WHERE unit_id <> '${mainUnitId}')::int AS storage
    FROM public.receivable_items WHERE lease_id = '${leaseId}'
  `)).rows[0];
  const lease = (await db.query<{ monthly_charges: number }>(`
    SELECT monthly_charges::int FROM public.leases WHERE id = '${leaseId}'
  `)).rows[0];
  return { ...rows, leaseCharges: lease.monthly_charges };
}

describe("BAIL-BER-001 guarded billing repair", () => {
  it("keeps one bill per cycle, corrects charges, and anchors bills to the main unit", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(await repair);
      expect(await counts(db)).toEqual({ rows: 40, charges: 20, storage: 0, leaseCharges: 190 });
      const before = (await db.query<{ entity: string; rows: number }>(`
        SELECT entity, count(*)::int AS rows
        FROM repair_audit.bail_ber_001_20261115 GROUP BY entity ORDER BY entity
      `)).rows;
      expect(before).toEqual([{ entity: "lease", rows: 1 }, { entity: "receivable", rows: 72 }]);
      const originalCharges = (await db.query<{ amount: number }>(`
        SELECT (before_row->>'monthly_charges')::int AS amount
        FROM repair_audit.bail_ber_001_20261115 WHERE entity = 'lease'
      `)).rows[0];
      expect(originalCharges.amount).toBe(250);
      const storageBefore = (await db.query<{ rows: number }>(`
        SELECT count(*)::int AS rows FROM repair_audit.bail_ber_001_20261115
        WHERE entity = 'receivable'
          AND before_row->>'unit_id' = 'fa7daf21-cb8b-48a6-9c6a-132eefcf4b08'
      `)).rows[0];
      expect(storageBefore.rows).toBe(40);
    } finally {
      await db.close();
    }
  });

  it("rolls back when a receivable has already been paid", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`UPDATE public.receivable_items SET status = 'paid', allocated_amount = 250,
        outstanding_amount = 0 WHERE item_type = 'charges' AND due_date = '2026-11-01'`);
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect(await counts(db)).toEqual({ rows: 72, charges: 0, storage: 40, leaseCharges: 250 });
      expect((await db.query<{ backup: string | null }>(`
        SELECT to_regclass('repair_audit.bail_ber_001_20261115')::text AS backup
      `)).rows[0].backup).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("rolls back when an unexpected schedule row appears", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`INSERT INTO public.receivable_items
        SELECT '00000000-0000-4000-8000-000000000099'::uuid, lease_id,
          portfolio_id, property_id, tenant_id, unit_id, origin, currency_code,
          status, allocated_amount, outstanding_amount, expected_amount,
          '2026-12-01'::date, '2026-12', item_type, 21,
          '2026-12-31'::date, label, notes, priority
        FROM public.receivable_items WHERE due_date = '2026-11-01' AND item_type = 'rent'`);
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect((await counts(db)).leaseCharges).toBe(250);
    } finally {
      await db.close();
    }
  });

  it("refuses to delete a receivable linked to a receipt allocation", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`INSERT INTO public.receipt_allocations
        SELECT '00000000-0000-4000-8000-000000000098'::uuid, id
        FROM public.receivable_items
        WHERE due_date = '2025-04-01' AND item_type = 'rent'
          AND unit_id = 'fa7daf21-cb8b-48a6-9c6a-132eefcf4b08'`);
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect(await counts(db)).toEqual({ rows: 72, charges: 0, storage: 40, leaseCharges: 250 });
    } finally {
      await db.close();
    }
  });
});
