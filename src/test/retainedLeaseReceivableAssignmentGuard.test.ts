// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolioId = "00000000-0000-4000-8000-000000000001";
const leaseId = "00000000-0000-4000-8000-000000000002";
const unitId = "00000000-0000-4000-8000-000000000003";
const originalId = "00000000-0000-4000-8000-000000000004";
const replacementId = "00000000-0000-4000-8000-000000000005";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.lease_unit_assignments (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL,
      unit_id uuid NOT NULL, start_date date NOT NULL, end_date date
    );
    CREATE TABLE public.receivable_items (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid,
      unit_id uuid, origin text NOT NULL, item_type text NOT NULL,
      status text NOT NULL, due_date date NOT NULL, cycle_end_date date
    );
    INSERT INTO public.lease_unit_assignments VALUES
      ('${originalId}', '${portfolioId}', '${leaseId}', '${unitId}',
        '2026-01-01', '2026-06-30');
    INSERT INTO public.receivable_items VALUES
      ('00000000-0000-4000-8000-000000000006', '${portfolioId}', '${leaseId}',
        '${unitId}', 'lease-schedule', 'rent', 'paid', '2026-03-01', NULL),
      ('00000000-0000-4000-8000-000000000007', '${portfolioId}', '${leaseId}',
        '${unitId}', 'lease-schedule', 'rent', 'paid', '2025-12-01', NULL);
  `);
  await db.exec(await readFile(new URL(
    "../../supabase/migrations/20261113231000_guard_retained_lease_receivable_assignments.sql",
    import.meta.url,
  ), "utf8"));
  return db;
}

describe("retained lease receivable assignment guard", () => {
  it("rejects shortening or deleting the only assignment behind a paid rent row", async () => {
    const db = await setup();
    try {
      await expect(db.exec(`UPDATE public.lease_unit_assignments
        SET end_date = '2026-02-28' WHERE id = '${originalId}'`))
        .rejects.toThrow("cannot be detached");
      await expect(db.exec(`DELETE FROM public.lease_unit_assignments
        WHERE id = '${originalId}'`)).rejects.toThrow("cannot be detached");
      const result = await db.query<{ end_date: string }>(
        `SELECT end_date::text AS end_date FROM public.lease_unit_assignments WHERE id = '${originalId}'`,
      );
      expect(result.rows[0].end_date).toBe("2026-06-30");
    } finally {
      await db.close();
    }
  });

  it("accepts a replacement assignment in the same transaction", async () => {
    const db = await setup();
    try {
      await db.exec(`
        BEGIN;
        UPDATE public.lease_unit_assignments SET end_date = '2026-02-28'
          WHERE id = '${originalId}';
        INSERT INTO public.lease_unit_assignments VALUES
          ('${replacementId}', '${portfolioId}', '${leaseId}', '${unitId}',
            '2026-03-01', '2026-06-30');
        COMMIT;
      `);
      const result = await db.query<{ n: number }>(
        "SELECT count(*)::integer AS n FROM public.lease_unit_assignments",
      );
      expect(result.rows[0].n).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("does not block edits because of an unrelated legacy orphan", async () => {
    const db = await setup();
    try {
      await db.exec(`UPDATE public.lease_unit_assignments
        SET end_date = '2026-03-31' WHERE id = '${originalId}'`);
      const result = await db.query<{ end_date: string }>(
        `SELECT end_date::text AS end_date FROM public.lease_unit_assignments WHERE id = '${originalId}'`,
      );
      expect(result.rows[0].end_date).toBe("2026-03-31");
    } finally {
      await db.close();
    }
  });

  it("allows shortening after an unpaid future row is removed in the same transaction", async () => {
    const db = await setup();
    try {
      await db.exec(`INSERT INTO public.receivable_items VALUES
        ('00000000-0000-4000-8000-000000000008', '${portfolioId}', '${leaseId}',
          '${unitId}', 'lease-schedule', 'charges', 'open', '2026-05-01', NULL)`);
      await db.exec(`
        BEGIN;
        DELETE FROM public.receivable_items
          WHERE id = '00000000-0000-4000-8000-000000000008';
        UPDATE public.lease_unit_assignments SET end_date = '2026-03-31'
          WHERE id = '${originalId}';
        COMMIT;
      `);
      const result = await db.query<{ end_date: string }>(
        `SELECT end_date::text AS end_date FROM public.lease_unit_assignments WHERE id = '${originalId}'`,
      );
      expect(result.rows[0].end_date).toBe("2026-03-31");
    } finally {
      await db.close();
    }
  });
});
