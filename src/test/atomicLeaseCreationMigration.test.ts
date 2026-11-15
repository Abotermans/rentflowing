// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-4000-8000-000000000001";
const property = "00000000-0000-4000-8000-000000000002";
const otherProperty = "00000000-0000-4000-8000-000000000006";
const unit = "00000000-0000-4000-8000-000000000003";
const otherUnit = "00000000-0000-4000-8000-000000000004";
const foreignUnit = "00000000-0000-4000-8000-000000000007";
const parkingUnit = "00000000-0000-4000-8000-000000000008";
const tenant = "00000000-0000-4000-8000-000000000005";
const leaseId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lease = (id: string, start: string, end: string) => ({
  id, portfolio_id: portfolio, property_id: property, tenant_ids: [tenant],
  billing_tenant_id: tenant, lease_reference: `LEASE-${id.slice(-2)}`,
  lifecycle_stage: "active", start_date: start, end_date: end,
  monthly_rent: 100, monthly_charges: 0,
});
const assignment = (id: string, parent: string, unitId: string, start: string, end: string) => ({
  id, lease_id: parent, unit_id: unitId, start_date: start, end_date: end,
  rent_share: 100, charges_share: 0,
});
const receivable = (id: string, parent: string, unitId: string, amount: number) => ({
  id, lease_id: parent, property_id: property, tenant_id: tenant, unit_id: unitId, expected_amount: amount,
});

