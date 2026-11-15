// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const portfolio = id(1);
const tenant = (n: number) => id(10 + n);
const lease = (n: number) => id(20 + n);

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.leases (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
      tenant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      billing_tenant_id uuid, lifecycle_stage text NOT NULL,
      start_date date NOT NULL, end_date date, end_reason text
    );
    CREATE TABLE public.tenants (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, status text NOT NULL
    );
    CREATE TABLE public.lease_amendments (
      id uuid PRIMARY KEY, lease_id uuid NOT NULL, status text NOT NULL
    );
    CREATE TABLE public.lease_status_changes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lease_id uuid NOT NULL, portfolio_id uuid NOT NULL,
      from_stage text, to_stage text NOT NULL, reason text
    );
  `);
  const migration = await readFile(
    new URL("../../supabase/migrations/20261018040000_advance_due_lease_lifecycle.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  return db;
}

describe("server lease lifecycle advancement", () => {
  it("advances due leases, updates affected tenants and amendments, and is idempotent", async () => {
    const db = await database();
    try {
      await db.exec(`
        INSERT INTO public.tenants VALUES
          ('${tenant(1)}', '${portfolio}', 'applicant'),
          ('${tenant(2)}', '${portfolio}', 'active'),
          ('${tenant(3)}', '${portfolio}', 'applicant'),
          ('${tenant(4)}', '${portfolio}', 'applicant');
        INSERT INTO public.leases VALUES
          ('${lease(1)}', '${portfolio}', '["${tenant(1)}"]', '${tenant(1)}', 'signed', '2026-10-01', '2026-12-31', NULL),
          ('${lease(2)}', '${portfolio}', '["${tenant(2)}"]', '${tenant(2)}', 'signed', '2026-01-01', '2026-04-30', NULL),
          ('${lease(3)}', '${portfolio}', '["${tenant(3)}"]', '${tenant(3)}', 'signed', '2026-11-01', '2027-11-01', NULL),
          ('${lease(4)}', '${portfolio}', '["${tenant(4)}"]', '${tenant(4)}', 'active', '2026-01-01', '2026-06-30', NULL),
          ('${lease(5)}', '${portfolio}', '["${tenant(1)}"]', '${tenant(1)}', 'active', '2026-01-01', '2026-10-17', NULL),
          ('${lease(6)}', '${portfolio}', '["${tenant(3)}"]', '${tenant(3)}', 'draft', '2026-01-01', '2026-02-01', NULL);
        INSERT INTO public.lease_amendments VALUES
          ('${id(50)}', '${lease(2)}', 'active'),
          ('${id(51)}', '${lease(2)}', 'scheduled');
      `);
      const first = await db.query<{ leases_advanced: number; tenants_updated: number }>(
        "SELECT * FROM public.advance_due_lease_lifecycle($1::date)", ["2026-10-17"],
      );
      expect(first.rows[0]).toEqual({ leases_advanced: 3, tenants_updated: 3 });
      const stages = await db.query<{ lifecycle_stage: string; end_reason: string | null }>(
        "SELECT lifecycle_stage, end_reason FROM public.leases ORDER BY id",
      );
      expect(stages.rows).toEqual([
        { lifecycle_stage: "active", end_reason: null },
        { lifecycle_stage: "ended", end_reason: "natural-expiry" },
        { lifecycle_stage: "signed", end_reason: null },
        { lifecycle_stage: "ended", end_reason: "natural-expiry" },
        { lifecycle_stage: "active", end_reason: null },
        { lifecycle_stage: "draft", end_reason: null },
      ]);
      const statuses = await db.query<{ status: string }>("SELECT status FROM public.tenants ORDER BY id");
      expect(statuses.rows.map(row => row.status)).toEqual(["active", "former", "applicant", "former"]);
      const amendmentStatuses = await db.query<{ status: string }>(
        "SELECT status FROM public.lease_amendments ORDER BY id",
      );
      expect(amendmentStatuses.rows.map(row => row.status)).toEqual(["ended", "scheduled"]);
      expect((await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM public.lease_status_changes",
      )).rows[0].count).toBe(3);
      const second = await db.query<{ leases_advanced: number; tenants_updated: number }>(
        "SELECT * FROM public.advance_due_lease_lifecycle($1::date)", ["2026-10-17"],
      );
      expect(second.rows[0]).toEqual({ leases_advanced: 0, tenants_updated: 0 });
      await db.exec("SET ROLE service_role");
      const serverCall = await db.query<{ leases_advanced: number; tenants_updated: number }>(
        "SELECT * FROM public.advance_due_lease_lifecycle($1::date)", ["2026-10-17"],
      );
      expect(serverCall.rows[0]).toEqual({ leases_advanced: 0, tenants_updated: 0 });
      await db.exec("RESET ROLE");
      await expect(db.query("SELECT * FROM public.advance_due_lease_lifecycle(NULL::date)"))
        .rejects.toThrow("Business date is required");
    } finally {
      await db.close();
    }
  });

  it("denies a client role and rolls back when the status history cannot be written", async () => {
    const db = await database();
    try {
      await db.exec(`
        INSERT INTO public.tenants VALUES ('${tenant(1)}', '${portfolio}', 'applicant');
        INSERT INTO public.leases VALUES
          ('${lease(1)}', '${portfolio}', '["${tenant(1)}"]', '${tenant(1)}', 'signed', '2026-01-01', '2026-12-31', NULL);
        SET ROLE authenticated;
      `);
      await expect(db.query("SELECT * FROM public.advance_due_lease_lifecycle('2026-10-17'::date)"))
        .rejects.toThrow("permission denied");
      await db.exec("RESET ROLE");
      await db.exec(`
        ALTER TABLE public.lease_status_changes
          ADD CONSTRAINT reject_scheduled_history CHECK (reason <> 'scheduled-date-transition');
      `);
      await expect(db.query("SELECT * FROM public.advance_due_lease_lifecycle('2026-10-17'::date)"))
        .rejects.toThrow("reject_scheduled_history");
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1", [lease(1)],
      )).rows[0].lifecycle_stage).toBe("signed");
      expect((await db.query<{ status: string }>(
        "SELECT status FROM public.tenants WHERE id = $1", [tenant(1)],
      )).rows[0].status).toBe("applicant");
    } finally {
      await db.close();
    }
  });
});
