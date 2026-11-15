// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261107260000_guard_guarantee_amounts.sql", import.meta.url);

describe("guarantee database guard", () => {
  it("requires historical duplicate review and blocks a second guarantee for one lease", async () => {
    const db = new PGlite();
    try {
      const leaseId = "00000000-0000-0000-0000-000000000001";
      await db.exec(`
        CREATE TABLE public.guarantees (id integer PRIMARY KEY, lease_id uuid NOT NULL);
        INSERT INTO public.guarantees VALUES
          (1, '${leaseId}'), (2, '${leaseId}');
      `);
      const migration = await readFile(new URL("../../supabase/migrations/20261107270000_one_guarantee_per_lease.sql", import.meta.url), "utf8");
      await expect(db.exec(migration)).rejects.toThrow("Duplicate guarantees must be reconciled");
      expect((await db.query("SELECT count(*)::integer AS total FROM public.guarantees")).rows)
        .toEqual([{ total: 2 }]);
      await db.exec("DELETE FROM public.guarantees WHERE id = 2");
      await db.exec(migration);
      await expect(db.exec(`INSERT INTO public.guarantees VALUES (2, '${leaseId}')`))
        .rejects.toThrow("guarantees_one_per_lease_idx");
      await db.exec("INSERT INTO public.guarantees VALUES (3, '00000000-0000-0000-0000-000000000002')");
    } finally {
      await db.close();
    }
  });

  it("preserves legacy rows but refuses new malformed amounts and inconsistent lifecycle state", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.guarantees (
          id integer PRIMARY KEY,
          expected_amount numeric(12,2) NOT NULL DEFAULT 0,
          received_amount numeric(12,2) NOT NULL DEFAULT 0,
          retention_amount numeric(12,2),
          received_date date,
          release_date date,
          status text NOT NULL DEFAULT 'pending'
        );
        INSERT INTO public.guarantees (id, expected_amount, received_amount, status)
        VALUES (1, 100, 0, 'active');
      `);
      await db.exec(await readFile(migration, "utf8"));
      expect((await db.query("SELECT status FROM public.guarantees WHERE id = 1")).rows)
        .toEqual([{ status: "active" }]);
      await expect(db.exec("UPDATE public.guarantees SET expected_amount = 100 WHERE id = 1"))
        .rejects.toThrow("guarantees_status_consistent");

      await db.exec(`
        INSERT INTO public.guarantees (id, expected_amount, received_amount, status)
        VALUES (2, 100.25, 20.30, 'incomplete');
        INSERT INTO public.guarantees (id, expected_amount, received_amount,
          retention_amount, received_date, release_date, status)
        VALUES (3, 100, 100, 25, '2026-01-01', '2026-02-01', 'partially-retained');
      `);
      expect((await db.query("SELECT expected_amount::text AS amount FROM public.guarantees WHERE id = 2")).rows)
        .toEqual([{ amount: "100.25" }]);
      for (const sql of [
        "INSERT INTO public.guarantees (id, expected_amount) VALUES (4, 1.001)",
        "INSERT INTO public.guarantees (id, expected_amount) VALUES (4, -1)",
        "INSERT INTO public.guarantees (id, expected_amount) VALUES (4, 10000000000)",
        "INSERT INTO public.guarantees (id, expected_amount, received_amount, status) VALUES (4, 10, 1.001, 'incomplete')",
        "INSERT INTO public.guarantees (id, expected_amount, received_amount, retention_amount, release_date, status) VALUES (4, 10, 10, 10.001, '2026-02-01', 'partially-retained')",
        "INSERT INTO public.guarantees (id, expected_amount, received_amount, retention_amount, release_date, status) VALUES (4, 10, 10, 11, '2026-02-01', 'partially-retained')",
        "INSERT INTO public.guarantees (id, expected_amount, received_amount, retention_amount, status) VALUES (4, 10, 10, 1, 'active')",
        "INSERT INTO public.guarantees (id, expected_amount, received_amount, received_date, release_date, status) VALUES (4, 10, 10, '2026-02-01', '2026-01-01', 'released')",
      ]) {
        await expect(db.exec(sql)).rejects.toThrow("guarantees_amounts_valid");
      }
      await expect(db.exec("INSERT INTO public.guarantees (id, expected_amount, received_amount, status) VALUES (4, 10, 10, 'pending')"))
        .rejects.toThrow("guarantees_status_consistent");
    } finally {
      await db.close();
    }
  });
});
