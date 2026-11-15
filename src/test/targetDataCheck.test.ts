// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { checkTargetData, requiredAuditChecks } from "../../scripts/check-target-data.mjs";

const backend = "https://othaxlwgtqpodncnlglv.supabase.co";
const zeroRows = () => requiredAuditChecks.map(check_name => ({ check_name, affected: "0" }));
const reply = (rows: unknown, status = 201) => new Response(JSON.stringify(rows), {
  status, headers: { "Content-Type": "application/json" },
});

describe("read-only target financial gate", () => {
  it("separately flags assignment gaps on payment-linked schedule rows", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'allocated_schedule_without_plausible_assignment'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.receivable_items (
          id text PRIMARY KEY, lease_id text, unit_id text, origin text, item_type text,
          due_date date, cycle_end_date date
        );
        CREATE TABLE public.lease_unit_assignments (
          lease_id text NOT NULL, unit_id text NOT NULL, start_date date NOT NULL, end_date date
        );
        CREATE TABLE public.receipt_allocations (receivable_item_id text NOT NULL);
        INSERT INTO public.receivable_items VALUES
          ('paid-orphan', 'lease', 'missing', 'lease-schedule', 'rent', '2026-01-01', '2026-01-31'),
          ('open-orphan', 'lease', 'missing', 'lease-schedule', 'charges', '2026-02-01', '2026-02-28'),
          ('paid-assigned', 'lease', 'assigned', 'lease-schedule', 'rent', '2026-01-01', '2026-01-31');
        INSERT INTO public.lease_unit_assignments VALUES
          ('lease', 'assigned', '2026-01-01', NULL);
        INSERT INTO public.receipt_allocations VALUES
          ('paid-orphan'), ('paid-orphan'), ('paid-assigned');
      `);
      expect(Number((await db.query<{ count: string }>(check!)).rows[0]?.count)).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("flags active leases whose current unit shares do not add up to lease totals", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'active_lease_share_total_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (id text PRIMARY KEY);
        CREATE TABLE public.leases (
          id text PRIMARY KEY, property_id text NOT NULL, lifecycle_stage text NOT NULL,
          start_date date NOT NULL, end_date date, monthly_rent numeric, monthly_charges numeric
        );
        CREATE TABLE public.lease_unit_assignments (
          lease_id text NOT NULL, start_date date NOT NULL, end_date date,
          rent_share numeric, charges_share numeric
        );
        INSERT INTO public.properties VALUES ('p');
        INSERT INTO public.leases VALUES
          ('matched', 'p', 'active', current_date - 30, NULL, 100, 20),
          ('mismatched', 'p', 'active', current_date - 30, NULL, 100, 20),
          ('missing', 'p', 'active', current_date - 30, NULL, 100, 20),
          ('ended', 'p', 'ended', current_date - 30, current_date - 1, 100, 20),
          ('future', 'p', 'active', current_date + 1, NULL, 100, 20);
        INSERT INTO public.lease_unit_assignments VALUES
          ('matched', current_date - 30, NULL, 60, 10),
          ('matched', current_date - 30, NULL, 40, 10),
          ('mismatched', current_date - 30, NULL, 100, 10),
          ('missing', current_date - 30, NULL, NULL, 10),
          ('ended', current_date - 30, current_date - 1, 100, 10),
          ('future', current_date + 1, NULL, 100, 10);
      `);
      const rows = await db.query<{ count: string }>(check!);
      expect(Number(rows.rows[0]?.count)).toBe(1);
      const schemaCheck = audit.match(/SELECT 'financial_audit_schema_missing'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
      expect(Number((await db.query<{ affected: string }>(schemaCheck!)).rows[0]?.affected)).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("flags future assignment windows whose shares will diverge from the lease", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'open_lease_window_share_total_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (id text PRIMARY KEY);
        CREATE TABLE public.leases (
          id text PRIMARY KEY, portfolio_id text NOT NULL, property_id text NOT NULL,
          lifecycle_stage text NOT NULL, start_date date NOT NULL, end_date date,
          move_out_actual_date date, monthly_rent numeric NOT NULL,
          monthly_charges numeric NOT NULL
        );
        CREATE TABLE public.lease_unit_assignments (
          lease_id text NOT NULL, portfolio_id text NOT NULL,
          start_date date NOT NULL, end_date date,
          rent_share numeric, charges_share numeric
        );
        INSERT INTO public.properties VALUES ('p');
        INSERT INTO public.leases VALUES
          ('future-join', 'portfolio', 'p', 'active', current_date - 30, NULL, NULL, 100, 20),
          ('future-exit', 'portfolio', 'p', 'active', current_date - 30, NULL, NULL, 100, 20),
          ('matched', 'portfolio', 'p', 'active', current_date - 30, NULL, NULL, 100, 20),
          ('closed', 'portfolio', 'p', 'ended', current_date - 30, NULL, NULL, 100, 20);
        INSERT INTO public.lease_unit_assignments VALUES
          ('future-join', 'portfolio', current_date - 30, NULL, 100, 20),
          ('future-join', 'portfolio', current_date + 30, NULL, 50, 0),
          ('future-exit', 'portfolio', current_date - 30, current_date + 30, 100, 20),
          ('matched', 'portfolio', current_date - 30, NULL, 100, 20),
          ('matched', 'portfolio', current_date + 30, NULL, 0, 0),
          ('closed', 'portfolio', current_date - 30, NULL, 100, 10);
      `);
      const rows = await db.query<{ count: string }>(check!);
      expect(Number(rows.rows[0]?.count)).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("detects overlapping assignment rows for one lease and unit", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'overlapping_same_lease_unit_assignments'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, lease_id text NOT NULL, unit_id text NOT NULL,
          start_date date NOT NULL, end_date date
        );
        INSERT INTO public.lease_unit_assignments VALUES
          ('00000000-0000-4000-8000-000000000001', 'lease', 'unit', '2026-01-01', '2026-06-30'),
          ('00000000-0000-4000-8000-000000000002', 'lease', 'unit', '2026-06-30', NULL),
          ('00000000-0000-4000-8000-000000000003', 'lease', 'other', '2026-01-01', NULL);
      `);
      expect(Number((await db.query<{ count: string }>(check!)).rows[0]?.count)).toBe(0);
      await db.exec(`UPDATE public.lease_unit_assignments SET start_date = '2026-06-29'
        WHERE id = '00000000-0000-4000-8000-000000000002'`);
      expect(Number((await db.query<{ count: string }>(check!)).rows[0]?.count)).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("detects cross-lease overlap only within effective lease windows", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'overlapping_cross_lease_unit_assignments'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.leases (
          id text PRIMARY KEY, lifecycle_stage text NOT NULL,
          start_date date NOT NULL, end_date date, move_out_actual_date date
        );
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, lease_id text NOT NULL, unit_id text NOT NULL,
          start_date date NOT NULL, end_date date
        );
        INSERT INTO public.leases VALUES
          ('old', 'active', '2026-01-01', '2026-06-30', NULL),
          ('new', 'active', '2026-06-30', NULL, NULL),
          ('ended', 'ended', '2026-01-01', NULL, NULL);
        INSERT INTO public.lease_unit_assignments VALUES
          ('00000000-0000-4000-8000-000000000001', 'old', 'unit', '2026-01-01', NULL),
          ('00000000-0000-4000-8000-000000000002', 'new', 'unit', '2026-06-30', NULL),
          ('00000000-0000-4000-8000-000000000003', 'ended', 'unit', '2026-01-01', NULL);
      `);
      expect(Number((await db.query<{ count: string }>(check!)).rows[0]?.count)).toBe(0);
      await db.exec("UPDATE public.leases SET end_date = '2026-07-01' WHERE id = 'old'");
      expect(Number((await db.query<{ count: string }>(check!)).rows[0]?.count)).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("separates open, paid, and stale-stage records after actual move-out", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const extract = (name: string) => audit.match(
      new RegExp(`SELECT '${name}'[\\s\\S]*?(?=\\nUNION ALL\\n|$)`),
    )?.[0];
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (id text PRIMARY KEY);
        CREATE TABLE public.leases (
          id text PRIMARY KEY, property_id text NOT NULL,
          lifecycle_stage text NOT NULL, move_out_actual_date date
        );
        CREATE TABLE public.receivable_items (
          lease_id text NOT NULL, origin text NOT NULL, status text NOT NULL,
          allocated_amount numeric NOT NULL, due_date date NOT NULL,
          cycle_end_date date
        );
        INSERT INTO public.properties VALUES ('p');
        INSERT INTO public.leases VALUES
          ('moved', 'p', 'active', '2020-06-30'),
          ('not-moved', 'p', 'active', NULL);
        INSERT INTO public.receivable_items VALUES
          ('moved', 'lease-schedule', 'open', 0, '2020-07-01', '2020-07-31'),
          ('moved', 'lease-schedule', 'overdue', 0, '2020-06-01', '2020-07-31'),
          ('moved', 'lease-schedule', 'paid', 120, '2020-09-01', '2020-09-30'),
          ('moved', 'lease-schedule', 'paid', 120, '2020-05-01', '2020-05-31'),
          ('not-moved', 'lease-schedule', 'open', 0, '2020-07-01', '2020-07-31');
      `);
      for (const [check, expected] of [
        ["open_schedule_after_actual_move_out", 2],
        ["paid_schedule_after_actual_move_out", 1],
        ["active_lease_past_actual_move_out", 1],
      ] as const) {
        expect(Number((await db.query<{ count: string }>(extract(check)!)).rows[0]?.count)).toBe(expected);
      }
    } finally {
      await db.close();
    }
  });

  it("audits property cost allocations before the partial-ownership column exists", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'property_cost_overallocated'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.properties (id text PRIMARY KEY, millieme_base integer NOT NULL);
        CREATE TABLE public.units (property_id text NOT NULL, millieme_shares jsonb NOT NULL);
        CREATE TABLE public.cost_entries (
          id text PRIMARY KEY, property_id text NOT NULL, status text NOT NULL,
          unit_id text, amount numeric NOT NULL
        );
        CREATE TABLE public.cost_allocation_results (
          cost_entry_id text NOT NULL, allocated_amount numeric NOT NULL
        );
        INSERT INTO public.properties VALUES ('p', 1000);
        INSERT INTO public.units VALUES ('p', '{"general":100}');
        INSERT INTO public.cost_entries VALUES ('c', 'p', 'active', NULL, 100);
        INSERT INTO public.cost_allocation_results VALUES ('c', 100);
      `);
      expect(Number((await db.query<{ count: string }>(check!)).rows[0]?.count)).toBe(0);
      await db.exec("UPDATE public.cost_allocation_results SET allocated_amount = 101");
      expect(Number((await db.query<{ count: string }>(check!)).rows[0]?.count)).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("separates resolvable legacy amendment references from broken references", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const brokenCheck = audit.match(/SELECT 'amendment_unit_reference_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    const legacyCheck = audit.match(/SELECT 'legacy_amendment_unit_reference_pending'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.leases (id text PRIMARY KEY, portfolio_id text NOT NULL, property_id text NOT NULL);
        CREATE TABLE public.lease_amendments (id text PRIMARY KEY, lease_id text NOT NULL, portfolio_id text NOT NULL);
        CREATE TABLE public.lease_amendment_changes (
          id text PRIMARY KEY, amendment_id text NOT NULL, portfolio_id text NOT NULL,
          field_name text NOT NULL, metadata jsonb
        );
        CREATE TABLE public.units (
          id text PRIMARY KEY, portfolio_id text NOT NULL, property_id text NOT NULL, legacy_id text
        );
        INSERT INTO public.leases VALUES ('l', 'portfolio', 'property');
        INSERT INTO public.lease_amendments VALUES ('a', 'l', 'portfolio');
        INSERT INTO public.units VALUES
          ('unit-1', 'portfolio', 'property', 'old-1'),
          ('unit-2', 'portfolio', 'property', 'old-2');
        INSERT INTO public.lease_amendment_changes VALUES
          ('current', 'a', 'portfolio', 'unitAssignments', '{"unitId":"unit-1"}'),
          ('legacy', 'a', 'portfolio', 'unitRentShare', '{"unitId":"old-2"}'),
          ('missing', 'a', 'portfolio', 'unitEndDate', '{"unitId":"gone"}');
      `);
      expect(Number((await db.query<{ count: string }>(brokenCheck!)).rows[0]?.count)).toBe(1);
      expect(Number((await db.query<{ count: string }>(legacyCheck!)).rows[0]?.count)).toBe(1);
      await db.exec("UPDATE public.lease_amendment_changes SET metadata = '{\"unitId\":\"unit-2\"}' WHERE id = 'legacy'");
      expect(Number((await db.query<{ count: string }>(legacyCheck!)).rows[0]?.count)).toBe(0);
    } finally {
      await db.close();
    }
  });

  it("flags missing unit pricing on persisted leases without treating zero as missing", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'lease_assignment_missing_pricing'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.leases (id text PRIMARY KEY, lifecycle_stage text NOT NULL);
        CREATE TABLE public.lease_unit_assignments (
          lease_id text NOT NULL, rent_share numeric, charges_share numeric
        );
        INSERT INTO public.leases VALUES ('active', 'active'), ('ended', 'ended'), ('draft', 'draft');
        INSERT INTO public.lease_unit_assignments VALUES
          ('active', NULL, NULL), ('ended', 100, NULL), ('draft', NULL, NULL),
          ('active', 0, 0);
      `);
      const rows = await db.query<{ count: string }>(check!);
      expect(Number(rows.rows[0]?.count)).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("separately detects historical guarantee amount and status drift", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const amountCheck = audit.match(/SELECT 'guarantee_amount_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    const statusCheck = audit.match(/SELECT 'guarantee_status_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(amountCheck).toBeTruthy();
    expect(statusCheck).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.guarantees (
          expected_amount numeric NOT NULL, received_amount numeric NOT NULL,
          retention_amount numeric, received_date date, release_date date, status text NOT NULL
        );
        INSERT INTO public.guarantees VALUES
          (100, 0, NULL, NULL, NULL, 'pending'),
          (-1, 0, NULL, NULL, NULL, 'pending'),
          (100, 1.001, NULL, NULL, NULL, 'incomplete'),
          (100, 50, 60, NULL, '2026-02-01', 'partially-retained'),
          (100, 100, NULL, '2026-02-01', '2026-01-01', 'released'),
          (100, 100, NULL, NULL, NULL, 'pending'),
          (100, 100, 1, NULL, NULL, 'active');
      `);
      expect(Number((await db.query<{ count: string }>(amountCheck!)).rows[0]?.count)).toBe(5);
      expect(Number((await db.query<{ count: string }>(statusCheck!)).rows[0]?.count)).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("counts surplus guarantees hidden by the single-guarantee UI", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'duplicate_lease_guarantees'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.guarantees (lease_id text NOT NULL);
        INSERT INTO public.guarantees VALUES ('lease-a'), ('lease-a'), ('lease-a'), ('lease-b');
      `);
      expect(Number((await db.query<{ coalesce: string }>(check!)).rows[0]?.coalesce)).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("detects a default portfolio after the user loses its membership", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'default_portfolio_inaccessible'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.profiles (id text PRIMARY KEY, default_portfolio_id text);
        CREATE TABLE public.portfolio_members (user_id text NOT NULL, portfolio_id text NOT NULL);
        INSERT INTO public.profiles VALUES
          ('u1', 'former'), ('u2', 'current'), ('u3', NULL);
        INSERT INTO public.portfolio_members VALUES ('u1', 'other'), ('u2', 'current');
      `);
      expect(Number((await db.query<{ count: string }>(check!)).rows[0]?.count)).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("lists duplicate guarantees without choosing a row to delete", async () => {
    const sql = await readFile(new URL("../../scripts/audit-duplicate-guarantees.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.leases (id uuid PRIMARY KEY, lease_reference text NOT NULL);
        CREATE TABLE public.guarantees (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL,
          type text NOT NULL, status text NOT NULL, expected_amount numeric,
          received_amount numeric, retention_amount numeric,
          received_date date, release_date date, created_at timestamptz NOT NULL
        );
        INSERT INTO public.leases VALUES
          ('10000000-0000-0000-0000-000000000001', 'LEASE-1'),
          ('10000000-0000-0000-0000-000000000002', 'LEASE-2');
        INSERT INTO public.guarantees VALUES
          ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000001', 'cash-deposit', 'active', 100, 100, NULL,
            '2026-01-01', NULL, '2026-01-01'),
          ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000001', 'bank-guarantee', 'pending', 200, 0, NULL,
            NULL, NULL, '2026-01-02'),
          ('20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000002', 'cash-deposit', 'pending', 50, 0, NULL,
            NULL, NULL, '2026-01-03');
      `);
      const rows = await db.query<{ lease_reference: string; guarantee_count: number; guarantees: Array<{ id: string }> }>(sql);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].lease_reference).toBe("LEASE-1");
      expect(rows.rows[0].guarantee_count).toBe(2);
      expect(rows.rows[0].guarantees.map(g => g.id)).toEqual([
        "20000000-0000-0000-0000-000000000001",
        "20000000-0000-0000-0000-000000000002",
      ]);
    } finally {
      await db.close();
    }
  });

  it("expects every SQL audit check exactly once", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const sqlChecks = [...audit.matchAll(/SELECT '([^']+)'(?: AS check_name)?,/g)]
      .map(match => match[1]);
    expect(sqlChecks).toEqual(requiredAuditChecks);
  });

  it("flags receipt labels inconsistent with their unapplied balance", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'positive_receipt_status_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.cash_receipts (
          amount_received numeric(14,2) NOT NULL,
          unmatched_amount numeric(14,2) NOT NULL,
          status text NOT NULL
        );
        INSERT INTO public.cash_receipts VALUES
          (120, 120, 'unmatched'), (120, 0, 'matched'),
          (120, 50, 'partially-matched'), (0.02, 0.01, 'partially-matched'),
          (120, 120, 'imported'), (120, 0, 'exception'),
          (120, 0, 'unmatched'), (120, 120, 'matched'),
          (120, 0, 'partially-matched'), (120, 120, 'partially-matched');
      `);
      const rows = await db.query<{ count: string }>(check!);
      expect(Number(rows.rows[0]?.count)).toBe(4);
    } finally {
      await db.close();
    }
  });

  it("flags receipt allocations that exceed a receivable's paid amount without rejecting paid backfill", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'receivable_allocation_exceeds_paid'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.receivable_items (id text PRIMARY KEY, allocated_amount numeric(14,2) NOT NULL);
        CREATE TABLE public.receipt_allocations (receivable_item_id text NOT NULL, allocated_amount numeric(14,2) NOT NULL);
        INSERT INTO public.receivable_items VALUES
          ('historical-paid', 100), ('matched', 100), ('mixed', 100),
          ('overlinked', 10), ('unpaid-linked', 0);
        INSERT INTO public.receipt_allocations VALUES
          ('matched', 100), ('mixed', 50), ('overlinked', 15), ('unpaid-linked', 5);
      `);
      const result = await db.query<{ count: string }>(check!);
      expect(Number(result.rows[0]?.count)).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("detects tenant status mismatches across linked leases and ignores unlinked tenants", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const check = audit.match(/SELECT 'tenant_status_lease_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(check).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.tenants (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, status text NOT NULL);
        CREATE TABLE public.leases (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, tenant_ids jsonb NOT NULL DEFAULT '[]',
          billing_tenant_id uuid, lifecycle_stage text NOT NULL, lease_reference text NOT NULL DEFAULT ''
        );
        INSERT INTO public.tenants VALUES
          ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','former'),
          ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','applicant'),
          ('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','former'),
          ('00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','active'),
          ('00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','former');
        INSERT INTO public.leases VALUES
          ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
            '["00000000-0000-0000-0000-000000000001"]',NULL,'active'),
          ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
            '[]','00000000-0000-0000-0000-000000000002','signed'),
          ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',
            '["00000000-0000-0000-0000-000000000003"]',NULL,'ended'),
          ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',
            '["00000000-0000-0000-0000-000000000004"]',NULL,'active'),
          ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',
            '["00000000-0000-0000-0000-000000000004"]',NULL,'draft');
      `);
      const rows = await db.query<{ count: string }>(check!);
      expect(Number(rows.rows[0]?.count)).toBe(1);
      const detail = await readFile(new URL("../../scripts/audit-tenant-status-mismatches.sql", import.meta.url), "utf8");
      const mismatches = await db.query<{
        tenant_id: string; stored_status: string; expected_status: string;
        leases: Array<{ reference: string; stage: string }>;
      }>(detail);
      expect(mismatches.rows).toHaveLength(1);
      expect(mismatches.rows[0]).toMatchObject({
        tenant_id: "00000000-0000-0000-0000-000000000001",
        stored_status: "former", expected_status: "active",
        leases: [{ stage: "active" }],
      });
    } finally {
      await db.close();
    }
  });

  it("separates identical lease bills with different unit anchors from disputed bills", async () => {
    const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
    const same = audit.match(/SELECT 'same_bill_schedule_collisions'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    const different = audit.match(/SELECT 'different_bill_schedule_collisions'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
    expect(same).toBeTruthy();
    expect(different).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.receivable_items (
          portfolio_id text, lease_id text, item_type text, due_date date, period_month text,
          tenant_id text, property_id text, unit_id text, currency_code text,
          expected_amount numeric, cycle_index integer, cycle_end_date date,
          label text, notes text, priority integer, origin text
        );
        INSERT INTO public.receivable_items VALUES
          ('p','l','rent','2026-01-01','2026-01','t','q','u1','EUR',100,NULL,NULL,'Rent','',10,'lease-schedule'),
          ('p','l','rent','2026-01-01','2026-01','t','q','u2','EUR',100,NULL,NULL,'Rent','',10,'lease-schedule'),
          ('p','l','rent','2026-02-01','2026-02','t','q','u1','EUR',100,NULL,NULL,'Rent','',10,'lease-schedule'),
          ('p','l','rent','2026-02-01','2026-02','t','q','u2','GBP',100,NULL,NULL,'Rent','',10,'lease-schedule'),
          ('p','l','rent','2026-03-01','2026-03','t','q','u1','EUR',100,NULL,NULL,'Rent','',10,'lease-schedule'),
          ('p','l','rent','2026-04-01','2026-04','t','q','u1','EUR',100,1,'2026-04-30','Rent','',10,'lease-schedule'),
          ('p','l','rent','2026-04-01','2026-04','t','q','u2','EUR',100,1,'2026-06-30','Rent','',10,'lease-schedule');
      `);
      expect(Number((await db.query<{ count: string }>(same!)).rows[0]?.count)).toBe(1);
      expect(Number((await db.query<{ count: string }>(different!)).rows[0]?.count)).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("sends the complete audit to the read-only endpoint and accepts zero counts", async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) => reply(zeroRows()));
    await expect(checkTargetData(backend, "scoped-token", fetchImpl)).resolves.toBe(requiredAuditChecks.length);
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.supabase.com/v1/projects/othaxlwgtqpodncnlglv/database/query/read-only");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer scoped-token");
    expect(JSON.parse(options.body as string).query).toContain("lease_schedule_missing_cycle_metadata");
    expect(JSON.parse(options.body as string).query).toContain("lease_assignment_missing_pricing");
    expect(JSON.parse(options.body as string).query).toContain("positive_receipt_status_mismatch");
    expect(JSON.parse(options.body as string).query).toContain("stored_lease_stage_behind_dates");
  });

  it("rejects nonzero financial exposure", async () => {
    const rows = zeroRows();
    rows.find(row => row.check_name === "duplicate_lease_schedule_rows")!.affected = "48";
    rows.find(row => row.check_name === "receipt_property_currency_mismatch")!.affected = "3";
    await expect(checkTargetData(backend, "scoped-token", async () => reply(rows)))
      .rejects.toThrow("duplicate_lease_schedule_rows: 48, receipt_property_currency_mismatch: 3");
  });

  it("fails closed on incomplete, repeated, unexpected, or malformed results", async () => {
    await expect(checkTargetData(backend, "token", async () => reply(zeroRows().slice(1))))
      .rejects.toThrow("incomplete result");
    const repeated = zeroRows();
    repeated[1].check_name = repeated[0].check_name;
    await expect(checkTargetData(backend, "token", async () => reply(repeated)))
      .rejects.toThrow("unexpected or repeated checks");
    const unexpected = zeroRows();
    unexpected[1].check_name = "unknown_check";
    await expect(checkTargetData(backend, "token", async () => reply(unexpected)))
      .rejects.toThrow("unexpected or repeated checks");
    const invalid = zeroRows();
    invalid[0].affected = "NaN";
    await expect(checkTargetData(backend, "token", async () => reply(invalid)))
      .rejects.toThrow("invalid count");
  });

  it("requires a scoped token and the read-only service to respond", async () => {
    await expect(checkTargetData(backend, "", async () => reply(zeroRows())))
      .rejects.toThrow("SUPABASE_MANAGEMENT_READ_TOKEN");
    await expect(checkTargetData("http://othaxlwgtqpodncnlglv.supabase.co", "token", async () => reply(zeroRows())))
      .rejects.toThrow("hosted Supabase HTTPS origin");
    await expect(checkTargetData(backend, "token", async () => reply({}, 403)))
      .rejects.toThrow("HTTP 403");
  });
});
