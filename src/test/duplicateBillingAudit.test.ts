// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("repeated billing-slot audit", () => {
  it("reports combined exposure and linked payments without changing rows", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.leases (id text PRIMARY KEY, lease_reference text, property_id text);
        CREATE TABLE public.properties (id text PRIMARY KEY, name text);
        CREATE TABLE public.units (id text PRIMARY KEY, unit_code text);
        CREATE TABLE public.receivable_items (
          id text PRIMARY KEY, portfolio_id text, lease_id text, unit_id text,
          item_type text, due_date date, period_month text, origin text,
          currency_code text, status text, expected_amount numeric,
          allocated_amount numeric, outstanding_amount numeric,
          cycle_end_date date, updated_at timestamptz, created_at timestamptz
        );
        CREATE TABLE public.receipt_allocations (receivable_item_id text);
        INSERT INTO public.properties VALUES ('property', 'Test property');
        INSERT INTO public.leases VALUES ('lease', 'TEST-1', 'property');
        INSERT INTO public.units VALUES ('unit-1', 'A'), ('unit-2', 'B');
        INSERT INTO public.receivable_items VALUES
          ('paid', 'portfolio', 'lease', 'unit-1', 'rent', '2026-01-01', '2026-01',
           'lease-schedule', 'EUR', 'paid', 100, 100, 0, '2026-01-31', now(), now()),
          ('open', 'portfolio', 'lease', 'unit-2', 'rent', '2026-01-01', '2026-01',
           'lease-schedule', 'GBP', 'open', 100, 0, 100, '2026-01-31', now(), now());
        INSERT INTO public.receipt_allocations VALUES ('paid');
      `);
      const sql = await readFile(new URL("../../scripts/audit-duplicate-lease-billing-slots.sql", import.meta.url), "utf8");
      const result = await db.query<{
        billing_slot_expected: string;
        billing_slot_allocated: string;
        billing_slot_outstanding: string;
        billing_slot_units: number;
        billing_slot_currencies: number;
        receipt_allocation_count: number;
      }>(sql);
      expect(result.rows).toHaveLength(2);
      expect(result.rows.map(row => Number(row.receipt_allocation_count)).sort()).toEqual([0, 1]);
      for (const row of result.rows) {
        expect(Number(row.billing_slot_expected)).toBe(200);
        expect(Number(row.billing_slot_allocated)).toBe(100);
        expect(Number(row.billing_slot_outstanding)).toBe(100);
        expect(Number(row.billing_slot_units)).toBe(2);
        expect(Number(row.billing_slot_currencies)).toBe(2);
      }
      const count = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM public.receivable_items");
      expect(count.rows[0].count).toBe(2);
    } finally {
      await db.close();
    }
  });
});
