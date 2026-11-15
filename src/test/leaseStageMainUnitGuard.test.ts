// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("lease lifecycle main-unit guard", () => {
  it("blocks signature and activation without a main unit, including parking-only leases", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, time_zone text NOT NULL
        );
        CREATE TABLE public.units (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          property_id uuid NOT NULL, unit_type text NOT NULL
        );
        CREATE TABLE public.leases (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          property_id uuid NOT NULL, lifecycle_stage text NOT NULL, start_date date NOT NULL
        );
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, lease_id uuid NOT NULL, portfolio_id uuid NOT NULL,
          unit_id uuid NOT NULL, start_date date NOT NULL, end_date date
        );
        INSERT INTO public.properties VALUES
          ('00000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000010', 'UTC');
        INSERT INTO public.units VALUES
          ('00000000-0000-4000-8000-000000000002',
           '00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001', 'parking'),
          ('00000000-0000-4000-8000-000000000003',
           '00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001', 'apartment');
        INSERT INTO public.leases VALUES
          ('00000000-0000-4000-8000-000000000004',
           '00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001', 'draft', '2099-01-01');
      `);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261114230000_guard_lease_stage_main_unit.sql", import.meta.url,
      ), "utf8");
      await db.exec(migration);
      const stage = (next: string, leaseId = 4) => db.query(
        "UPDATE public.leases SET lifecycle_stage = $1 WHERE id = $2::uuid",
        [next, `00000000-0000-4000-8000-${String(leaseId).padStart(12, "0")}`],
      );
      const addAssignment = (id: number, unitId: number, start: string) => db.query(`
        INSERT INTO public.lease_unit_assignments VALUES
          ($1::uuid, '00000000-0000-4000-8000-000000000004',
           '00000000-0000-4000-8000-000000000010', $2::uuid, $3::date, NULL)
      `, [
        `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
        `00000000-0000-4000-8000-${String(unitId).padStart(12, "0")}`,
        start,
      ]);

      await expect(stage("pending-signature")).rejects.toThrow("needs a main residential or commercial unit");
      await addAssignment(5, 2, "2099-01-01");
      await expect(stage("pending-signature")).rejects.toThrow("needs a main residential or commercial unit");
      await addAssignment(6, 3, "2099-02-01");
      await expect(stage("pending-signature")).rejects.toThrow("needs a main residential or commercial unit");
      await db.exec("UPDATE public.lease_unit_assignments SET start_date = '2099-01-01' WHERE id = '00000000-0000-4000-8000-000000000006'");
      await stage("pending-signature");
      await expect(db.exec("UPDATE public.lease_unit_assignments SET start_date = '2099-02-01' WHERE id = '00000000-0000-4000-8000-000000000006'"))
        .rejects.toThrow("needs a main residential or commercial unit");
      await expect(db.exec("DELETE FROM public.lease_unit_assignments WHERE id = '00000000-0000-4000-8000-000000000006'"))
        .rejects.toThrow("needs a main residential or commercial unit");
      await stage("draft");
      await db.exec("DELETE FROM public.lease_unit_assignments WHERE id = '00000000-0000-4000-8000-000000000006'");
      await expect(stage("signed")).rejects.toThrow("needs a main residential or commercial unit");

      await db.exec("BEGIN");
      await stage("signed");
      await addAssignment(7, 3, "2099-01-01");
      await db.exec("COMMIT");
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = '00000000-0000-4000-8000-000000000004'",
      )).rows[0]?.lifecycle_stage).toBe("signed");

      await expect(db.exec("DELETE FROM public.lease_unit_assignments WHERE id = '00000000-0000-4000-8000-000000000007'"))
        .rejects.toThrow("needs a main residential or commercial unit");
      await db.exec("BEGIN");
      await db.exec("UPDATE public.lease_unit_assignments SET start_date = '2099-02-01' WHERE id = '00000000-0000-4000-8000-000000000007'");
      await addAssignment(9, 3, "2099-01-01");
      await db.exec("COMMIT");
      await expect(db.exec("DELETE FROM public.lease_unit_assignments WHERE id = '00000000-0000-4000-8000-000000000009'"))
        .rejects.toThrow("needs a main residential or commercial unit");
      await db.exec(`INSERT INTO public.leases VALUES
        ('00000000-0000-4000-8000-000000000008',
         '00000000-0000-4000-8000-000000000010',
         '00000000-0000-4000-8000-000000000001', 'draft', '2099-01-01')`);
      await expect(stage("active", 8)).rejects.toThrow("needs a main residential or commercial unit");
      await stage("ended");
      await db.exec("DELETE FROM public.lease_unit_assignments WHERE id = '00000000-0000-4000-8000-000000000007'");
      await db.exec("DELETE FROM public.lease_unit_assignments WHERE id = '00000000-0000-4000-8000-000000000009'");
    } finally {
      await db.close();
    }
  });
});
