// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261018235500_guard_receivable_arithmetic.sql", import.meta.url);

describe("receivable arithmetic guard", () => {
  it("retains historical mismatches for review and rejects new unexplained balances", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.receivable_items (
          id integer PRIMARY KEY, expected_amount numeric(14,2) NOT NULL,
          allocated_amount numeric(14,2) NOT NULL,
          outstanding_amount numeric(14,2) NOT NULL
        );
        INSERT INTO public.receivable_items VALUES (1, 100, 10, 80);
      `);
      await db.exec(await readFile(migration, "utf8"));
      await expect(db.exec("ALTER TABLE public.receivable_items VALIDATE CONSTRAINT receivable_items_amounts_reconcile"))
        .rejects.toThrow();
      await expect(db.exec("INSERT INTO public.receivable_items VALUES (2, 100, 10, 80)"))
        .rejects.toThrow("receivable_items_amounts_reconcile");
      await expect(db.exec("UPDATE public.receivable_items SET outstanding_amount = 79 WHERE id = 1"))
        .rejects.toThrow("receivable_items_amounts_reconcile");
      await db.exec("INSERT INTO public.receivable_items VALUES (2, 100, 10, 90)");
      await db.exec("INSERT INTO public.receivable_items VALUES (3, -25, 0, -25)");
      await db.exec("INSERT INTO public.receivable_items VALUES (4, 100, 100, 0)");
      expect((await db.query("SELECT count(*)::int AS n FROM public.receivable_items")).rows[0]).toEqual({ n: 4 });
    } finally {
      await db.close();
    }
  });
});
