// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("lease assignment totals guard", () => {
  it("keeps current lease totals aligned with unit shares across edits", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, time_zone text NOT NULL
        );
        CREATE TABLE public.leases (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
          lease_reference text NOT NULL, lifecycle_stage text NOT NULL,
          start_date date NOT NULL, end_date date,
          move_out_actual_date date, monthly_rent numeric NOT NULL,
          monthly_charges numeric NOT NULL
        );
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, lease_id uuid NOT NULL, portfolio_id uuid NOT NULL,
          start_date date NOT NULL, end_date date, rent_share numeric,
          charges_share numeric
        );
        INSERT INTO public.properties VALUES
          ('00000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000010', 'UTC');
        INSERT INTO public.leases VALUES
          ('00000000-0000-4000-8000-000000000002',
           '00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001', 'TEST-1',
           'draft', '2099-01-01', '2099-12-31', NULL, 100, 20);
      `);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261114231000_guard_lease_assignment_totals.sql", import.meta.url,
      ), "utf8");
      await db.exec(migration);
      await db.exec("BEGIN");
      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000003',
         '00000000-0000-4000-8000-000000000002',
         '00000000-0000-4000-8000-000000000010', '2099-01-01', NULL, 80, 15),
        ('00000000-0000-4000-8000-000000000004',
         '00000000-0000-4000-8000-000000000002',
         '00000000-0000-4000-8000-000000000010', '2099-01-01', NULL, 20, 5)`);
      await db.exec("COMMIT");

      await expect(db.exec("UPDATE public.leases SET monthly_charges = 25"))
        .rejects.toThrow("monthly totals do not match unit shares");
      await expect(db.exec(`UPDATE public.lease_unit_assignments SET rent_share = 90
        WHERE id = '00000000-0000-4000-8000-000000000003'`))
        .rejects.toThrow("monthly totals do not match unit shares");
      await expect(db.exec(`UPDATE public.lease_unit_assignments SET charges_share = NULL
        WHERE id = '00000000-0000-4000-8000-000000000003'`))
        .rejects.toThrow("monthly totals do not match unit shares");
      await expect(db.exec(`DELETE FROM public.lease_unit_assignments
        WHERE id = '00000000-0000-4000-8000-000000000003'`))
        .rejects.toThrow("monthly totals do not match unit shares");

      await db.exec("BEGIN");
      await db.exec("UPDATE public.leases SET monthly_charges = 25");
      await db.exec(`UPDATE public.lease_unit_assignments SET charges_share = 10
        WHERE id = '00000000-0000-4000-8000-000000000004'`);
      await db.exec("COMMIT");
      expect((await db.query<{ monthly_charges: number }>(
        "SELECT monthly_charges::float AS monthly_charges FROM public.leases",
      )).rows[0].monthly_charges).toBe(25);

      await expect(db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000006',
         '00000000-0000-4000-8000-000000000002',
         '00000000-0000-4000-8000-000000000010', '2099-06-01', '2099-12-31', 50, 0)`))
        .rejects.toThrow("monthly totals do not match unit shares");
      await expect(db.exec(`UPDATE public.lease_unit_assignments SET end_date = '2099-06-30'
        WHERE id = '00000000-0000-4000-8000-000000000003'`))
        .rejects.toThrow("monthly totals do not match unit shares");
      await db.exec(`INSERT INTO public.lease_unit_assignments VALUES
        ('00000000-0000-4000-8000-000000000005',
         '00000000-0000-4000-8000-000000000002',
         '00000000-0000-4000-8000-000000000010', '2100-01-01', NULL, 50, 0)`);
    } finally {
      await db.close();
    }
  });

  it("checks the current term after historical assignment changes", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, time_zone text NOT NULL);
        CREATE TABLE public.leases (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
          lease_reference text NOT NULL, lifecycle_stage text NOT NULL,
          start_date date NOT NULL, end_date date,
          move_out_actual_date date, monthly_rent numeric NOT NULL,
          monthly_charges numeric NOT NULL
        );
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, lease_id uuid NOT NULL, portfolio_id uuid NOT NULL,
          start_date date NOT NULL, end_date date, rent_share numeric,
          charges_share numeric
        );
        INSERT INTO public.properties VALUES
          ('00000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000010', 'UTC');
        INSERT INTO public.leases VALUES
          ('00000000-0000-4000-8000-000000000002',
           '00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001', 'TEST-2',
           'active', '2020-01-01', NULL, NULL, 130, 25);
        INSERT INTO public.lease_unit_assignments VALUES
          ('00000000-0000-4000-8000-000000000003',
           '00000000-0000-4000-8000-000000000002',
           '00000000-0000-4000-8000-000000000010', '2020-01-01', '2025-12-31', 100, 20),
          ('00000000-0000-4000-8000-000000000004',
           '00000000-0000-4000-8000-000000000002',
           '00000000-0000-4000-8000-000000000010', '2026-01-01', NULL, 130, 25);
      `);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261114231000_guard_lease_assignment_totals.sql", import.meta.url,
      ), "utf8");
      await db.exec(migration);
      await db.exec(`UPDATE public.lease_unit_assignments SET rent_share = 90
        WHERE id = '00000000-0000-4000-8000-000000000003'`);
      await expect(db.exec(`UPDATE public.lease_unit_assignments SET rent_share = 120
        WHERE id = '00000000-0000-4000-8000-000000000004'`))
        .rejects.toThrow("monthly totals do not match unit shares");
      await db.exec("UPDATE public.leases SET lifecycle_stage = 'ended', end_date = '2025-12-31'");
      await db.exec("DELETE FROM public.lease_unit_assignments");
    } finally {
      await db.close();
    }
  });

  it("rejects a legacy draft with mismatched shares when signing it", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, time_zone text NOT NULL
        );
        CREATE TABLE public.leases (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
          lease_reference text NOT NULL, lifecycle_stage text NOT NULL,
          start_date date NOT NULL, end_date date, move_out_actual_date date,
          monthly_rent numeric NOT NULL, monthly_charges numeric NOT NULL
        );
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, lease_id uuid NOT NULL, portfolio_id uuid NOT NULL,
          start_date date NOT NULL, end_date date, rent_share numeric,
          charges_share numeric
        );
        INSERT INTO public.properties VALUES
          ('00000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000010', 'UTC');
        INSERT INTO public.leases VALUES
          ('00000000-0000-4000-8000-000000000002',
           '00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001', 'LEGACY-DRAFT',
           'draft', '2099-01-01', NULL, NULL, 100, 20);
        INSERT INTO public.lease_unit_assignments VALUES
          ('00000000-0000-4000-8000-000000000003',
           '00000000-0000-4000-8000-000000000002',
           '00000000-0000-4000-8000-000000000010', '2099-01-01', NULL, 100, 10);
      `);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261114231000_guard_lease_assignment_totals.sql", import.meta.url,
      ), "utf8");
      await db.exec(migration);

      await expect(db.exec("UPDATE public.leases SET lifecycle_stage = 'signed'"))
        .rejects.toThrow("monthly totals do not match unit shares");
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases",
      )).rows[0].lifecycle_stage).toBe("draft");
    } finally {
      await db.close();
    }
  });
});