describe("atomic lease creation migration", () => {
  it("commits the full lease graph, rejects overlap, and rolls back stale and rejected children", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE TABLE public.units (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
          unit_code text NOT NULL, unit_type text NOT NULL
        );
        CREATE TABLE public.tenants (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, status text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.leases (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
          lease_reference text NOT NULL,
          tenant_ids jsonb NOT NULL, billing_tenant_id uuid, lifecycle_stage text NOT NULL,
          start_date date NOT NULL, end_date date, move_out_actual_date date,
          monthly_rent numeric(12,2) NOT NULL, monthly_charges numeric(12,2) NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          lease_id uuid NOT NULL REFERENCES public.leases(id), unit_id uuid NOT NULL REFERENCES public.units(id),
          start_date date NOT NULL, end_date date,
          rent_share numeric(12,2), charges_share numeric(12,2),
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.receivable_items (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          lease_id uuid NOT NULL REFERENCES public.leases(id), unit_id uuid NOT NULL REFERENCES public.units(id),
          property_id uuid NOT NULL, tenant_id uuid NOT NULL,
          expected_amount numeric(14,2) NOT NULL CHECK (expected_amount >= 0),
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE FUNCTION public.touch_test_tenant() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
        CREATE TRIGGER tenant_touch BEFORE UPDATE ON public.tenants
          FOR EACH ROW EXECUTE FUNCTION public.touch_test_tenant();
        INSERT INTO public.units VALUES
          ('${unit}', '${portfolio}', '${property}', 'UNIT-A', 'apartment'),
          ('${otherUnit}', '${portfolio}', '${property}', 'UNIT-B', 'apartment'),
          ('${foreignUnit}', '${portfolio}', '${otherProperty}', 'UNIT-C', 'apartment'),
          ('${parkingUnit}', '${portfolio}', '${property}', 'PARKING', 'parking');
        INSERT INTO public.tenants (id, portfolio_id, status) VALUES ('${tenant}', '${portfolio}', 'applicant');
      `);
      const migration = await readFile(
        new URL("../../supabase/migrations/20261017220000_atomic_lease_creation.sql", import.meta.url), "utf8",
      );
      await db.exec(migration);
      const call = async (parent: object, assignments: object[], items: object[], tenants: object[]) =>
        db.query<{ result: {
          lease: { id: string };
          assignments: object[];
          receivables: object[];
          tenants: Array<{ status: string; updated_at: string }>;
        } }>(
          "SELECT public.create_lease_with_schedule($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) AS result",
          [JSON.stringify(parent), JSON.stringify(assignments), JSON.stringify(items), JSON.stringify(tenants)],
        );

      const first = leaseId(10);
      const originalTenant = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.tenants WHERE id = $1", [tenant],
      )).rows[0];
      const created = (await call(
        lease(first, "2026-01-01", "2026-06-30"),
        [assignment(leaseId(11), first, unit, "2026-01-01", "2026-06-30")],
        [receivable(leaseId(12), first, unit, 100)],
        [{ id: tenant, status: "active", expected_updated_at: originalTenant.updated_at }],
      )).rows[0].result;
      expect(created.lease.id).toBe(first);
      expect(created.assignments).toHaveLength(1);
      expect(created.receivables).toHaveLength(1);
      expect(created.tenants[0].status).toBe("active");

      const ancillaryOnly = leaseId(110);
      await expect(call(
        lease(ancillaryOnly, "2027-01-01", "2027-12-31"),
        [assignment(leaseId(111), ancillaryOnly, parkingUnit, "2027-01-01", "2027-12-31")],
        [], [],
      )).rejects.toThrow("needs a main residential or commercial unit");

      const mismatched = leaseId(100);
      await expect(call(
        { ...lease(mismatched, "2027-01-01", "2027-12-31"), monthly_charges: 250 },
        [{ ...assignment(leaseId(101), mismatched, otherUnit, "2027-01-01", "2027-12-31"), charges_share: 190 }],
        [], [],
      )).rejects.toThrow("shares must total the lease monthly rent and charges");
      await expect(call(
        { ...lease(mismatched, "2027-01-01", "2027-12-31"), monthly_rent: 110 },
        [assignment(leaseId(101), mismatched, otherUnit, "2027-01-01", "2027-12-31")],
        [], [],
      )).rejects.toThrow("shares must total the lease monthly rent and charges");
      await expect(call(
        lease(mismatched, "2027-01-01", "2027-12-31"),
        [{ ...assignment(leaseId(101), mismatched, otherUnit, "2027-01-01", "2027-12-31"), charges_share: null }],
        [], [],
      )).rejects.toThrow("non-negative rent and charges shares");

      const datedPricing = leaseId(120);
      await expect(call(
        { ...lease(datedPricing, "2027-01-01", "2027-12-31"), lifecycle_stage: "ended", monthly_rent: 150 },
        [assignment(leaseId(121), datedPricing, otherUnit, "2027-01-01", "2027-12-31"),
          { ...assignment(leaseId(122), datedPricing, parkingUnit, "2027-02-01", "2027-12-31"), rent_share: 50 }],
        [], [],
      )).rejects.toThrow("Use an amendment for dated price changes");
      await expect(call(
        { ...lease(datedPricing, "2027-01-01", "2027-12-31"), monthly_rent: 150 },
        [assignment(leaseId(121), datedPricing, otherUnit, "2027-01-01", "2027-06-30"),
          { ...assignment(leaseId(122), datedPricing, parkingUnit, "2027-01-01", "2027-12-31"), rent_share: 50 }],
        [], [],
      )).rejects.toThrow("Use an amendment for dated price changes");
      expect((await db.query("SELECT count(*)::int AS n FROM public.leases")).rows[0]).toEqual({ n: 1 });

      const wrongProperty = leaseId(70);
      await expect(call(
        lease(wrongProperty, "2027-01-01", "2027-12-31"),
        [assignment(leaseId(71), wrongProperty, foreignUnit, "2027-01-01", "2027-12-31")], [], [],
      )).rejects.toThrow("belongs to another property");

      const duplicateUnit = leaseId(80);
      await expect(call(
        lease(duplicateUnit, "2027-01-01", "2027-12-31"),
        [
          assignment(leaseId(81), duplicateUnit, otherUnit, "2027-01-01", "2027-06-30"),
          assignment(leaseId(82), duplicateUnit, otherUnit, "2027-06-30", "2027-12-31"),
        ], [], [],
      )).rejects.toThrow("may appear only once");

      const wrongReceivable = leaseId(90);
      await expect(call(
        lease(wrongReceivable, "2027-01-01", "2027-12-31"),
        [assignment(leaseId(91), wrongReceivable, otherUnit, "2027-01-01", "2027-12-31")],
        [{ ...receivable(leaseId(92), wrongReceivable, otherUnit, 100), property_id: otherProperty }], [],
      )).rejects.toThrow("invalid lease, property, or unit");
      expect((await db.query("SELECT count(*)::int AS n FROM public.leases")).rows[0]).toEqual({ n: 1 });

      const overlapping = leaseId(20);
      await expect(call(
        lease(overlapping, "2026-05-01", "2026-12-31"),
        [assignment(leaseId(21), overlapping, unit, "2026-05-01", "2026-12-31")], [], [],
      )).rejects.toThrow("Unit UNIT-A conflicts with lease LEASE-10 (2026-01-01 to 2026-06-30) for proposed period 2026-05-01 to 2026-12-31");

      const failed = leaseId(30);
      await expect(call(
        lease(failed, "2026-07-01", "2026-12-31"),
        [assignment(leaseId(31), failed, unit, "2026-07-01", "2026-12-31")],
        [receivable(leaseId(32), failed, unit, -10)], [],
      )).rejects.toThrow("receivable_items_expected_amount_check");
      expect((await db.query("SELECT count(*)::int AS n FROM public.leases")).rows[0]).toEqual({ n: 1 });

      const stale = leaseId(40);
      await expect(call(
        lease(stale, "2026-07-01", "2026-12-31"),
        [assignment(leaseId(41), stale, unit, "2026-07-01", "2026-12-31")], [],
        [{ id: tenant, status: "former", expected_updated_at: originalTenant.updated_at }],
      )).rejects.toThrow("Tenant changed since the lease was opened");
      expect((await db.query("SELECT count(*)::int AS n FROM public.leases")).rows[0]).toEqual({ n: 1 });
      expect((await db.query("SELECT status FROM public.tenants WHERE id = $1", [tenant])).rows[0]).toEqual({ status: "active" });

      const boundary = leaseId(50);
      const touched = (await call(
        lease(boundary, "2026-06-30", "2026-12-31"),
        [assignment(leaseId(51), boundary, unit, "2026-06-30", "2026-12-31")], [], [],
      )).rows[0].result;
      expect(touched.lease.id).toBe(boundary);

      await db.exec(`
        GRANT SELECT, UPDATE ON public.units TO authenticated;
        GRANT SELECT, INSERT ON public.leases, public.lease_unit_assignments, public.receivable_items TO authenticated;
        GRANT SELECT, UPDATE ON public.tenants TO authenticated;
        ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.lease_unit_assignments ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.receivable_items ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
        CREATE POLICY unit_read ON public.units FOR SELECT TO authenticated USING (true);
        CREATE POLICY unit_update ON public.units FOR UPDATE TO authenticated USING (true);
        CREATE POLICY lease_read ON public.leases FOR SELECT TO authenticated USING (true);
        CREATE POLICY assignment_read ON public.lease_unit_assignments FOR SELECT TO authenticated USING (true);
        CREATE POLICY receivable_read ON public.receivable_items FOR SELECT TO authenticated USING (true);
        CREATE POLICY tenant_read ON public.tenants FOR SELECT TO authenticated USING (true);
        CREATE POLICY lease_insert ON public.leases FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY assignment_insert ON public.lease_unit_assignments FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY receivable_insert ON public.receivable_items FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY tenant_update ON public.tenants FOR UPDATE TO authenticated
          USING (current_setting('test.can_write', true) = 'yes');
        SET ROLE authenticated;
      `);
      const guarded = leaseId(60);
      await db.query("SELECT set_config('test.can_write', 'no', false)");
      await expect(call(
        lease(guarded, "2027-01-01", "2027-12-31"),
        [assignment(leaseId(61), guarded, otherUnit, "2027-01-01", "2027-12-31")], [], [],
      )).rejects.toThrow();
      await db.query("SELECT set_config('test.can_write', 'yes', false)");
      const writerSave = (await call(
        lease(guarded, "2027-01-01", "2027-12-31"),
        [assignment(leaseId(61), guarded, otherUnit, "2027-01-01", "2027-12-31")], [], [],
      )).rows[0].result;
      expect(writerSave.lease.id).toBe(guarded);
      await db.exec("RESET ROLE");

      const openAssignmentLease = leaseId(200);
      await call(
        lease(openAssignmentLease, "2025-01-01", "2026-03-31"),
        [{ ...assignment(leaseId(201), openAssignmentLease, otherUnit, "2025-01-01", "2026-03-31"),
          end_date: null }], [], [],
      );
      const afterContractEnd = leaseId(210);
      const afterSave = (await call(
        lease(afterContractEnd, "2026-04-01", "2026-12-31"),
        [assignment(leaseId(211), afterContractEnd, otherUnit, "2026-04-01", "2026-12-31")], [], [],
      )).rows[0].result;
      expect(afterSave.lease.id).toBe(afterContractEnd);
    } finally {
      await db.close();
    }
  });
});
