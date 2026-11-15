// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const propertyId = "00000000-0000-0000-0000-000000000001";

describe("property currency database guard", () => {
  it("allows an unused property's currency to change, then blocks relabeling linked amounts", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (id uuid PRIMARY KEY, currency_code text NOT NULL);
        CREATE TABLE public.units (property_id uuid NOT NULL);
        CREATE TABLE public.leases (property_id uuid NOT NULL);
        CREATE TABLE public.receivable_items (property_id uuid NOT NULL);
        CREATE TABLE public.cash_receipts (property_id uuid NOT NULL);
        CREATE TABLE public.cost_entries (property_id uuid NOT NULL);
      `);
      const migration = await readFile(new URL("../../supabase/migrations/20261107120000_guard_property_currency_after_use.sql", import.meta.url), "utf8");
      await db.exec(migration);
      await db.query("INSERT INTO public.properties (id, currency_code) VALUES ($1, 'EUR')", [propertyId]);
      await db.query("UPDATE public.properties SET currency_code = 'GBP' WHERE id = $1", [propertyId]);

      for (const table of ["units", "leases", "receivable_items", "cash_receipts", "cost_entries"]) {
        await db.query(`INSERT INTO public.${table} (property_id) VALUES ($1)`, [propertyId]);
        await expect(db.query("UPDATE public.properties SET currency_code = 'EUR' WHERE id = $1", [propertyId]))
          .rejects.toThrow("Property currency cannot change");
        await db.query("UPDATE public.properties SET currency_code = 'GBP' WHERE id = $1", [propertyId]);
        await db.query(`DELETE FROM public.${table} WHERE property_id = $1`, [propertyId]);
      }
      const result = await db.query<{ currency_code: string }>("SELECT currency_code FROM public.properties WHERE id = $1", [propertyId]);
      expect(result.rows[0].currency_code).toBe("GBP");
    } finally {
      await db.close();
    }
  });
});
