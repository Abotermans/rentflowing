// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const repair = readFile(new URL("../../scripts/repair-bail-par-003.sql", import.meta.url), "utf8");
const leaseId = "bf75b74c-7cc0-483d-8b36-3cc131c11d66";
const portfolioId = "d26a0ef7-d0ee-41ba-8da7-51af3f0369b7";
const propertyId = "1e6b3a25-7b20-4979-b86a-225676598528";
const tenantId = "cb7892a0-d718-4154-bfb7-a3a0aceed577";
const mainUnitId = "682da39a-fd16-425a-8291-e1cbb5fc226d";
const parkingUnitId = "618361ab-46be-4d6e-858b-0f7e8e9ad611";
const studioUnitId = "78ea5689-f402-45c0-b245-63db978ae9ad";

async function seededDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.leases (id uuid PRIMARY KEY, portfolio_id uuid,
      lease_reference text, property_id uuid, billing_tenant_id uuid,
      lifecycle_stage text, start_date date, end_date date,
      due_day_of_month integer, rent_formula integer,
      monthly_rent numeric, monthly_charges numeric);
    CREATE TABLE public.lease_unit_assignments (id uuid PRIMARY KEY,
      lease_id uuid, portfolio_id uuid, unit_id uuid, start_date date,
      end_date date, rent_share numeric, charges_share numeric);
    CREATE TABLE public.receivable_items (id uuid PRIMARY KEY,
      lease_id uuid, portfolio_id uuid, property_id uuid, tenant_id uuid,
      unit_id uuid, item_type text, origin text, currency_code text,
      due_date date, period_month text, cycle_end_date date, cycle_index integer,
      expected_amount numeric, outstanding_amount numeric, allocated_amount numeric,
      status text, label text, notes text, priority integer);
    CREATE TABLE public.receipt_allocations (id uuid PRIMARY KEY, receivable_item_id uuid);
    CREATE TABLE public.cash_receipts (id uuid PRIMARY KEY, lease_id uuid);
    CREATE TABLE public.charges_reconciliations (id uuid PRIMARY KEY,
      lease_id uuid, receivable_item_id uuid);
    CREATE TABLE public.lease_amendments (id uuid PRIMARY KEY, lease_id uuid);
    INSERT INTO public.leases VALUES ('${leaseId}', '${portfolioId}',
      'BAIL-PAR-003', '${propertyId}', '${tenantId}', 'signed',
      '2026-07-01', '2029-06-30', 5, 1, 2320, 230);
    INSERT INTO public.lease_unit_assignments VALUES
      ('00000000-0000-4000-8000-000000000001', '${leaseId}', '${portfolioId}',
        '${mainUnitId}', '2026-07-01', NULL, 1350, 150),
      ('00000000-0000-4000-8000-000000000002', '${leaseId}', '${portfolioId}',
        '${parkingUnitId}', '2026-07-01', NULL, 120, 0),
      ('00000000-0000-4000-8000-000000000003', '${leaseId}', '${portfolioId}',
        '${studioUnitId}', '2026-07-01', NULL, 850, 80);
  `);
  const ids = {
    rent: ["49f4b7c6-4540-48c8-a7e8-9c9f353b2d31", "fa16c3e8-bda3-45b7-ad21-367ab1c3b7d4",
      "a857bbec-461c-480d-b189-85d668dead20", "d851d94d-7cce-4ea5-a058-81087aa4b58b",
      "8878814d-fcc2-401a-bda2-1e65ed1d02c3", "30ee32d7-37dd-4c75-994e-299d1ad063d7"],
    charges: ["9bff18ac-8fa7-4905-a628-c42d3fd77500", "7e0f2ec8-1e62-484d-8a53-c11c514f94f8",
      "1560d4ba-3a1f-4987-bd4b-5fc6896cd831", "8a01b95c-0385-44be-85e9-3f9c3f382fb3",
      "3ce36f9d-8d03-4a84-8cd2-a3a974f2af43", "17fec932-ec7a-45c4-9a35-fd8c39ae79c6"],
  } as const;
  for (const [itemType, itemIds] of Object.entries(ids)) {
    for (let index = 0; index < itemIds.length; index += 1) {
      const month = index <= 1 ? 7 : index + 6;
      const monthText = String(month).padStart(2, "0");
      const cycleEnd = new Date(Date.UTC(2026, month, 0)).toISOString().slice(0, 10);
      const amount = itemType === "rent" ? 2320 : 230;
      await db.query(`INSERT INTO public.receivable_items VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
         $7, 'lease-schedule', 'GBP', $8::date, $9, $10::date, $11,
         $12, $12, 0, 'open', $13, '', $14)`, [
        itemIds[index], leaseId, portfolioId, propertyId, tenantId,
        index === 1 ? mainUnitId : parkingUnitId,
        itemType, `2026-${monthText}-05`, `2026-${monthText}`, cycleEnd,
        index <= 1 ? 1 : index,
        amount, itemType === "rent" ? "Monthly Rent" : "Monthly Charges",
        itemType === "rent" ? 10 : 20,
      ]);
    }
  }
  return db;
}

describe("BAIL-PAR-003 guarded billing repair", () => {
  it("removes only the parking duplicates and reanchors later bills", async () => {
    const db = await seededDatabase();
    try {
      await db.exec(await repair);
      const rows = await db.query<{ rows: number; parking: number; rent: number; charges: number }>(`
        SELECT count(*)::int AS rows,
          count(*) FILTER (WHERE unit_id = '${parkingUnitId}')::int AS parking,
          count(*) FILTER (WHERE item_type = 'rent')::int AS rent,
          count(*) FILTER (WHERE item_type = 'charges')::int AS charges
        FROM public.receivable_items WHERE lease_id = '${leaseId}'
      `);
      expect(rows.rows[0]).toEqual({ rows: 10, parking: 0, rent: 5, charges: 5 });
      expect((await db.query("SELECT row_id FROM repair_audit.bail_par_003_20261115")).rows).toHaveLength(12);
    } finally {
      await db.close();
    }
  });

  it("rolls back if a bill receives an allocation before repair", async () => {
    const db = await seededDatabase();
    try {
      await db.exec(`INSERT INTO public.receipt_allocations VALUES
        ('00000000-0000-4000-8000-000000000099',
         '49f4b7c6-4540-48c8-a7e8-9c9f353b2d31')`);
      await expect(db.exec(await repair)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect((await db.query("SELECT id FROM public.receivable_items")).rows).toHaveLength(12);
      expect((await db.query("SELECT to_regclass('repair_audit.bail_par_003_20261115') AS backup")).rows)
        .toEqual([{ backup: null }]);
    } finally {
      await db.close();
    }
  });
});
