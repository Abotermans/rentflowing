// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = new URL(
  "../../supabase/migrations/20261018232000_guard_charges_reconciliation_periods.sql",
  import.meta.url,
);

const portfolio = "00000000-0000-4000-8000-000000000001";
const lease = "00000000-0000-4000-8000-000000000002";
const rowId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

async function makeDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.leases (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL);
    CREATE TABLE public.charges_reconciliations (
      id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL,
      period_start date NOT NULL, period_end date NOT NULL
    );
    INSERT INTO public.leases VALUES ('${lease}', '${portfolio}');
  `);
  return db;
}

async function insertPeriod(db: PGlite, number: number, start: string, end: string) {
  return db.query(
    `INSERT INTO public.charges_reconciliations
      (id, portfolio_id, lease_id, period_start, period_end)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::date)`,
    [rowId(number), portfolio, lease, start, end],
  );
}

describe("charges reconciliation period guard", () => {
  it("blocks overlapping inserts and updates while allowing the following day", async () => {
    const db = await makeDatabase();
    try {
      await insertPeriod(db, 10, "2026-01-01", "2026-01-31");
      await db.exec(await readFile(migration, "utf8"));
      await expect(insertPeriod(db, 11, "2026-01-31", "2026-02-28"))
        .rejects.toThrow("overlaps an existing charges reconciliation");
      await insertPeriod(db, 12, "2026-02-01", "2026-02-28");
      await expect(db.query(
        "UPDATE public.charges_reconciliations SET period_start = '2026-01-31' WHERE id = $1::uuid",
        [rowId(12)],
      )).rejects.toThrow("overlaps an existing charges reconciliation");
      const result = await db.query<{ start: string }>(
        "SELECT period_start::text AS start FROM public.charges_reconciliations WHERE id = $1::uuid",
        [rowId(12)],
      );
      expect(result.rows[0].start).toBe("2026-02-01");
    } finally {
      await db.close();
    }
  });

  it("refuses to install over historical overlapping periods", async () => {
    const db = await makeDatabase();
    try {
      await insertPeriod(db, 10, "2026-01-01", "2026-01-31");
      await insertPeriod(db, 11, "2026-01-31", "2026-02-28");
      await expect(db.exec(await readFile(migration, "utf8")))
        .rejects.toThrow("Existing charges reconciliations overlap");
    } finally {
      await db.close();
    }
  });
});
