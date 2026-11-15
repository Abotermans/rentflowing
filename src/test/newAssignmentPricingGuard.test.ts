// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("new assignment pricing guard", () => {
  it("requires finite shares on new rows while allowing incremental legacy repair", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE TABLE public.lease_unit_assignments (
          id integer PRIMARY KEY, start_date date NOT NULL,
          rent_share numeric(12,2), charges_share numeric(12,2)
        );
        INSERT INTO public.lease_unit_assignments VALUES (1, '2026-01-01', NULL, NULL);
      `);
      await db.exec(await readFile(new URL(
        "../../supabase/migrations/20261113232000_guard_new_assignment_pricing.sql",
        import.meta.url,
      ), "utf8"));
      await expect(db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        (2, '2026-01-01', NULL, 0)`)).rejects.toThrow("rent share");
      await expect(db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        (2, '2026-01-01', 0, NULL)`)).rejects.toThrow("charges share");
      await expect(db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        (2, '2026-01-01', -1, 0)`)).rejects.toThrow("rent share");
      await expect(db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        (2, '2026-01-01', 'NaN', 0)`)).rejects.toThrow("rent share");
      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        (2, '2026-01-01', 0, 0)`);
      await db.exec("UPDATE public.lease_unit_assignments SET start_date = '2026-02-01' WHERE id = 1");
      await db.exec("UPDATE public.lease_unit_assignments SET rent_share = 100 WHERE id = 1");
      await db.exec("UPDATE public.lease_unit_assignments SET charges_share = 0 WHERE id = 1");
      const result = await db.query<{ rent_share: string; charges_share: string }>(
        "SELECT rent_share, charges_share FROM public.lease_unit_assignments WHERE id = 1",
      );
      expect(result.rows[0]).toMatchObject({ rent_share: "100.00", charges_share: "0.00" });
    } finally {
      await db.close();
    }
  });
});
