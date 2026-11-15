// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const repair = readFile(new URL("../../scripts/repair-demo-historical-assignment-pricing.sql", import.meta.url), "utf8");

async function demoDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.properties (id uuid PRIMARY KEY, currency_code text NOT NULL);
    CREATE TABLE public.units (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
      base_rent numeric NOT NULL, base_charges numeric NOT NULL
    );
    CREATE TABLE public.leases (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
      lease_reference text NOT NULL, lifecycle_stage text NOT NULL,
      start_date date NOT NULL, end_date date NOT NULL,
      monthly_rent numeric NOT NULL, monthly_charges numeric NOT NULL
    );
    CREATE TABLE public.lease_unit_assignments (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL,
      unit_id uuid NOT NULL, start_date date NOT NULL, end_date date,
      rent_share numeric, charges_share numeric
    );
    CREATE TABLE public.lease_amendments (
      id uuid PRIMARY KEY, lease_id uuid NOT NULL, status text NOT NULL,
      effective_date date NOT NULL
    );
    CREATE TABLE public.lease_amendment_changes (amendment_id uuid NOT NULL, field_name text);
    INSERT INTO public.properties VALUES
      ('6dad2c85-9bf8-44d1-b331-1b55e1d5a5b7', 'EUR'),
      ('1e6b3a25-7b20-4979-b86a-225676598528', 'GBP');
    INSERT INTO public.units VALUES
      ('9c484f26-26b0-4e23-a690-b462e602b902', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '6dad2c85-9bf8-44d1-b331-1b55e1d5a5b7', 2200, 350),
      ('6b5eacf1-bc5f-4f3b-bd6d-4344ca6a66da', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '6dad2c85-9bf8-44d1-b331-1b55e1d5a5b7', 1100, 150),
      ('92ec6a02-e2e0-4031-896a-418b60f137d3', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '1e6b3a25-7b20-4979-b86a-225676598528', 1650, 180),
      ('78ea5689-f402-45c0-b245-63db978ae9ad', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '1e6b3a25-7b20-4979-b86a-225676598528', 850, 80);
    INSERT INTO public.leases VALUES
      ('beb5db9a-2a6c-4e95-9713-65c0a5775a63', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '6dad2c85-9bf8-44d1-b331-1b55e1d5a5b7', 'BAIL-BRU-003', 'ended',
       '2025-07-01', '2026-06-17', 2200, 350),
      ('49da25a6-2ec1-4b00-9fd5-6ac6f4e2b300', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '6dad2c85-9bf8-44d1-b331-1b55e1d5a5b7', 'BAIL-BRU-004', 'terminated',
       '2024-01-01', '2025-05-31', 1100, 150),
      ('fa49dad6-532b-4efe-a059-726e4d4b5f54', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '1e6b3a25-7b20-4979-b86a-225676598528', 'BAIL-PAR-002', 'ended',
       '2023-09-01', '2025-12-31', 1600, 180),
      ('b922d1c1-1bf7-4163-aef5-ebe40c67ab4a', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '1e6b3a25-7b20-4979-b86a-225676598528', 'BAIL-PAR-004', 'ended',
       '2022-01-01', '2023-12-31', 820, 80);
    INSERT INTO public.lease_unit_assignments VALUES
      ('17f52226-a44a-4ba7-93b5-20af8db5a7d2', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       'beb5db9a-2a6c-4e95-9713-65c0a5775a63', '9c484f26-26b0-4e23-a690-b462e602b902',
       '2025-07-01', '2026-06-17', NULL, NULL),
      ('2a5c8a0c-9476-4aaa-a765-a22c2cea6cd4', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       '49da25a6-2ec1-4b00-9fd5-6ac6f4e2b300', '6b5eacf1-bc5f-4f3b-bd6d-4344ca6a66da',
       '2024-01-01', '2025-05-31', NULL, NULL),
      ('076b4b1a-e12d-4c93-ac96-6888eb2bfa36', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       'fa49dad6-532b-4efe-a059-726e4d4b5f54', '92ec6a02-e2e0-4031-896a-418b60f137d3',
       '2023-09-01', '2025-12-31', NULL, NULL),
      ('57df90c9-6ba9-49d1-820d-6d44350efba1', 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
       'b922d1c1-1bf7-4163-aef5-ebe40c67ab4a', '78ea5689-f402-45c0-b245-63db978ae9ad',
       '2022-01-01', '2023-12-31', NULL, NULL);
    INSERT INTO public.lease_amendments VALUES
      ('1f42bf0a-1f59-45a3-8a11-d0c5ab3d9887',
       'beb5db9a-2a6c-4e95-9713-65c0a5775a63', 'draft', '2026-07-01');
    INSERT INTO public.lease_amendment_changes VALUES
      ('1f42bf0a-1f59-45a3-8a11-d0c5ab3d9887', 'baseMonthlyRentTotal');
  `);
  return db;
}

async function assertUntouched(db: PGlite) {
  const result = await db.query<{ count: string }>(
    "SELECT count(*)::text FROM public.lease_unit_assignments WHERE rent_share IS NULL AND charges_share IS NULL",
  );
  expect(Number(result.rows[0].count)).toBe(4);
  const audit = await db.query<{ count: string }>(
    "SELECT count(*)::text FROM pg_tables WHERE schemaname = 'repair_audit'",
  );
  expect(Number(audit.rows[0].count)).toBe(0);
}

describe("Demo historical assignment pricing repair", () => {
  it("uses contractual rent rather than later unit defaults and keeps four before-images", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(await repair);
      const rows = (await db.query<{ lease_reference: string; rent_share: string; charges_share: string }>(`
        SELECT l.lease_reference, a.rent_share::text, a.charges_share::text
        FROM public.lease_unit_assignments a JOIN public.leases l ON l.id = a.lease_id
        ORDER BY l.lease_reference
      `)).rows;
      expect(rows).toEqual([
        { lease_reference: "BAIL-BRU-003", rent_share: "2200", charges_share: "350" },
        { lease_reference: "BAIL-BRU-004", rent_share: "1100", charges_share: "150" },
        { lease_reference: "BAIL-PAR-002", rent_share: "1600", charges_share: "180" },
        { lease_reference: "BAIL-PAR-004", rent_share: "820", charges_share: "80" },
      ]);
      const audit = await db.query<{ count: string; null_count: string }>(`
        SELECT count(*)::text, count(*) FILTER (
          WHERE before_row->>'rent_share' IS NULL AND before_row->>'charges_share' IS NULL
        )::text AS null_count FROM repair_audit.historical_assignment_pricing_20261115
      `);
      expect(audit.rows[0]).toEqual({ count: "4", null_count: "4" });
    } finally {
      await db.close();
    }
  });

  it("rolls back all four assignments if a contract amount changed", async () => {
    const db = await demoDatabase();
    try {
      await db.exec("UPDATE public.leases SET monthly_rent = 1650 WHERE lease_reference = 'BAIL-PAR-002'");
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      await assertUntouched(db);
    } finally {
      await db.close();
    }
  });

  it("rolls back if the draft pricing amendment becomes active", async () => {
    const db = await demoDatabase();
    try {
      await db.exec("UPDATE public.lease_amendments SET status = 'active' WHERE id = '1f42bf0a-1f59-45a3-8a11-d0c5ab3d9887'");
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      await assertUntouched(db);
    } finally {
      await db.close();
    }
  });

  it("rolls back if a second unit is assigned", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000099',
         'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
         'b922d1c1-1bf7-4163-aef5-ebe40c67ab4a',
         '78ea5689-f402-45c0-b245-63db978ae9ad',
         '2022-01-01', '2023-12-31', NULL, NULL)`);
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      const result = await db.query<{ count: string }>(
        "SELECT count(*)::text FROM public.lease_unit_assignments WHERE rent_share IS NOT NULL",
      );
      expect(Number(result.rows[0].count)).toBe(0);
    } finally {
      await db.close();
    }
  });
});
