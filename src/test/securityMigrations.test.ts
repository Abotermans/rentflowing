// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolioA = "00000000-0000-0000-0000-000000000001";
const portfolioB = "00000000-0000-0000-0000-000000000002";
const propertyA = "00000000-0000-0000-0000-000000000011";
const propertyB = "00000000-0000-0000-0000-000000000012";
const unitA = "00000000-0000-0000-0000-000000000021";

const references: Record<string, string[]> = {
  properties: [], tenants: [], vendors: [], cost_categories: [], property_owners: [],
  units: ["property_id"],
  leases: ["property_id", "billing_tenant_id"],
  guarantees: ["lease_id"],
  lease_unit_assignments: ["lease_id", "unit_id"],
  lease_amendments: ["lease_id", "supersedes_amendment_id"],
  lease_amendment_changes: ["amendment_id"],
  receivable_items: ["lease_id", "tenant_id", "property_id", "unit_id"],
  cash_receipts: ["tenant_id", "lease_id", "property_id", "unit_id"],
  receipt_allocations: ["cash_receipt_id", "receivable_item_id"],
  maintenance_tickets: ["property_id", "unit_id", "tenant_id", "assigned_vendor_id"],
  allocation_rules: ["property_id"],
  cost_entries: ["category_id", "property_id", "unit_id", "allocation_rule_id"],
  allocation_rule_unit_shares: ["allocation_rule_id", "unit_id"],
  cost_allocation_results: ["cost_entry_id", "property_id", "unit_id"],
  property_owner_links: ["property_id", "owner_id"],
  lease_documents: ["lease_id"],
  lease_status_changes: ["lease_id"],
  charges_reconciliations: ["lease_id", "receivable_item_id"],
};

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
    CREATE TABLE public.portfolios (id uuid PRIMARY KEY);
    CREATE TABLE public.portfolio_members (
      id uuid PRIMARY KEY,
      portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
      role public.portfolio_role NOT NULL
    );
  `);
  for (const [table, columns] of Object.entries(references)) {
    await db.exec(`CREATE TABLE public.${table} (
      id uuid PRIMARY KEY,
      portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
      ${columns.map(column => `${column} uuid`).join(",\n      ")}${columns.length ? "," : ""}
      created_at timestamptz DEFAULT now()
    )`);
  }
  await db.exec(`ALTER TABLE public.leases ADD COLUMN tenant_ids jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await db.exec(`INSERT INTO public.portfolios (id) VALUES ('${portfolioA}'), ('${portfolioB}')`);
  return db;
}

async function migration(name: string) {
  return readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
}

