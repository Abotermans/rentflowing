// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "10000000-0000-0000-0000-000000000001";

describe("receipt cent-precision RPC guard", () => {
  it("rejects sub-cent receipt, allocation and receivable balances before the write", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE SCHEMA auth;
        CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor');
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
          SELECT '20000000-0000-0000-0000-000000000001'::uuid
        $$;
        CREATE FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
          RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        CREATE TABLE public.write_log (id integer GENERATED ALWAYS AS IDENTITY);
        CREATE FUNCTION public.save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz)
          RETURNS jsonb LANGUAGE plpgsql AS $$
        BEGIN
          INSERT INTO public.write_log DEFAULT VALUES;
          RETURN jsonb_build_object('saved', true);
        END $$;
      `);
      const migration = await readFile(new URL("../../supabase/migrations/20261107250000_reject_subcent_receipt_payloads.sql", import.meta.url), "utf8");
      await db.exec(migration);
      const receipt = { portfolio_id: portfolio, amount_received: 0.3, unmatched_amount: 0 };
      const receivables = [{ allocated_amount: 0.3, outstanding_amount: 0 }];
      const allocations = [{ allocated_amount: 0.3 }];
      const save = (r: object, items: object[], rows: object[]) => db.query<{ result: { saved: boolean } }>(
        "SELECT public.client_save_receipt_allocations($1::jsonb, $2::jsonb, $3::jsonb, NULL) AS result",
        [JSON.stringify(r), JSON.stringify(items), JSON.stringify(rows)],
      );

      await expect(save({ ...receipt, amount_received: 0.301 }, receivables, allocations))
        .rejects.toThrow("must use exact cents");
      await expect(save({ ...receipt, unmatched_amount: 0.001 }, receivables, allocations))
        .rejects.toThrow("must use exact cents");
      await expect(save(receipt, [{ ...receivables[0], outstanding_amount: 0.001 }], allocations))
        .rejects.toThrow("must use exact cents");
      await expect(save(receipt, receivables, [{ allocated_amount: 0.001 }]))
        .rejects.toThrow("must use exact cents");
      expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.write_log")).rows[0].count).toBe(0);

      const result = await save(receipt, receivables, allocations);
      expect(result.rows[0].result).toEqual({ saved: true });
      expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.write_log")).rows[0].count).toBe(1);
    } finally {
      await db.close();
    }
  });
});
