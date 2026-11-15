// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const repair = readFile(new URL("../../scripts/repair-demo-assignment-pricing.sql", import.meta.url), "utf8");

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
      start_date date NOT NULL, monthly_rent numeric NOT NULL,
      monthly_charges numeric NOT NULL
    );
    CREATE TABLE public.lease_unit_assignments (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL,
      unit_id uuid NOT NULL, start_date date NOT NULL, end_date date,
      rent_share numeric, charges_share numeric
    );
    CREATE TABLE public.lease_amendments (id uuid PRIMARY KEY, lease_id uuid NOT NULL);
    CREATE TABLE public.lease_amendment_changes (amendment_id uuid NOT NULL, field_name text);
    INSERT INTO public.properties VALUES
      ('00000000-0000-4000-8000-000000000001', 'EUR'),
      ('00000000-0000-4000-8000-000000000002', 'GBP');
    INSERT INTO public.units VALUES
      ('c2577669-d780-4b0a-9f92-12102705a98a',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '00000000-0000-4000-8000-000000000001', 2600, 320),
      ('d157fcfa-e740-4f7b-8b9b-5ab3ea3a4976',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '00000000-0000-4000-8000-000000000002', 1800, 120),
      ('5561bdcc-9aa3-4a49-b8b3-33d66a4a83e3',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '00000000-0000-4000-8000-000000000002', 2200, 140);
    INSERT INTO public.leases VALUES
      ('7ebedef0-89d3-46eb-a1f9-5833a4e023d4',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '00000000-0000-4000-8000-000000000001',
       'BAIL-AMS-003', 'active', '2024-04-01', 2600, 320),
      ('813ae43e-bec1-4206-b299-f73e1d5bf2ad',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '00000000-0000-4000-8000-000000000002',
       'BAIL-LON-001', 'active', '2024-10-01', 1800, 120),
      ('17111997-78c5-45ac-a207-91e1ed96c4c3',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '00000000-0000-4000-8000-000000000002',
       'BAIL-LON-002', 'active', '2025-02-01', 2200, 140);
    INSERT INTO public.lease_unit_assignments VALUES
      ('cc57bf2f-34da-4484-acfc-ec7a9f024b41',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '7ebedef0-89d3-46eb-a1f9-5833a4e023d4',
       'c2577669-d780-4b0a-9f92-12102705a98a', '2024-04-01', NULL, NULL, NULL),
      ('d0f7cbd6-0e2d-4ced-b419-a26b706dc4de',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '813ae43e-bec1-4206-b299-f73e1d5bf2ad',
       'd157fcfa-e740-4f7b-8b9b-5ab3ea3a4976', '2024-10-01', NULL, NULL, NULL),
      ('91afded5-fa59-4215-8123-d07ad485b4bd',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', '17111997-78c5-45ac-a207-91e1ed96c4c3',
       '5561bdcc-9aa3-4a49-b8b3-33d66a4a83e3', '2025-02-01', NULL, NULL, NULL);
  `);
  return db;
}

describe("Demo assignment pricing repair", () => {
  it("fills only the three pinned null shares", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(await repair);
      const rows = (await db.query<{ rent_share: string; charges_share: string }>(
        "SELECT rent_share::text, charges_share::text FROM public.lease_unit_assignments ORDER BY id",
      )).rows;
      expect(rows).toEqual([
        { rent_share: "2200", charges_share: "140" },
        { rent_share: "2600", charges_share: "320" },
        { rent_share: "1800", charges_share: "120" },
      ]);
      const audit = (await db.query<{ count: string; null_count: string }>(`
        SELECT count(*)::text, count(*) FILTER (
          WHERE before_row->>'rent_share' IS NULL AND before_row->>'charges_share' IS NULL
        )::text AS null_count FROM repair_audit.active_assignment_pricing_20261115
      `)).rows[0];
      expect(audit).toEqual({ count: "3", null_count: "3" });
    } finally {
      await db.close();
    }
  });

  it("rolls back all three updates when a lease amount changed", async () => {
    const db = await demoDatabase();
    try {
      await db.exec("UPDATE public.leases SET monthly_charges = 130 WHERE lease_reference = 'BAIL-LON-001'");
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      const rows = (await db.query<{ count: string }>(
        "SELECT count(*)::text FROM public.lease_unit_assignments WHERE rent_share IS NULL AND charges_share IS NULL",
      )).rows;
      expect(Number(rows[0].count)).toBe(3);
      const auditTables = (await db.query<{ count: string }>(
        "SELECT count(*)::text FROM pg_tables WHERE schemaname = 'repair_audit'",
      )).rows;
      expect(Number(auditTables[0].count)).toBe(0);
    } finally {
      await db.close();
    }
  });

  it("refuses an extra assignment on one of the leases", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000099',
         'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7',
         '7ebedef0-89d3-46eb-a1f9-5833a4e023d4',
         'c2577669-d780-4b0a-9f92-12102705a98a', '2024-04-01', NULL, NULL, NULL)`);
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect(Number((await db.query<{ count: string }>(
        "SELECT count(*)::text FROM public.lease_unit_assignments WHERE rent_share IS NOT NULL",
      )).rows[0].count)).toBe(0);
    } finally {
      await db.close();
    }
  });

  it("refuses a price-changing amendment", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`
        INSERT INTO public.lease_amendments VALUES
          ('00000000-0000-4000-8000-000000000098',
           '813ae43e-bec1-4206-b299-f73e1d5bf2ad');
        INSERT INTO public.lease_amendment_changes VALUES
          ('00000000-0000-4000-8000-000000000098', 'unitRentShare');
      `);
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect(Number((await db.query<{ count: string }>(
        "SELECT count(*)::text FROM public.lease_unit_assignments WHERE rent_share IS NOT NULL",
      )).rows[0].count)).toBe(0);
    } finally {
      await db.close();
    }
  });
});
