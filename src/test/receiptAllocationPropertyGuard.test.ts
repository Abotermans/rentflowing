// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const propertyA = "20000000-0000-0000-0000-000000000001";
const propertyB = "20000000-0000-0000-0000-000000000002";
const receiptA = "30000000-0000-0000-0000-000000000001";
const receiptUnscoped = "30000000-0000-0000-0000-000000000002";
const itemA = "40000000-0000-0000-0000-000000000001";
const itemB = "40000000-0000-0000-0000-000000000002";

describe("receipt allocation property guard", () => {
  it("blocks cross-property allocations without rewriting existing rows", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE TABLE public.cash_receipts (id uuid PRIMARY KEY, property_id uuid);
        CREATE TABLE public.receivable_items (id uuid PRIMARY KEY, property_id uuid);
        CREATE TABLE public.receipt_allocations (
          id uuid PRIMARY KEY, cash_receipt_id uuid NOT NULL, receivable_item_id uuid NOT NULL
        );
        INSERT INTO public.cash_receipts VALUES
          ('${receiptA}', '${propertyA}'), ('${receiptUnscoped}', NULL);
        INSERT INTO public.receivable_items VALUES
          ('${itemA}', '${propertyA}'), ('${itemB}', '${propertyB}');
        INSERT INTO public.receipt_allocations VALUES
          ('50000000-0000-0000-0000-000000000001', '${receiptA}', '${itemB}');
      `);
      const migration = await readFile(new URL("../../supabase/migrations/20261107240000_guard_receipt_allocation_property.sql", import.meta.url), "utf8");
      await db.exec(migration);
      await db.query("INSERT INTO public.receipt_allocations VALUES ($1, $2, $3)", [
        "50000000-0000-0000-0000-000000000002", receiptA, itemA,
      ]);
      await db.query("INSERT INTO public.receipt_allocations VALUES ($1, $2, $3)", [
        "50000000-0000-0000-0000-000000000003", receiptUnscoped, itemB,
      ]);
      await expect(db.query("INSERT INTO public.receipt_allocations VALUES ($1, $2, $3)", [
        "50000000-0000-0000-0000-000000000004", receiptA, itemB,
      ])).rejects.toThrow("Receipt property does not match receivable property");
      await expect(db.query("UPDATE public.receipt_allocations SET receivable_item_id = $1 WHERE id = $2", [
        itemB, "50000000-0000-0000-0000-000000000002",
      ])).rejects.toThrow("Receipt property does not match receivable property");

      const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
      const check = audit.match(/SELECT 'receipt_allocation_property_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
      expect(check).toBeTruthy();
      const result = await db.query<{ count: number }>(check!);
      expect(Number(result.rows[0].count)).toBe(1);
    } finally {
      await db.close();
    }
  });
});
