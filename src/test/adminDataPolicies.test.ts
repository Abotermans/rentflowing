// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolioA = "00000000-0000-0000-0000-000000000001";
const portfolioB = "00000000-0000-0000-0000-000000000002";
const owner = "00000000-0000-0000-0000-000000000011";
const admin = "00000000-0000-0000-0000-000000000012";
const editor = "00000000-0000-0000-0000-000000000013";
const viewer = "00000000-0000-0000-0000-000000000014";

const operationalTables = [
  ["properties", "properties"], ["units", "units"], ["tenants", "tenants"],
  ["leases", "leases"], ["guarantees", "guarantees"],
  ["lease_unit_assignments", "lua"], ["lease_amendments", "la"],
  ["lease_amendment_changes", "lac"], ["receivable_items", "ri"],
  ["cash_receipts", "cr"], ["receipt_allocations", "ra"], ["vendors", "vendors"],
  ["maintenance_tickets", "mt"], ["cost_categories", "cc"],
  ["allocation_rules", "ar"], ["cost_entries", "ce"],
  ["allocation_rule_unit_shares", "arus"], ["cost_allocation_results", "car"],
  ["property_owners", "property_owners"], ["property_owner_links", "property_owner_links"],
  ["charges_reconciliations", "cr"],
] as const;

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
    CREATE TABLE public.portfolios (id uuid PRIMARY KEY);
    CREATE TABLE public.portfolio_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      portfolio_id uuid NOT NULL,
      user_id uuid NOT NULL,
      role public.portfolio_role NOT NULL
    );
    CREATE FUNCTION public.has_portfolio_role(_portfolio_id uuid, _user_id uuid, _roles public.portfolio_role[])
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.portfolio_members
        WHERE portfolio_id = _portfolio_id AND user_id = _user_id AND role = ANY(_roles))
    $$;
    CREATE FUNCTION public.is_portfolio_member(_portfolio_id uuid, _user_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.portfolio_members
        WHERE portfolio_id = _portfolio_id AND user_id = _user_id)
    $$;
    INSERT INTO public.portfolios (id) VALUES ('${portfolioA}'), ('${portfolioB}');
    INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES
      ('${portfolioA}', '${owner}', 'owner'),
      ('${portfolioA}', '${admin}', 'admin'),
      ('${portfolioA}', '${editor}', 'editor'),
      ('${portfolioA}', '${viewer}', 'viewer');
  `);
  const oldWriter = "public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::public.portfolio_role[])";
  for (const [table, prefix] of operationalTables) {
    await db.exec(`
      CREATE TABLE public.${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid NOT NULL, label text);
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO authenticated;
      ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY ${prefix}_select ON public.${table} FOR SELECT TO authenticated
        USING (public.is_portfolio_member(portfolio_id, auth.uid()));
      CREATE POLICY ${prefix}_insert ON public.${table} FOR INSERT TO authenticated WITH CHECK (${oldWriter});
      CREATE POLICY ${prefix}_update ON public.${table} FOR UPDATE TO authenticated USING (${oldWriter});
      CREATE POLICY ${prefix}_delete ON public.${table} FOR DELETE TO authenticated USING (${oldWriter});
    `);
  }
  await db.exec(`
    CREATE TABLE public.lease_status_changes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid NOT NULL);
    GRANT SELECT, INSERT ON public.lease_status_changes TO authenticated;
    ALTER TABLE public.lease_status_changes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY lease_status_changes_insert ON public.lease_status_changes FOR INSERT TO authenticated
      WITH CHECK (${oldWriter});
  `);
  return db;
}

describe("admin operational-data permissions", () => {
  it("grants admins the documented writer role without granting it to viewers or outsiders", async () => {
    const db = await createDatabase();
    try {
      const migration = await readFile(new URL("../../supabase/migrations/20261017170000_align_admin_data_permissions.sql", import.meta.url), "utf8");
      await db.exec(migration);
      const policies = await db.query<{ policyname: string; with_check: string | null; qual: string | null }>(`
        SELECT policyname, with_check, qual FROM pg_policies
        WHERE schemaname = 'public' AND cmd <> 'SELECT' AND tablename <> 'portfolio_members'
      `);
      expect(policies.rows).toHaveLength(operationalTables.length * 3 + 1);
      expect(policies.rows.every(row => (row.with_check ?? row.qual ?? "").includes("admin"))).toBe(true);

      await db.exec("SET ROLE authenticated");
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [admin]);
      for (const table of ["properties", "cash_receipts", "cost_entries"]) {
        await db.query(`INSERT INTO public.${table} (portfolio_id, label) VALUES ($1, 'initial')`, [portfolioA]);
        await db.query(`UPDATE public.${table} SET label = 'edited' WHERE portfolio_id = $1`, [portfolioA]);
        const rows = await db.query<{ label: string }>(`SELECT label FROM public.${table}`);
        expect(rows.rows).toEqual([{ label: "edited" }]);
        await db.query(`DELETE FROM public.${table} WHERE portfolio_id = $1`, [portfolioA]);
      }
      await db.query("INSERT INTO public.lease_status_changes (portfolio_id) VALUES ($1)", [portfolioA]);
      await expect(db.query("INSERT INTO public.properties (portfolio_id) VALUES ($1)", [portfolioB]))
        .rejects.toThrow("row-level security policy");

      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [viewer]);
      await expect(db.query("INSERT INTO public.properties (portfolio_id) VALUES ($1)", [portfolioA]))
        .rejects.toThrow("row-level security policy");
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [editor]);
      await db.query("INSERT INTO public.properties (portfolio_id) VALUES ($1)", [portfolioA]);
    } finally {
      await db.close();
    }
  });
});
