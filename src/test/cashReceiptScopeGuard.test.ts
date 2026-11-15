// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "10000000-0000-0000-0000-000000000001";
const property = "20000000-0000-0000-0000-000000000001";
const otherProperty = "20000000-0000-0000-0000-000000000002";
const unit = "30000000-0000-0000-0000-000000000001";
const otherUnit = "30000000-0000-0000-0000-000000000002";
const lease = "40000000-0000-0000-0000-000000000001";
const tenant = "50000000-0000-0000-0000-000000000001";
const otherTenant = "50000000-0000-0000-0000-000000000002";
const billingTenant = "50000000-0000-0000-0000-000000000003";
const strangerTenant = "50000000-0000-0000-0000-000000000004";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.leases (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
      tenant_ids jsonb NOT NULL, billing_tenant_id uuid
    );
    CREATE TABLE public.units (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL);
    CREATE TABLE public.lease_amendments (id uuid PRIMARY KEY, lease_id uuid NOT NULL, status text NOT NULL);
    CREATE TABLE public.lease_amendment_changes (
      id uuid PRIMARY KEY, amendment_id uuid NOT NULL, field_name text NOT NULL,
      old_value jsonb, new_value jsonb
    );
    CREATE TABLE public.cash_receipts (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid, tenant_id uuid,
      property_id uuid, unit_id uuid
    );
    INSERT INTO public.leases VALUES
      ('${lease}', '${portfolio}', '${property}', '["${tenant}"]', '${billingTenant}');
    INSERT INTO public.units VALUES
      ('${unit}', '${portfolio}', '${property}'),
      ('${otherUnit}', '${portfolio}', '${otherProperty}');
  `);
  return db;
}

async function addReceipt(db: PGlite, id: string, links: {
  leaseId?: string | null; tenantId?: string | null; propertyId?: string | null; unitId?: string | null;
}) {
  return db.query(`INSERT INTO public.cash_receipts VALUES ($1, $2, $3, $4, $5, $6)`, [
    id, portfolio, links.leaseId ?? null, links.tenantId ?? null,
    links.propertyId ?? null, links.unitId ?? null,
  ]);
}

describe("cash receipt reference guard", () => {
  it("rejects forged lease, tenant, property and unit combinations without changing valid receipts", async () => {
    const db = await fixture();
    try {
      const migration = await readFile(new URL("../../supabase/migrations/20261107230000_guard_cash_receipt_scope.sql", import.meta.url), "utf8");
      await db.exec(migration);
      await addReceipt(db, "60000000-0000-0000-0000-000000000001", {
        leaseId: lease, tenantId: tenant, propertyId: property, unitId: unit,
      });
      await addReceipt(db, "60000000-0000-0000-0000-000000000002", {
        leaseId: lease, tenantId: billingTenant, unitId: unit,
      });
      await expect(addReceipt(db, "60000000-0000-0000-0000-000000000003", {
        leaseId: lease, tenantId: otherTenant,
      })).rejects.toThrow("does not belong to this lease history");
      await expect(addReceipt(db, "60000000-0000-0000-0000-000000000004", {
        leaseId: lease, propertyId: otherProperty,
      })).rejects.toThrow("property, or tenant does not match");
      await expect(addReceipt(db, "60000000-0000-0000-0000-000000000005", {
        leaseId: lease, unitId: otherUnit,
      })).rejects.toThrow("unit must belong to its property");
      await expect(addReceipt(db, "60000000-0000-0000-0000-000000000006", {
        unitId: unit,
      })).rejects.toThrow("unit must belong to its property");
      await expect(db.query("UPDATE public.cash_receipts SET property_id = $1 WHERE id = $2", [
        otherProperty, "60000000-0000-0000-0000-000000000001",
      ])).rejects.toThrow("property, or tenant does not match");
      expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.cash_receipts")).rows[0].count).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("flags historical mismatches without requiring an unsafe migration-time rewrite", async () => {
    const db = await fixture();
    try {
      await db.exec(`
        INSERT INTO public.lease_amendments VALUES
          ('70000000-0000-0000-0000-000000000001', '${lease}', 'active');
        INSERT INTO public.lease_amendment_changes VALUES
          ('80000000-0000-0000-0000-000000000001',
           '70000000-0000-0000-0000-000000000001', 'tenantIds',
           '["${otherTenant}"]', '["${tenant}"]');
      `);
      await addReceipt(db, "60000000-0000-0000-0000-000000000003", {
        leaseId: lease, tenantId: otherTenant,
      });
      await addReceipt(db, "60000000-0000-0000-0000-000000000004", {
        leaseId: lease, tenantId: strangerTenant,
      });
      const migration = await readFile(new URL("../../supabase/migrations/20261107230000_guard_cash_receipt_scope.sql", import.meta.url), "utf8");
      await db.exec(migration);
      await addReceipt(db, "60000000-0000-0000-0000-000000000005", {
        leaseId: lease, tenantId: otherTenant,
      });
      await expect(addReceipt(db, "60000000-0000-0000-0000-000000000006", {
        leaseId: lease, tenantId: strangerTenant,
      })).rejects.toThrow("does not belong to this lease history");
      const audit = await readFile(new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8");
      const check = audit.match(/SELECT 'cash_receipt_scope_mismatch'[\s\S]*?(?=\nUNION ALL\n|$)/)?.[0];
      expect(check).toBeTruthy();
      const result = await db.query<{ count: number }>(check!);
      expect(Number(result.rows[0].count)).toBe(1);
    } finally {
      await db.close();
    }
  });
});
