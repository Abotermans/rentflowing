// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const cleanup = readFile(new URL("../../scripts/delete-demo-test-leases.sql", import.meta.url), "utf8");

async function demoDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.leases (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_reference text NOT NULL,
      lifecycle_stage text NOT NULL, updated_at timestamptz NOT NULL
    );
    CREATE TABLE public.lease_unit_assignments (lease_id uuid REFERENCES public.leases(id));
    CREATE TABLE public.receivable_items (lease_id uuid REFERENCES public.leases(id));
    CREATE TABLE public.cash_receipts (lease_id uuid REFERENCES public.leases(id));
    CREATE TABLE public.guarantees (lease_id uuid REFERENCES public.leases(id));
    CREATE TABLE public.lease_amendments (lease_id uuid REFERENCES public.leases(id));
    CREATE TABLE public.lease_documents (lease_id uuid REFERENCES public.leases(id));
    CREATE TABLE public.charges_reconciliations (lease_id uuid REFERENCES public.leases(id));
    CREATE TABLE public.lease_status_changes (lease_id uuid REFERENCES public.leases(id));
    INSERT INTO public.leases VALUES
      ('dfcc2668-1b94-4493-8d9e-41ea74bb05a3',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'HUB', 'active',
       '2026-06-25 19:06:54.997416+00'),
      ('6ad937b7-7ba9-4b28-920b-a8826f15a668',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'REZ', 'signed',
       '2026-06-25 18:31:52.306601+00'),
      ('ae014aa1-50c0-4ece-aee4-86faa617d9b3',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'REZ2', 'signed',
       '2026-06-25 18:36:19.018415+00'),
      ('00000000-0000-4000-8000-000000000099',
       'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'BAIL-KEEP-001', 'active',
       '2026-06-25 18:36:19+00');
  `);
  return db;
}

async function leaseReferences(db: PGlite): Promise<string[]> {
  const { rows } = await db.query<{ lease_reference: string }>(
    "SELECT lease_reference FROM public.leases ORDER BY lease_reference",
  );
  return rows.map(row => row.lease_reference);
}

describe("Demo test-lease cleanup", () => {
  it("deletes only the three pinned, empty test leases", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(await cleanup);
      expect(await leaseReferences(db)).toEqual(["BAIL-KEEP-001"]);
    } finally {
      await db.close();
    }
  });

  it("rolls back when one lease was edited", async () => {
    const db = await demoDatabase();
    try {
      await db.exec("UPDATE public.leases SET updated_at = now() WHERE lease_reference = 'REZ'");
      await expect(db.exec(await cleanup)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect(await leaseReferences(db)).toEqual(["BAIL-KEEP-001", "HUB", "REZ", "REZ2"]);
    } finally {
      await db.close();
    }
  });

  it("rolls back when a dependent receivable appeared", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`INSERT INTO public.receivable_items VALUES
        ('dfcc2668-1b94-4493-8d9e-41ea74bb05a3')`);
      await expect(db.exec(await cleanup)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect(await leaseReferences(db)).toEqual(["BAIL-KEEP-001", "HUB", "REZ", "REZ2"]);
    } finally {
      await db.close();
    }
  });

  it("rolls back when a new cascading lease child table is added", async () => {
    const db = await demoDatabase();
    try {
      await db.exec(`
        CREATE TABLE public.future_lease_events (
          lease_id uuid REFERENCES public.leases(id) ON DELETE CASCADE
        );
        INSERT INTO public.future_lease_events VALUES
          ('dfcc2668-1b94-4493-8d9e-41ea74bb05a3');
      `);
      await expect(db.exec(await cleanup)).rejects.toThrow("preflight changed");
      await db.exec("ROLLBACK");
      expect(await leaseReferences(db)).toEqual(["BAIL-KEEP-001", "HUB", "REZ", "REZ2"]);
      const { rows } = await db.query("SELECT lease_id FROM public.future_lease_events");
      expect(rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});
