// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolioId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const unitId = "00000000-0000-4000-8000-000000000003";
const entryId = "00000000-0000-4000-8000-000000000004";
const allocationId = "00000000-0000-4000-8000-000000000005";

const entry = (amount: number) => ({
  id: entryId, portfolio_id: portfolioId, property_id: propertyId,
  category_id: "00000000-0000-4000-8000-000000000006", unit_id: null,
  allocation_rule_id: "00000000-0000-4000-8000-000000000007", label: "Insurance", description: "",
  frequency: "one-off", start_date: "2026-01-01", end_date: null,
  amount, currency_code: "EUR", is_tax: false, recovery_type: "owner-only",
  recoverable_percentage: null, vendor_name: "", invoice_reference: "",
  status: "active", notes: "",
});
const allocation = (amount: number) => ({
  id: allocationId, cost_entry_id: entryId, property_id: propertyId,
  unit_id: unitId, allocated_amount: amount, recovery_type: "owner-only",
  recoverable_amount: 0, owner_burden_amount: amount,
  period_start: "2026-01-01", period_end: null,
});

describe("atomic cost entry allocation migration", () => {
  it("refuses to install the allocation guard over invalid historical rows", async () => {
    const migration = await readFile(new URL("../../supabase/migrations/20261019000000_guard_cost_allocation_result_scope.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.cost_entries (id uuid PRIMARY KEY, unit_id uuid, allocation_rule_id uuid);
        CREATE TABLE public.cost_allocation_results (id uuid PRIMARY KEY, cost_entry_id uuid REFERENCES public.cost_entries(id));
        INSERT INTO public.cost_entries VALUES ('${entryId}', NULL, NULL);
        INSERT INTO public.cost_allocation_results VALUES ('${allocationId}', '${entryId}');
      `);
      await expect(db.exec(migration)).rejects.toThrow("Existing cost allocation results have no valid property-level allocation rule");
    } finally {
      await db.close();
    }
  });

  it("rejects mixed unit and allocation-rule scope, including before installation", async () => {
    const migration = await readFile(new URL("../../supabase/migrations/20261018235900_exclusive_cost_allocation_scope.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await db.exec("CREATE TABLE public.cost_entries (id integer PRIMARY KEY, unit_id uuid, allocation_rule_id uuid)");
      await db.exec(migration);
      await expect(db.exec(`INSERT INTO public.cost_entries VALUES (1, '${unitId}', '${allocationId}')`))
        .rejects.toThrow("cost_entries_exclusive_allocation_scope");
      await db.exec(`INSERT INTO public.cost_entries VALUES (2, '${unitId}', NULL), (3, NULL, '${allocationId}')`);
    } finally {
      await db.close();
    }

    const legacyDb = new PGlite();
    try {
      await legacyDb.exec("CREATE TABLE public.cost_entries (id integer PRIMARY KEY, unit_id uuid, allocation_rule_id uuid)");
      await legacyDb.exec(`INSERT INTO public.cost_entries VALUES (1, '${unitId}', '${allocationId}')`);
      await expect(legacyDb.exec(migration)).rejects.toThrow("cost_entries_exclusive_allocation_scope");
    } finally {
      await legacyDb.close();
    }
  });

  it("commits entry and allocations together and rejects stale or invalid replacements", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE TABLE public.units (id uuid PRIMARY KEY, property_id uuid NOT NULL, portfolio_id uuid NOT NULL);
        INSERT INTO public.units VALUES ('${unitId}', '${propertyId}', '${portfolioId}');
        CREATE TABLE public.cost_entries (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, category_id uuid NOT NULL,
          property_id uuid NOT NULL, unit_id uuid, allocation_rule_id uuid,
          label text NOT NULL, description text NOT NULL, frequency text NOT NULL,
          start_date date NOT NULL, end_date date, amount numeric(14,2) NOT NULL,
          currency_code text NOT NULL, recognition_mode text NOT NULL DEFAULT 'immediate',
          amortization_start_date date, amortization_end_date date, is_tax boolean NOT NULL,
          recovery_type text NOT NULL, recoverable_percentage numeric(5,2),
          vendor_name text NOT NULL, invoice_reference text NOT NULL, status text NOT NULL,
          notes text NOT NULL, legacy_id text,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.cost_allocation_results (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, cost_entry_id uuid NOT NULL REFERENCES public.cost_entries(id),
          property_id uuid NOT NULL, unit_id uuid NOT NULL,
          allocated_amount numeric(14,2) NOT NULL CHECK (allocated_amount >= 0), recovery_type text NOT NULL,
          recoverable_amount numeric(14,2) NOT NULL, owner_burden_amount numeric(14,2) NOT NULL,
          period_start date, period_end date, legacy_id text,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE FUNCTION public.touch_cost_updated_at() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
        CREATE TRIGGER cost_touch BEFORE UPDATE ON public.cost_entries
        FOR EACH ROW EXECUTE FUNCTION public.touch_cost_updated_at();
      `);
      const migration = await readFile(new URL("../../supabase/migrations/20261017200000_atomic_cost_entry_allocations.sql", import.meta.url), "utf8");
      await db.exec(migration);
      const scopeGuard = await readFile(new URL("../../supabase/migrations/20261019000000_guard_cost_allocation_result_scope.sql", import.meta.url), "utf8");
      await db.exec(scopeGuard);

      const call = async (cost: object, rows: object[], expected?: string) => db.query<{ result: {
        entry: { amount: number; updated_at: string }; allocations: Array<{ allocated_amount: number }>;
      } }>(
        "SELECT public.save_cost_entry_with_allocations($1::jsonb, $2::jsonb, $3::timestamptz) AS result",
        [JSON.stringify(cost), JSON.stringify(rows), expected ?? null],
      );
      await expect(call(entry(50), [{ ...allocation(50), unit_id: "00000000-0000-4000-8000-000000000099" }]))
        .rejects.toThrow("Cost allocations must match");
      expect((await db.query("SELECT count(*)::int AS n FROM public.cost_entries")).rows[0]).toEqual({ n: 0 });

      const created = (await call(entry(50), [allocation(50)])).rows[0].result;
      expect(created.allocations).toHaveLength(1);
      expect((await db.query("SELECT count(*)::int AS n FROM public.cost_allocation_results")).rows[0]).toEqual({ n: 1 });

      await expect(call(entry(75), [allocation(75)], "2020-01-01T00:00:00Z"))
        .rejects.toThrow("Cost entry changed since it was opened");
      await expect(call(entry(75), [{ ...allocation(75), owner_burden_amount: 74 }], created.entry.updated_at))
        .rejects.toThrow("Cost allocations must match");
      expect((await db.query("SELECT amount::text AS amount FROM public.cost_entries")).rows[0]).toEqual({ amount: "50.00" });
      expect((await db.query("SELECT allocated_amount::text AS amount FROM public.cost_allocation_results")).rows[0]).toEqual({ amount: "50.00" });

      await expect(call(entry(75), [allocation(-5)], created.entry.updated_at))
        .rejects.toThrow("cost_allocation_results_allocated_amount_check");
      expect((await db.query("SELECT amount::text AS amount FROM public.cost_entries")).rows[0]).toEqual({ amount: "50.00" });
      expect((await db.query("SELECT allocated_amount::text AS amount FROM public.cost_allocation_results")).rows[0]).toEqual({ amount: "50.00" });

      const updated = (await call(entry(75), [allocation(75)], created.entry.updated_at)).rows[0].result;
      expect(Number(updated.entry.amount)).toBe(75);
      expect(updated.allocations).toHaveLength(1);
      expect((await db.query("SELECT count(*)::int AS n FROM public.cost_allocation_results")).rows[0]).toEqual({ n: 1 });

      await db.exec(`
        GRANT SELECT ON public.units TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_entries, public.cost_allocation_results TO authenticated;
        ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.cost_allocation_results ENABLE ROW LEVEL SECURITY;
        CREATE POLICY cost_read ON public.cost_entries FOR SELECT TO authenticated USING (true);
        CREATE POLICY allocation_read ON public.cost_allocation_results FOR SELECT TO authenticated USING (true);
        CREATE POLICY cost_insert ON public.cost_entries FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY cost_update ON public.cost_entries FOR UPDATE TO authenticated
          USING (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY allocation_insert ON public.cost_allocation_results FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY allocation_delete ON public.cost_allocation_results FOR DELETE TO authenticated
          USING (current_setting('test.can_write', true) = 'yes');
        SET ROLE authenticated;
      `);
      await db.query("SELECT set_config('test.can_write', 'no', false)");
      await expect(call(entry(90), [allocation(90)], updated.entry.updated_at))
        .rejects.toThrow("not found or is not accessible");
      await db.query("SELECT set_config('test.can_write', 'yes', false)");
      const writerSave = (await call(entry(90), [allocation(90)], updated.entry.updated_at)).rows[0].result;
      expect(Number(writerSave.entry.amount)).toBe(90);
      await db.exec("RESET ROLE");
      expect((await db.query("SELECT amount::text AS amount FROM public.cost_entries")).rows[0]).toEqual({ amount: "90.00" });

      await expect(db.exec(`UPDATE public.cost_entries SET allocation_rule_id = NULL WHERE id = '${entryId}'`))
        .rejects.toThrow("Cost allocation results require a property-level cost with an allocation rule");
      await expect(db.exec(`UPDATE public.cost_entries SET unit_id = '${unitId}', allocation_rule_id = NULL WHERE id = '${entryId}'`))
        .rejects.toThrow("Cost allocation results require a property-level cost with an allocation rule");

      await db.exec("BEGIN");
      await db.exec(`UPDATE public.cost_entries SET unit_id = '${unitId}', allocation_rule_id = NULL WHERE id = '${entryId}'`);
      await db.exec(`DELETE FROM public.cost_allocation_results WHERE cost_entry_id = '${entryId}'`);
      await db.exec("COMMIT");
      expect((await db.query("SELECT count(*)::int AS n FROM public.cost_allocation_results")).rows[0]).toEqual({ n: 0 });
      await expect(db.exec(`INSERT INTO public.cost_allocation_results (id, portfolio_id, cost_entry_id, property_id, unit_id, allocated_amount, recovery_type, recoverable_amount, owner_burden_amount) VALUES ('${allocationId}', '${portfolioId}', '${entryId}', '${propertyId}', '${unitId}', 90, 'owner-only', 0, 90)`))
        .rejects.toThrow("Cost allocation results require a property-level cost with an allocation rule");
      await db.exec(`UPDATE public.cost_entries SET unit_id = NULL WHERE id = '${entryId}'`);
      await expect(db.exec(`INSERT INTO public.cost_allocation_results (id, portfolio_id, cost_entry_id, property_id, unit_id, allocated_amount, recovery_type, recoverable_amount, owner_burden_amount) VALUES ('${allocationId}', '${portfolioId}', '${entryId}', '${propertyId}', '${unitId}', 90, 'owner-only', 0, 90)`))
        .rejects.toThrow("Cost allocation results require a property-level cost with an allocation rule");
      await db.exec(`UPDATE public.cost_entries SET unit_id = NULL, allocation_rule_id = '00000000-0000-4000-8000-000000000007' WHERE id = '${entryId}'`);
      await db.exec(`INSERT INTO public.cost_allocation_results (id, portfolio_id, cost_entry_id, property_id, unit_id, allocated_amount, recovery_type, recoverable_amount, owner_burden_amount) VALUES ('${allocationId}', '${portfolioId}', '${entryId}', '${propertyId}', '${unitId}', 90, 'owner-only', 0, 90)`);
    } finally {
      await db.close();
    }
  });
});
