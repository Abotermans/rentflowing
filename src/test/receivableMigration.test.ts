// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-0000-0000-000000000001";
const lease = "00000000-0000-0000-0000-000000000011";
const unit = "00000000-0000-0000-0000-000000000021";

describe("lease-schedule receivable database guard", () => {
  it("rejects duplicate inserts and updates without blocking distinct or manual items", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
      await db.exec(`CREATE TABLE public.receivable_items (
        id uuid PRIMARY KEY,
        portfolio_id uuid NOT NULL,
        lease_id uuid,
        unit_id uuid,
        item_type text NOT NULL,
        origin text NOT NULL,
        period_month text,
        due_date date NOT NULL,
        cycle_index integer,
        cycle_end_date date,
        tenant_id uuid,
        property_id uuid,
        label text,
        currency_code text,
        expected_amount numeric,
        allocated_amount numeric,
        outstanding_amount numeric,
        status text,
        priority integer,
        notes text
      )`);
      const migration = await readFile(new URL("../../supabase/migrations/20261015120000_prevent_duplicate_lease_receivables.sql", import.meta.url), "utf8");
      await db.exec(migration);
      const anchorMigration = await readFile(new URL("../../supabase/migrations/20261107000000_dedupe_lease_billing_slots.sql", import.meta.url), "utf8");
      await db.exec(anchorMigration);
      const retimedMigration = await readFile(new URL("../../supabase/migrations/20261115001000_guard_retimed_receivable_cycles.sql", import.meta.url), "utf8");
      await db.exec(retimedMigration);

      async function insert(id: string, overrides: {
        origin?: string; type?: string; period?: string; unitId?: string | null;
        dueDate?: string; cycleEndDate?: string | null; currencyCode?: string;
      } = {}) {
        return db.query(`INSERT INTO public.receivable_items
          (id, portfolio_id, lease_id, unit_id, item_type, origin, period_month, due_date, cycle_end_date, currency_code)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
          `00000000-0000-0000-0000-${id.padStart(12, "0")}`,
          portfolio, lease, overrides.unitId === undefined ? unit : overrides.unitId,
          overrides.type ?? "rent", overrides.origin ?? "lease-schedule", overrides.period ?? "2026-10",
          overrides.dueDate ?? "2026-10-01", overrides.cycleEndDate === undefined ? "2026-10-31" : overrides.cycleEndDate,
          overrides.currencyCode ?? "EUR",
        ]);
      }

      await insert("1");
      await expect(insert("2")).rejects.toThrow("Duplicate lease-schedule receivable");
      await expect(insert("7", { unitId: "00000000-0000-0000-0000-000000000022" }))
        .rejects.toThrow("Duplicate lease-schedule receivable");
      await expect(insert("12", {
        unitId: "00000000-0000-0000-0000-000000000022", currencyCode: "GBP",
      })).rejects.toThrow("Duplicate lease-schedule receivable");
      await expect(insert("8", { dueDate: "2026-10-20" }))
        .rejects.toThrow("Duplicate lease-schedule receivable");
      await insert("3", { origin: "manual" });
      await insert("4", { type: "charges" });
      await insert("5", { period: "2026-11" });
      await insert("9", { dueDate: "2026-10-15", cycleEndDate: "2026-10-14" });
      await insert("10", { period: "2026-12", dueDate: "2026-12-01", cycleEndDate: null });
      await expect(insert("11", { period: "2026-12", dueDate: "2026-12-20", cycleEndDate: "2026-12-31" }))
        .rejects.toThrow("Duplicate lease-schedule receivable");
      await expect(insert("6", { unitId: null })).rejects.toThrow("Duplicate lease-schedule receivable");
      await expect(db.query(`UPDATE public.receivable_items SET origin = 'lease-schedule'
        WHERE id = '00000000-0000-0000-0000-000000000003'`))
        .rejects.toThrow("Duplicate lease-schedule receivable");
      const count = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM public.receivable_items");
      expect(count.rows[0].count).toBe(6);
    } finally {
      await db.close();
    }
  });

  it("skips an already-billed cycle on a new due day in the scheduled writer", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
      await db.exec(`CREATE TABLE public.receivable_items (
        id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid, unit_id uuid,
        tenant_id uuid, property_id uuid, item_type text NOT NULL, origin text NOT NULL,
        period_month text, due_date date NOT NULL, cycle_index integer, cycle_end_date date,
        label text, currency_code text, expected_amount numeric, allocated_amount numeric,
        outstanding_amount numeric, status text, priority integer, notes text
      )`);
      const migration = await readFile(new URL("../../supabase/migrations/20261015120000_prevent_duplicate_lease_receivables.sql", import.meta.url), "utf8");
      await db.exec(migration);
      const anchor = await readFile(new URL("../../supabase/migrations/20261107000000_dedupe_lease_billing_slots.sql", import.meta.url), "utf8");
      await db.exec(anchor);
      const retimed = await readFile(new URL("../../supabase/migrations/20261115001000_guard_retimed_receivable_cycles.sql", import.meta.url), "utf8");
      await db.exec(retimed);
      await db.exec(`INSERT INTO public.receivable_items
        (id, portfolio_id, lease_id, unit_id, item_type, origin, period_month, due_date, cycle_end_date)
        VALUES ('00000000-0000-0000-0000-000000000001', '${portfolio}', '${lease}', '${unit}',
          'rent', 'lease-schedule', '2026-10', '2026-10-01', '2026-10-31')`);

      const row = {
        id: "00000000-0000-0000-0000-000000000002", portfolio_id: portfolio,
        lease_id: lease, unit_id: unit, tenant_id: "00000000-0000-0000-0000-000000000031",
        property_id: "00000000-0000-0000-0000-000000000041", item_type: "rent",
        origin: "lease-schedule", period_month: "2026-10", due_date: "2026-10-20",
        cycle_end_date: "2026-10-31", label: "Monthly Rent", currency_code: "EUR",
        expected_amount: 1000, allocated_amount: 0, outstanding_amount: 1000,
        status: "open", priority: 10, notes: "", cycle_index: 10,
      };
      const skipped = await db.query<{ inserted: number }>(
        "SELECT public.insert_due_lease_receivables($1::uuid, $2::jsonb) AS inserted",
        [portfolio, JSON.stringify([row])],
      );
      expect(skipped.rows[0].inserted).toBe(0);
      const differentSegment = await db.query<{ inserted: number }>(
        "SELECT public.insert_due_lease_receivables($1::uuid, $2::jsonb) AS inserted",
        [portfolio, JSON.stringify([{ ...row, cycle_end_date: "2026-10-14" }])],
      );
      expect(differentSegment.rows[0].inserted).toBe(1);
    } finally {
      await db.close();
    }
  });
});