describe("portfolio integrity migrations", () => {
  it("keeps custom document types referenced by existing documents", async () => {
    const db = await createDatabase();
    try {
      await db.exec(`ALTER TABLE public.lease_documents ADD COLUMN document_type text NOT NULL DEFAULT 'supporting';
        CREATE TABLE public.lease_document_types (
          id uuid PRIMARY KEY,
          portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
          slug text NOT NULL,
          label text NOT NULL,
          UNIQUE (portfolio_id, slug)
        );`);
      await db.exec(await migration("20261017130000_enforce_lease_document_types.sql"));
      await db.exec(`INSERT INTO public.lease_document_types (id, portfolio_id, slug, label)
        VALUES ('00000000-0000-0000-0000-000000000051', '${portfolioA}', 'inventory', 'Inventory')`);
      await db.exec(`INSERT INTO public.lease_documents (id, portfolio_id, document_type)
        VALUES ('00000000-0000-0000-0000-000000000052', '${portfolioA}', 'inventory')`);
      await expect(db.exec(`INSERT INTO public.lease_documents (id, portfolio_id, document_type)
        VALUES ('00000000-0000-0000-0000-000000000053', '${portfolioB}', 'inventory')`))
        .rejects.toThrow("is not configured for this portfolio");
      await expect(db.exec(`DELETE FROM public.lease_document_types WHERE slug = 'inventory'`))
        .rejects.toThrow("is used by lease documents");
      await expect(db.exec(`UPDATE public.lease_document_types SET slug = 'renamed' WHERE slug = 'inventory'`))
        .rejects.toThrow("is used by lease documents");
      await expect(db.exec(`UPDATE public.lease_document_types SET portfolio_id = '${portfolioB}' WHERE slug = 'inventory'`))
        .rejects.toThrow("is used by lease documents");
      await db.exec(`UPDATE public.lease_document_types SET label = 'Inventory form' WHERE slug = 'inventory'`);
      await db.exec(`INSERT INTO public.lease_documents (id, portfolio_id, document_type)
        VALUES ('00000000-0000-0000-0000-000000000054', '${portfolioB}', 'supporting')`);
      await db.exec(`DELETE FROM public.lease_documents WHERE document_type = 'inventory'`);
      await db.exec(`DELETE FROM public.lease_document_types WHERE slug = 'inventory'`);
    } finally {
      await db.close();
    }
  });

  it("rejects cross-portfolio references and portfolio reassignment", async () => {
    const db = await createDatabase();
    try {
      await db.exec(await migration("20261017150000_enforce_portfolio_reference_integrity.sql"));
      await db.exec(`INSERT INTO public.properties (id, portfolio_id) VALUES
        ('${propertyA}', '${portfolioA}'), ('${propertyB}', '${portfolioB}')`);
      await db.exec(`INSERT INTO public.units (id, portfolio_id, property_id)
        VALUES ('${unitA}', '${portfolioA}', '${propertyA}')`);

      await expect(db.exec(`INSERT INTO public.units (id, portfolio_id, property_id)
        VALUES ('00000000-0000-0000-0000-000000000022', '${portfolioB}', '${propertyA}')`))
        .rejects.toThrow("Portfolio mismatch");
      await expect(db.exec(`UPDATE public.units SET property_id = '${propertyB}' WHERE id = '${unitA}'`))
        .rejects.toThrow("Portfolio mismatch");
      await expect(db.exec(`UPDATE public.properties SET portfolio_id = '${portfolioB}' WHERE id = '${propertyA}'`))
        .rejects.toThrow("Cannot change portfolio_id");
      await db.exec(`UPDATE public.units SET property_id = '${propertyA}' WHERE id = '${unitA}'`);

      await db.exec(`INSERT INTO public.cash_receipts (id, portfolio_id)
        VALUES ('00000000-0000-0000-0000-000000000041', '${portfolioA}')`);
      await db.exec(`INSERT INTO public.receivable_items (id, portfolio_id)
        VALUES ('00000000-0000-0000-0000-000000000042', '${portfolioB}')`);
      await expect(db.exec(`INSERT INTO public.receipt_allocations
        (id, portfolio_id, cash_receipt_id, receivable_item_id)
        VALUES ('00000000-0000-0000-0000-000000000043', '${portfolioA}',
          '00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042')`))
        .rejects.toThrow("Portfolio mismatch");

      await db.exec(`INSERT INTO public.leases (id, portfolio_id)
        VALUES ('00000000-0000-0000-0000-000000000044', '${portfolioA}')`);
      await expect(db.exec(`INSERT INTO public.lease_documents (id, portfolio_id, lease_id)
        VALUES ('00000000-0000-0000-0000-000000000045', '${portfolioB}',
          '00000000-0000-0000-0000-000000000044')`))
        .rejects.toThrow("Portfolio mismatch");

      await db.exec(`INSERT INTO public.tenants (id, portfolio_id)
        VALUES ('00000000-0000-0000-0000-000000000046', '${portfolioB}')`);
      await expect(db.exec(`UPDATE public.leases SET billing_tenant_id =
        '00000000-0000-0000-0000-000000000046'
        WHERE id = '00000000-0000-0000-0000-000000000044'`))
        .rejects.toThrow("Portfolio mismatch");
      await expect(db.exec(`UPDATE public.leases SET tenant_ids =
        '["00000000-0000-0000-0000-000000000046"]'::jsonb
        WHERE id = '00000000-0000-0000-0000-000000000044'`))
        .rejects.toThrow("Portfolio mismatch");
      await db.exec(`INSERT INTO public.tenants (id, portfolio_id)
        VALUES ('00000000-0000-0000-0000-000000000047', '${portfolioA}')`);
      await db.exec(`UPDATE public.leases SET billing_tenant_id =
        '00000000-0000-0000-0000-000000000047',
        tenant_ids = '["00000000-0000-0000-0000-000000000047"]'::jsonb
        WHERE id = '00000000-0000-0000-0000-000000000044'`);
    } finally {
      await db.close();
    }
  });

  it("refuses to install triggers over existing mismatched rows", async () => {
    const db = await createDatabase();
    try {
      await db.exec(`INSERT INTO public.properties (id, portfolio_id) VALUES ('${propertyA}', '${portfolioA}')`);
      await db.exec(`INSERT INTO public.units (id, portfolio_id, property_id)
        VALUES ('${unitA}', '${portfolioB}', '${propertyA}')`);
      await expect(db.exec(await migration("20261017150000_enforce_portfolio_reference_integrity.sql")))
        .rejects.toThrow("mismatched rows");
    } finally {
      await db.close();
    }
  });

  it("refuses malformed historical lease participant data", async () => {
    const db = await createDatabase();
    try {
      await db.exec(`INSERT INTO public.leases (id, portfolio_id, tenant_ids)
        VALUES ('00000000-0000-0000-0000-000000000048', '${portfolioA}', '{}'::jsonb)`);
      await expect(db.exec(await migration("20261017150000_enforce_portfolio_reference_integrity.sql")))
        .rejects.toThrow("invalid tenant_ids");
    } finally {
      await db.close();
    }
  });

  it("protects the last owner but allows a portfolio delete cascade", async () => {
    const db = await createDatabase();
    try {
      await db.exec(await migration("20261017160000_harden_last_portfolio_owner.sql"));
      await db.exec(`CREATE TRIGGER trg_prevent_last_owner_removal
        BEFORE UPDATE OR DELETE ON public.portfolio_members
        FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_removal()`);
      await db.exec(`INSERT INTO public.portfolio_members (id, portfolio_id, role)
        VALUES ('00000000-0000-0000-0000-000000000031', '${portfolioA}', 'owner')`);
      await expect(db.exec(`DELETE FROM public.portfolio_members
        WHERE id = '00000000-0000-0000-0000-000000000031'`))
        .rejects.toThrow("Cannot remove the last owner");
      await expect(db.exec(`UPDATE public.portfolio_members SET role = 'admin'
        WHERE id = '00000000-0000-0000-0000-000000000031'`))
        .rejects.toThrow("Cannot remove the last owner");

      await db.exec(`INSERT INTO public.portfolio_members (id, portfolio_id, role)
        VALUES ('00000000-0000-0000-0000-000000000032', '${portfolioA}', 'owner')`);
      await db.exec(`DELETE FROM public.portfolio_members
        WHERE id = '00000000-0000-0000-0000-000000000031'`);
      await db.exec(`DELETE FROM public.portfolios WHERE id = '${portfolioA}'`);
      const remaining = await db.query<{ count: number }>(`SELECT count(*)::integer AS count
        FROM public.portfolio_members WHERE portfolio_id = '${portfolioA}'`);
      expect(remaining.rows[0].count).toBe(0);
    } finally {
      await db.close();
    }
  });
});
