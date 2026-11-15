// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261113230000_guard_lease_billing_inputs.sql", import.meta.url);

describe("lease billing input constraints", () => {
  it("accepts valid terms and rejects invalid due days, formulas, amounts, and end dates", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.leases (
          id text PRIMARY KEY, due_day_of_month integer NOT NULL,
          rent_formula integer NOT NULL, monthly_rent numeric NOT NULL,
          monthly_charges numeric NOT NULL, start_date date NOT NULL, end_date date
        );
        INSERT INTO public.leases VALUES ('lease-1', 5, 1, 1000, 100, '2026-01-01', NULL);
      `);
      await db.exec(await readFile(migration, "utf8"));
      await db.query("UPDATE public.leases SET due_day_of_month = 31, rent_formula = 12, monthly_rent = 0, monthly_charges = 0 WHERE id = 'lease-1'");
      const invalid = [
        "due_day_of_month = 0", "due_day_of_month = 32", "rent_formula = 0",
        "monthly_rent = -1", "monthly_charges = -1",
        "monthly_rent = 'NaN'::numeric", "monthly_charges = 'Infinity'::numeric",
        "end_date = '2025-12-31'",
      ];
      for (const assignment of invalid) {
        await expect(db.query(`UPDATE public.leases SET ${assignment} WHERE id = 'lease-1'`)).rejects.toThrow();
      }
    } finally {
      await db.close();
    }
  });
});
