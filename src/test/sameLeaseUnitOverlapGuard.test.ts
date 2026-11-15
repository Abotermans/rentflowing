// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("same-lease unit assignment overlap guard", () => {
  it("rejects overlap but permits a touching boundary and atomic handoff", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.units (id uuid PRIMARY KEY);
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, lease_id uuid NOT NULL, unit_id uuid NOT NULL,
          start_date date NOT NULL, end_date date
        );
        INSERT INTO public.units VALUES
          ('00000000-0000-4000-8000-000000000001'),
          ('00000000-0000-4000-8000-000000000002');
        INSERT INTO public.lease_unit_assignments VALUES
          ('00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000020',
           '00000000-0000-4000-8000-000000000001',
           '2026-01-01', '2026-06-30');
      `);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261114232000_guard_same_lease_unit_overlap.sql", import.meta.url,
      ), "utf8");
      await db.exec(migration);

      await expect(db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000011',
         '00000000-0000-4000-8000-000000000020',
         '00000000-0000-4000-8000-000000000001',
         '2026-06-29', NULL)`))
        .rejects.toThrow("overlapping assignments for the same unit");
      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000011',
         '00000000-0000-4000-8000-000000000020',
         '00000000-0000-4000-8000-000000000001',
         '2026-06-30', NULL)`);
      await expect(db.exec(`UPDATE public.lease_unit_assignments
        SET start_date = '2026-06-29'
        WHERE id = '00000000-0000-4000-8000-000000000011'`))
        .rejects.toThrow("overlapping assignments for the same unit");

      await db.exec("BEGIN");
      await db.exec(`UPDATE public.lease_unit_assignments SET end_date = '2026-06-29'
        WHERE id = '00000000-0000-4000-8000-000000000010'`);
      await db.exec(`UPDATE public.lease_unit_assignments SET start_date = '2026-06-29'
        WHERE id = '00000000-0000-4000-8000-000000000011'`);
      await db.exec("COMMIT");
      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000012',
         '00000000-0000-4000-8000-000000000020',
         '00000000-0000-4000-8000-000000000002',
         '2026-01-01', NULL)`);
      await expect(db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000013',
         '00000000-0000-4000-8000-000000000020',
         '00000000-0000-4000-8000-000000000099',
         '2026-01-01', NULL)`))
        .rejects.toThrow("Assignment unit is unavailable for overlap validation");
    } finally {
      await db.close();
    }
  });
});
