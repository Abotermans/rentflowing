// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261018234000_guard_receipt_amounts.sql", import.meta.url);

describe("receipt amount database guards", () => {
  it("preserves legacy anomalies for review but rejects new invalid writes", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.cash_receipts (
          id integer PRIMARY KEY, amount_received numeric(14,2) NOT NULL,
          unmatched_amount numeric(14,2) NOT NULL, status text NOT NULL
        );
        CREATE TABLE public.receipt_allocations (
          id integer PRIMARY KEY, allocated_amount numeric(14,2) NOT NULL
        );
        INSERT INTO public.cash_receipts VALUES (1, -20, -20, 'unmatched');
        INSERT INTO public.receipt_allocations VALUES (1, 0);
      `);
      await db.exec(await readFile(migration, "utf8"));
      expect((await db.query("SELECT amount_received::text AS amount FROM public.cash_receipts WHERE id = 1"))
        .rows[0]).toEqual({ amount: "-20.00" });
      await expect(db.exec("ALTER TABLE public.cash_receipts VALIDATE CONSTRAINT cash_receipts_nonterminal_amount_positive"))
        .rejects.toThrow();
      await expect(db.exec("INSERT INTO public.cash_receipts VALUES (2, -10, -10, 'unmatched')"))
        .rejects.toThrow("cash_receipts_nonterminal_amount_positive");
      await expect(db.exec("INSERT INTO public.cash_receipts VALUES (2, 100, 120, 'unmatched')"))
        .rejects.toThrow("cash_receipts_positive_balance_range");
      await expect(db.exec("INSERT INTO public.receipt_allocations VALUES (2, 0)"))
        .rejects.toThrow("receipt_allocations_amount_positive");
      await db.exec("INSERT INTO public.cash_receipts VALUES (2, 100, 100, 'unmatched')");
      await db.exec("INSERT INTO public.cash_receipts VALUES (3, -10, -10, 'refunded')");
      await db.exec("INSERT INTO public.receipt_allocations VALUES (2, 10)");
    } finally {
      await db.close();
    }
  });
});
