// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-0000-0000-000000000001";
const id = (suffix: number) => `00000000-0000-0000-0000-${String(suffix).padStart(12, "0")}`;

describe("paid receivable deletion guard", () => {
  it("protects paid and receipt-linked rows while allowing unpaid cleanup and portfolio removal", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE TABLE public.portfolios (id uuid PRIMARY KEY);
        CREATE TABLE public.receivable_items (
          id uuid PRIMARY KEY,
          portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
          status text NOT NULL,
          allocated_amount numeric(14,2) NOT NULL DEFAULT 0
        );
        CREATE TABLE public.receipt_allocations (
          id uuid PRIMARY KEY,
          receivable_item_id uuid NOT NULL REFERENCES public.receivable_items(id) ON DELETE CASCADE
        );
      `);
      const migration = await readFile(new URL("../../supabase/migrations/20261107020000_guard_paid_receivable_deletion.sql", import.meta.url), "utf8");
      await db.exec(migration);
      await db.query("INSERT INTO public.portfolios (id) VALUES ($1)", [portfolio]);
      for (const [suffix, status, allocated] of [
        [1, "open", 0], [2, "paid", 0], [3, "open", 0],
        [4, "partially-paid", 0], [5, "open", 25],
      ] as const) {
        await db.query("INSERT INTO public.receivable_items (id, portfolio_id, status, allocated_amount) VALUES ($1, $2, $3, $4)",
          [id(suffix), portfolio, status, allocated]);
      }
      await db.query("INSERT INTO public.receipt_allocations (id, receivable_item_id) VALUES ($1, $2)", [id(31), id(3)]);

      await db.query("DELETE FROM public.receivable_items WHERE id = $1", [id(1)]);
      for (const suffix of [2, 3, 4, 5]) {
        await expect(db.query("DELETE FROM public.receivable_items WHERE id = $1", [id(suffix)]))
          .rejects.toThrow("Paid or receipt-linked receivables cannot be deleted");
      }
      await db.exec(`
        CREATE TABLE public.delete_requests (receivable_item_id uuid NOT NULL);
        CREATE FUNCTION public.delete_receivable_from_request()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          DELETE FROM public.receivable_items WHERE id = NEW.receivable_item_id;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER delete_receivable_from_request
        AFTER INSERT ON public.delete_requests
        FOR EACH ROW EXECUTE FUNCTION public.delete_receivable_from_request();
      `);
      await expect(db.query("INSERT INTO public.delete_requests (receivable_item_id) VALUES ($1)", [id(2)]))
        .rejects.toThrow("Paid or receipt-linked receivables cannot be deleted");
      await db.query("DELETE FROM public.portfolios WHERE id = $1", [portfolio]);
      const remaining = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM public.receivable_items");
      expect(remaining.rows[0].count).toBe(0);
    } finally {
      await db.close();
    }
  });
});
