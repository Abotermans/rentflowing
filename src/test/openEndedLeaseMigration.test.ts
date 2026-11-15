// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("open-ended lease migration", () => {
  it("allows no end date but rejects an end before the start", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE TABLE public.leases (id integer PRIMARY KEY, start_date date NOT NULL, end_date date NOT NULL)");
      const sql = await readFile(new URL("../../supabase/migrations/20261017180000_allow_open_ended_leases.sql", import.meta.url), "utf8");
      await db.exec(sql);

      await db.exec("INSERT INTO public.leases (id, start_date, end_date) VALUES (1, '2026-01-01', NULL)");
      await db.exec("INSERT INTO public.leases (id, start_date, end_date) VALUES (2, '2026-01-01', '2026-01-01')");
      await expect(db.exec("INSERT INTO public.leases (id, start_date, end_date) VALUES (3, '2026-01-02', '2026-01-01')"))
        .rejects.toThrow("leases_end_date_after_start_check");
    } finally {
      await db.close();
    }
  });
});
