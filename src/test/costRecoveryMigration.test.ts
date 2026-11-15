// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("configurable cost recovery migration", () => {
  it("preserves legacy partial costs and rejects missing or invalid new shares", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE public.cost_entries (
        id integer PRIMARY KEY,
        recovery_type text NOT NULL
      );
      INSERT INTO public.cost_entries (id, recovery_type)
      VALUES (1, 'partially-recoverable'), (2, 'owner-only');`);
      const migration = await readFile(new URL("../../supabase/migrations/20261017190000_configurable_cost_recovery.sql", import.meta.url), "utf8");
      await db.exec(migration);
      await db.exec(migration);

      const rows = await db.query<{ id: number; recoverable_percentage: string | null }>(
        "SELECT id, recoverable_percentage FROM public.cost_entries ORDER BY id",
      );
      expect(rows.rows).toEqual([
        { id: 1, recoverable_percentage: "50.00" },
        { id: 2, recoverable_percentage: null },
      ]);
      await db.query("INSERT INTO public.cost_entries (id, recovery_type, recoverable_percentage) VALUES (3, 'partially-recoverable', 30)");
      await expect(db.query("INSERT INTO public.cost_entries (id, recovery_type) VALUES (4, 'partially-recoverable')"))
        .rejects.toThrow("cost_entries_recoverable_percentage_check");
      await expect(db.query("INSERT INTO public.cost_entries (id, recovery_type, recoverable_percentage) VALUES (5, 'partially-recoverable', 100)"))
        .rejects.toThrow("cost_entries_recoverable_percentage_check");
      await expect(db.query("UPDATE public.cost_entries SET recovery_type = 'owner-only' WHERE id = 3"))
        .rejects.toThrow("cost_entries_recoverable_percentage_check");
    } finally {
      await db.close();
    }
  });
});
