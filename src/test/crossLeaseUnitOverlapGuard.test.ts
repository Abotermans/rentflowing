// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("cross-lease unit overlap guard", () => {
  it("respects lease end, move-out and touching boundaries on later writes", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.units (id uuid PRIMARY KEY);
        CREATE TABLE public.leases (
          id uuid PRIMARY KEY, lifecycle_stage text NOT NULL, start_date date NOT NULL,
          end_date date, move_out_actual_date date
        );
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, lease_id uuid NOT NULL, unit_id uuid NOT NULL,
          start_date date NOT NULL, end_date date
        );
        INSERT INTO public.units VALUES
          ('00000000-0000-4000-8000-000000000001'),
          ('00000000-0000-4000-8000-000000000002');
        INSERT INTO public.leases VALUES
          ('00000000-0000-4000-8000-000000000010', 'active', '2026-01-01', '2026-06-30', NULL),
          ('00000000-0000-4000-8000-000000000011', 'active', '2026-06-30', '2026-12-31', NULL),
          ('00000000-0000-4000-8000-000000000012', 'ended', '2026-01-01', '2026-12-31', NULL),
          ('00000000-0000-4000-8000-000000000013', 'active', '2026-01-01', '2026-12-31', '2026-05-15'),
          ('00000000-0000-4000-8000-000000000014', 'active', '2026-05-15', '2026-12-31', NULL);
        INSERT INTO public.lease_unit_assignments VALUES
          ('00000000-0000-4000-8000-000000000020',
           '00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001', '2026-01-01', NULL),
          ('00000000-0000-4000-8000-000000000022',
           '00000000-0000-4000-8000-000000000012',
           '00000000-0000-4000-8000-000000000001', '2026-01-01', NULL),
          ('00000000-0000-4000-8000-000000000023',
           '00000000-0000-4000-8000-000000000013',
           '00000000-0000-4000-8000-000000000002', '2026-01-01', NULL);
      `);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261114233000_guard_cross_lease_unit_overlap.sql", import.meta.url,
      ), "utf8");
      await db.exec(migration);

      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000021',
         '00000000-0000-4000-8000-000000000011',
         '00000000-0000-4000-8000-000000000001', '2026-06-30', NULL)`);
      await expect(db.exec(`UPDATE public.leases SET end_date = '2026-07-01'
        WHERE id = '00000000-0000-4000-8000-000000000010'`))
        .rejects.toThrow("Unit assignments overlap across leases");
      await expect(db.exec(`UPDATE public.leases SET lifecycle_stage = 'active'
        WHERE id = '00000000-0000-4000-8000-000000000012'`))
        .rejects.toThrow("Unit assignments overlap across leases");

      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000024',
         '00000000-0000-4000-8000-000000000014',
         '00000000-0000-4000-8000-000000000002', '2026-05-15', NULL)`);
      await expect(db.exec(`UPDATE public.leases SET move_out_actual_date = NULL
        WHERE id = '00000000-0000-4000-8000-000000000013'`))
        .rejects.toThrow("Unit assignments overlap across leases");
      await expect(db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000025',
         '00000000-0000-4000-8000-000000000011',
         '00000000-0000-4000-8000-000000000002', '2026-06-30', NULL)`))
        .rejects.toThrow("Unit assignments overlap across leases");
    } finally {
      await db.close();
    }
  });
});
