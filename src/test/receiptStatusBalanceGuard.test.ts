// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261107170000_guard_receipt_status_balance.sql", import.meta.url);

describe("cash receipt status balance guard", () => {
  it("rejects contradictory matching labels while allowing valid and legacy rows", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.cash_receipts (
          id integer PRIMARY KEY,
          amount_received numeric(14,2) NOT NULL,
          unmatched_amount numeric(14,2) NOT NULL,
          status text NOT NULL
        );
        INSERT INTO public.cash_receipts VALUES (1, 120, 0, 'unmatched');
      `);
      await db.exec(await readFile(migration, "utf8"));

      const legacy = await db.query("SELECT status FROM public.cash_receipts WHERE id = 1");
      expect(legacy.rows[0]).toEqual({ status: "unmatched" });
      await expect(db.exec("UPDATE public.cash_receipts SET status = 'unmatched' WHERE id = 1"))
        .rejects.toThrow("cash_receipts_status_balance_consistent");

      await db.exec(`
        INSERT INTO public.cash_receipts VALUES
          (2, 120, 120, 'unmatched'),
          (3, 120, 20, 'partially-matched'),
          (4, 120, 0, 'matched'),
          (5, 120, 120, 'imported'),
          (6, 120, 120, 'reversed');
      `);
      await expect(db.exec("INSERT INTO public.cash_receipts VALUES (7, 120, 0, 'unmatched')"))
        .rejects.toThrow("cash_receipts_status_balance_consistent");
      await expect(db.exec("INSERT INTO public.cash_receipts VALUES (8, 120, 120, 'matched')"))
        .rejects.toThrow("cash_receipts_status_balance_consistent");
      await expect(db.exec("INSERT INTO public.cash_receipts VALUES (9, 120, 0, 'partially-matched')"))
        .rejects.toThrow("cash_receipts_status_balance_consistent");
      await expect(db.exec("INSERT INTO public.cash_receipts VALUES (10, 120, 120, 'partially-matched')"))
        .rejects.toThrow("cash_receipts_status_balance_consistent");
      await db.exec("UPDATE public.cash_receipts SET unmatched_amount = 120 WHERE id = 1");
      expect((await db.query("SELECT status, unmatched_amount::text AS balance FROM public.cash_receipts WHERE id = 1")).rows[0])
        .toEqual({ status: "unmatched", balance: "120.00" });
    } finally {
      await db.close();
    }
  });
});
