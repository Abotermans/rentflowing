// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const preflight = readFile(new URL("../../scripts/preflight-demo-tenant-statuses.sql", import.meta.url), "utf8");
const repair = readFile(new URL("../../scripts/repair-demo-tenant-statuses.sql", import.meta.url), "utf8");
const portfolioId = "d26a0ef7-d0ee-41ba-8da7-51af3f0369b7";
const lucaId = "0349ad9c-7c63-44c3-a92c-96816f390d88";
const albertId = "8f09fdd0-87b0-4291-8fd8-f8ed4d9913fc";
const sophieId = "cb7892a0-d718-4154-bfb7-a3a0aceed577";

async function demoDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.tenants (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, status text NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE public.leases (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, tenant_ids jsonb NOT NULL,
      billing_tenant_id uuid, lifecycle_stage text NOT NULL
    );
    INSERT INTO public.tenants VALUES
      ('${lucaId}', '${portfolioId}', 'applicant', '2026-01-15 00:00:00+00'),
      ('${albertId}', '${portfolioId}', 'active', '2026-06-16 11:18:35.416687+00'),
      ('${sophieId}', '${portfolioId}', 'former', '2025-12-31 00:00:00+00');
    INSERT INTO public.leases VALUES
      ('00000000-0000-4000-8000-000000000001', '${portfolioId}', '["${lucaId}"]', '${lucaId}', 'active'),
      ('00000000-0000-4000-8000-000000000002', '${portfolioId}', '["${albertId}"]', '${albertId}', 'draft'),
      ('00000000-0000-4000-8000-000000000003', '${portfolioId}', '["${sophieId}"]', '${sophieId}', 'signed'),
      ('00000000-0000-4000-8000-000000000004', '${portfolioId}', '["${sophieId}"]', '${sophieId}', 'ended');
  `);
  return db;
}

async function statusRows(db: PGlite) {
  return (await db.query<{ id: string; status: string }>(
    "SELECT id::text, status FROM public.tenants ORDER BY id",
  )).rows;
}

describe("guarded Demo tenant status repair", () => {
  it("updates exactly the three derived statuses and retains their before-images", async () => {
    const db = await demoDatabase();
    try {
      expect((await db.query<{ check_name: string; affected: number }>(await preflight)).rows)
        .toEqual([
          { check_name: "tenant_identity_and_versions", affected: 0 },
          { check_name: "derived_target_statuses", affected: 0 },
          { check_name: "unexpected_tenant_status_mismatches", affected: 0 },
        ]);
      await db.exec(await repair);
      expect(await statusRows(db)).toEqual([
        { id: lucaId, status: "active" },
        { id: albertId, status: "applicant" },
        { id: sophieId, status: "applicant" },
      ]);
      const before = (await db.query<{ tenant_id: string; status: string }>(`
        SELECT tenant_id::text, before_row->>'status' AS status
        FROM tenant_status_repair_audit.before_20261115 ORDER BY tenant_id
      `)).rows;
      expect(before).toEqual([
        { tenant_id: lucaId, status: "applicant" },
        { tenant_id: albertId, status: "active" },
        { tenant_id: sophieId, status: "former" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("aborts without changes when a tenant version has changed", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`UPDATE public.tenants SET updated_at = '2026-07-01'
        WHERE id = '${albertId}'`);
      const checks = (await db.query<{ check_name: string; affected: number }>(await preflight)).rows;
      expect(checks.find(row => row.check_name === "tenant_identity_and_versions")?.affected).toBe(1);
      await expect(db.exec(await repair)).rejects.toThrow("identities or versions changed");
      await db.exec("ROLLBACK");
      expect((await statusRows(db)).map(row => row.status)).toEqual(["applicant", "active", "former"]);
      expect((await db.query<{ name: string | null }>(`
        SELECT to_regclass('tenant_status_repair_audit.before_20261115')::text AS name
      `)).rows[0].name).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("aborts when a linked lease changes the derived status", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`UPDATE public.leases SET lifecycle_stage = 'ended'
        WHERE billing_tenant_id = '${lucaId}'`);
      const checks = (await db.query<{ check_name: string; affected: number }>(await preflight)).rows;
      expect(checks.find(row => row.check_name === "derived_target_statuses")?.affected).toBe(1);
      await expect(db.exec(await repair)).rejects.toThrow("Linked lease stages changed");
      await db.exec("ROLLBACK");
      expect((await statusRows(db)).map(row => row.status)).toEqual(["applicant", "active", "former"]);
    } finally {
      await db.close();
    }
  });

  it("aborts when another tenant develops an unreviewed mismatch", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`INSERT INTO public.tenants VALUES
        ('00000000-0000-4000-8000-000000000050', '${portfolioId}', 'former', now());
        INSERT INTO public.leases VALUES
        ('00000000-0000-4000-8000-000000000051', '${portfolioId}',
          '["00000000-0000-4000-8000-000000000050"]',
          '00000000-0000-4000-8000-000000000050', 'active')`);
      const checks = (await db.query<{ check_name: string; affected: number }>(await preflight)).rows;
      expect(checks.find(row => row.check_name === "unexpected_tenant_status_mismatches")?.affected).toBe(1);
      await expect(db.exec(await repair)).rejects.toThrow("Unexpected tenant status mismatches");
      await db.exec("ROLLBACK");
      expect((await statusRows(db)).filter(row => row.id !== "00000000-0000-4000-8000-000000000050")
        .map(row => row.status)).toEqual(["applicant", "active", "former"]);
    } finally {
      await db.close();
    }
  });
});
