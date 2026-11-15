// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const cleanup = readFile(new URL("../../scripts/delete-demo-linked-test-leases.sql", import.meta.url), "utf8");

async function seededDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.leases (id uuid PRIMARY KEY, portfolio_id uuid,
      lease_reference text, lifecycle_stage text);
    CREATE TABLE public.lease_unit_assignments (id uuid PRIMARY KEY, lease_id uuid);
    CREATE TABLE public.receivable_items (id uuid PRIMARY KEY, lease_id uuid);
    CREATE TABLE public.cash_receipts (id uuid PRIMARY KEY, lease_id uuid,
      import_batch_id uuid, raw_bank_transaction_id uuid);
    CREATE TABLE public.receipt_allocations (id uuid PRIMARY KEY,
      cash_receipt_id uuid, receivable_item_id uuid);
    CREATE TABLE public.guarantees (id uuid PRIMARY KEY, lease_id uuid);
    CREATE TABLE public.lease_amendments (id uuid PRIMARY KEY, lease_id uuid,
      supersedes_amendment_id uuid);
    CREATE TABLE public.lease_amendment_changes (id uuid PRIMARY KEY, amendment_id uuid);
    CREATE TABLE public.lease_status_changes (id uuid PRIMARY KEY, lease_id uuid);
    CREATE TABLE public.lease_documents (id uuid PRIMARY KEY, lease_id uuid);
    CREATE TABLE public.charges_reconciliations (id uuid PRIMARY KEY,
      lease_id uuid, receivable_item_id uuid);
    INSERT INTO public.leases VALUES
      ('d3e2d7f8-f03c-4748-afaa-7f6749308474',
        'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'BAIL-AMS-001', 'ended'),
      ('62dff3c9-9e32-4697-a177-e4f5f46ca168',
        'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'BAIL-BRU-001', 'ended'),
      ('897b15d1-251a-4ba2-ba38-702687375537',
        'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'BAIL-PAR-001', 'ended'),
      ('00000000-0000-0000-0000-000000000099',
        'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7', 'KEEP', 'active');
    INSERT INTO public.lease_unit_assignments
      SELECT ('00000000-0000-4000-8001-' || lpad(n::text, 12, '0'))::uuid, id
      FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM public.leases
        WHERE lease_reference <> 'KEEP') AS targets;
    INSERT INTO public.receivable_items
      SELECT ('00000000-0000-4000-8002-' || lpad(n::text, 12, '0'))::uuid,
        CASE WHEN n <= 15 THEN 'd3e2d7f8-f03c-4748-afaa-7f6749308474'::uuid
          WHEN n <= 71 THEN '62dff3c9-9e32-4697-a177-e4f5f46ca168'::uuid
          ELSE '897b15d1-251a-4ba2-ba38-702687375537'::uuid END
      FROM generate_series(1, 134) AS n;
    INSERT INTO public.receivable_items VALUES
      ('00000000-0000-4000-8002-000000000999', '00000000-0000-0000-0000-000000000099');
    INSERT INTO public.cash_receipts
      SELECT ('00000000-0000-4000-8003-' || lpad(n::text, 12, '0'))::uuid,
        CASE WHEN n <= 4 THEN 'd3e2d7f8-f03c-4748-afaa-7f6749308474'::uuid
          WHEN n <= 7 THEN '62dff3c9-9e32-4697-a177-e4f5f46ca168'::uuid
          ELSE '897b15d1-251a-4ba2-ba38-702687375537'::uuid END,
        NULL::uuid, NULL::uuid
      FROM generate_series(1, 10) AS n;
    INSERT INTO public.receipt_allocations
      SELECT ('00000000-0000-4000-8004-' || lpad(n::text, 12, '0'))::uuid,
        ('00000000-0000-4000-8003-' || lpad((CASE WHEN n <= 7 THEN 1
          WHEN n <= 12 THEN 5 ELSE 8 END)::text, 12, '0'))::uuid,
        ('00000000-0000-4000-8002-' || lpad((CASE WHEN n <= 7 THEN n
          WHEN n <= 12 THEN n + 8 ELSE n + 59 END)::text, 12, '0'))::uuid
      FROM generate_series(1, 18) AS n;
    INSERT INTO public.guarantees
      SELECT ('00000000-0000-4000-8005-' || lpad(row_number() OVER (ORDER BY id)::text, 12, '0'))::uuid,
        id FROM public.leases WHERE lease_reference <> 'KEEP';
    INSERT INTO public.lease_amendments VALUES
      ('00000000-0000-4000-8006-000000000001', 'd3e2d7f8-f03c-4748-afaa-7f6749308474', NULL),
      ('00000000-0000-4000-8006-000000000002', '62dff3c9-9e32-4697-a177-e4f5f46ca168', NULL),
      ('00000000-0000-4000-8006-000000000003', '62dff3c9-9e32-4697-a177-e4f5f46ca168', NULL),
      ('00000000-0000-4000-8006-000000000004', '897b15d1-251a-4ba2-ba38-702687375537', NULL);
    INSERT INTO public.lease_amendment_changes
      SELECT ('00000000-0000-4000-8007-' || lpad(n::text, 12, '0'))::uuid,
        ('00000000-0000-4000-8006-' || lpad((CASE WHEN n <= 2 THEN 1
          WHEN n <= 4 THEN 2 ELSE 4 END)::text, 12, '0'))::uuid
      FROM generate_series(1, 6) AS n;
    INSERT INTO public.lease_status_changes
      SELECT ('00000000-0000-4000-8008-' || lpad(row_number() OVER (ORDER BY id)::text, 12, '0'))::uuid,
        id FROM public.leases WHERE lease_reference <> 'KEEP';
  `);
  return db;
}

describe("guarded cleanup of linked Demo test leases", () => {
  it("removes exactly the three approved lease graphs and preserves before-images", async () => {
    const db = await seededDatabase();
    try {
      await db.exec(await cleanup);
      expect((await db.query("SELECT lease_reference FROM public.leases")).rows)
        .toEqual([{ lease_reference: "KEEP" }]);
      expect((await db.query("SELECT id FROM public.receivable_items")).rows).toHaveLength(1);
      expect((await db.query("SELECT id FROM public.cash_receipts")).rows).toHaveLength(0);
      const audit = await db.query<{ entity: string; count: number }>(`
        SELECT entity, count(*)::integer AS count
        FROM repair_audit.demo_linked_test_leases_20261115
        GROUP BY entity ORDER BY entity
      `);
      expect(Object.fromEntries(audit.rows.map(row => [row.entity, row.count]))).toEqual({
        allocation: 18, amendment: 4, amendment_change: 6, assignment: 3,
        guarantee: 3, lease: 3, receipt: 10, receivable: 134, status_change: 3,
      });
    } finally {
      await db.close();
    }
  });

  it("rolls back if a target receipt is shared with another lease", async () => {
    const db = await seededDatabase();
    try {
      await db.exec(`INSERT INTO public.receipt_allocations VALUES
        ('00000000-0000-4000-8004-000000000999',
         '00000000-0000-4000-8003-000000000001',
         '00000000-0000-4000-8002-000000000999')`);
      await expect(db.exec(await cleanup)).rejects.toThrow("cleanup aborted");
      await db.exec("ROLLBACK");
      expect((await db.query("SELECT id FROM public.leases")).rows).toHaveLength(4);
      expect((await db.query("SELECT id FROM public.receivable_items")).rows).toHaveLength(135);
      expect((await db.query("SELECT to_regclass('repair_audit.demo_linked_test_leases_20261115') AS audit")).rows)
        .toEqual([{ audit: null }]);
    } finally {
      await db.close();
    }
  });
});
