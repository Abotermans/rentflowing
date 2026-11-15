// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261018235000_guard_receipt_allocation_balance.sql", import.meta.url);
const receipt = "78000000-0000-4000-8000-000000000001";
const allocation = "78000000-0000-4000-8000-000000000002";
const refunded = "78000000-0000-4000-8000-000000000003";

describe("deferred cash receipt allocation balance", () => {
  it("accepts complete atomic writes and rejects direct mismatches", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
        CREATE SCHEMA auth;
        CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
        CREATE FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
          RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
        CREATE FUNCTION public.save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz DEFAULT NULL)
          RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
        CREATE TABLE public.cash_receipts (
          id uuid PRIMARY KEY, amount_received numeric(14,2) NOT NULL,
          unmatched_amount numeric(14,2) NOT NULL, status text NOT NULL
        );
        CREATE TABLE public.receipt_allocations (
          id uuid PRIMARY KEY, cash_receipt_id uuid NOT NULL REFERENCES public.cash_receipts(id),
          allocated_amount numeric(14,2) NOT NULL
        );
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_receipts, public.receipt_allocations TO authenticated;
      `);
      await db.exec(await readFile(migration, "utf8"));
      const privileges = (await db.query(`SELECT
        has_table_privilege('authenticated', 'public.cash_receipts', 'UPDATE') AS receipt_update,
        has_table_privilege('authenticated', 'public.cash_receipts', 'DELETE') AS receipt_delete,
        has_table_privilege('authenticated', 'public.receipt_allocations', 'INSERT') AS allocation_insert,
        has_table_privilege('authenticated', 'public.receipt_allocations', 'UPDATE') AS allocation_update,
        has_table_privilege('authenticated', 'public.receipt_allocations', 'DELETE') AS allocation_delete
      `)).rows[0];
      expect(privileges).toEqual({
        receipt_update: false, receipt_delete: false,
        allocation_insert: false, allocation_update: false, allocation_delete: false,
      });

      await db.exec(`INSERT INTO public.cash_receipts VALUES ('${receipt}', 100, 100, 'unmatched')`);
      await expect(db.exec(`INSERT INTO public.receipt_allocations VALUES ('${allocation}', '${receipt}', 20)`))
        .rejects.toThrow("allocation balance");
      expect((await db.query("SELECT count(*)::int AS n FROM public.receipt_allocations")).rows[0])
        .toEqual({ n: 0 });

      await db.exec(`
        BEGIN;
        UPDATE public.cash_receipts SET unmatched_amount = 80, status = 'partially-matched'
          WHERE id = '${receipt}';
        INSERT INTO public.receipt_allocations VALUES ('${allocation}', '${receipt}', 20);
        COMMIT;
      `);
      await expect(db.exec(`UPDATE public.cash_receipts SET unmatched_amount = 70 WHERE id = '${receipt}'`))
        .rejects.toThrow("allocation balance");
      await expect(db.exec(`DELETE FROM public.receipt_allocations WHERE id = '${allocation}'`))
        .rejects.toThrow("allocation balance");
      expect((await db.query("SELECT unmatched_amount::text AS unmatched FROM public.cash_receipts WHERE id = $1", [receipt]))
        .rows[0]).toEqual({ unmatched: "80.00" });

      await db.exec(`INSERT INTO public.cash_receipts VALUES ('${refunded}', 100, 100, 'refunded')`);
      await expect(db.exec(`INSERT INTO public.receipt_allocations VALUES
        ('78000000-0000-4000-8000-000000000004', '${refunded}', 20)`))
        .rejects.toThrow("cannot receive a new allocation");
    } finally {
      await db.close();
    }
  });
});
