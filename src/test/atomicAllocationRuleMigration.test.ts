// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-4000-8000-000000000001";
const property = "00000000-0000-4000-8000-000000000002";
const otherProperty = "00000000-0000-4000-8000-000000000003";
const unitA = "00000000-0000-4000-8000-000000000004";
const unitB = "00000000-0000-4000-8000-000000000005";
const otherUnit = "00000000-0000-4000-8000-000000000006";
const ruleId = "00000000-0000-4000-8000-000000000007";
const shareId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rule = (method: string, name = "Manual") => ({
  id: ruleId, portfolio_id: portfolio, property_id: property, name, method,
  apply_only_to_occupied_units: false, include_unavailable_units: false,
  share_key: null, millieme_allocation_mode: "normalized", notes: "",
});
const share = (id: string, unitId: string, percentage: number) => ({
  id, allocation_rule_id: ruleId, unit_id: unitId,
  percentage_share: percentage, fixed_amount_share: null, coefficient: null,
});

describe("atomic allocation rule migration", () => {
  it("saves a rule with its shares and rolls back rejected replacements", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE TABLE public.units (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL);
        CREATE TABLE public.allocation_rules (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, property_id uuid NOT NULL,
          name text NOT NULL, method text NOT NULL,
          apply_only_to_occupied_units boolean NOT NULL,
          include_unavailable_units boolean NOT NULL,
          share_key text, millieme_allocation_mode text NOT NULL,
          notes text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.allocation_rule_unit_shares (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          allocation_rule_id uuid NOT NULL REFERENCES public.allocation_rules(id),
          unit_id uuid NOT NULL REFERENCES public.units(id),
          percentage_share numeric(8,4) CHECK (percentage_share <= 70),
          fixed_amount_share numeric(14,2), coefficient numeric(10,4),
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.cost_entries (
          id uuid PRIMARY KEY, allocation_rule_id uuid REFERENCES public.allocation_rules(id)
        );
        CREATE FUNCTION public.touch_test_rule() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
        CREATE TRIGGER rule_touch BEFORE UPDATE ON public.allocation_rules
          FOR EACH ROW EXECUTE FUNCTION public.touch_test_rule();
        INSERT INTO public.units VALUES
          ('${unitA}', '${portfolio}', '${property}'),
          ('${unitB}', '${portfolio}', '${property}'),
          ('${otherUnit}', '${portfolio}', '${otherProperty}');
      `);
      const migration = await readFile(
        new URL("../../supabase/migrations/20261017230000_atomic_allocation_rule_shares.sql", import.meta.url), "utf8",
      );
      await db.exec(migration);
      const call = async (r: object, rows: object[], expected?: string) => db.query<{ result: {
        rule: { name: string; method: string; updated_at: string };
        shares: Array<{ percentage_share: number }>;
      } }>(
        "SELECT public.save_allocation_rule_with_shares($1::jsonb, $2::jsonb, $3::timestamptz) AS result",
        [JSON.stringify(r), JSON.stringify(rows), expected ?? null],
      );
      const firstShares = [share(shareId(8), unitA, 60), share(shareId(9), unitB, 40)];
      const created = (await call(rule("manual-percentage"), firstShares)).rows[0].result;
      expect(created.shares).toHaveLength(2);
      expect((await db.query("SELECT count(*)::int AS n FROM public.allocation_rule_unit_shares")).rows[0]).toEqual({ n: 2 });

      await expect(call(rule("manual-percentage", "Invalid"), [share(shareId(10), unitA, 70), share(shareId(11), unitB, 20)], created.rule.updated_at))
        .rejects.toThrow("must total 100 percent");
      await expect(call(rule("manual-percentage", "Invalid"), [share(shareId(12), unitA, 80), share(shareId(13), unitB, 20)], created.rule.updated_at))
        .rejects.toThrow("allocation_rule_unit_shares_percentage_share_check");
      await expect(call(rule("manual-percentage", "Invalid"), [share(shareId(14), unitA, 60), share(shareId(15), otherUnit, 40)], created.rule.updated_at))
        .rejects.toThrow("invalid unit");
      expect((await db.query("SELECT name FROM public.allocation_rules")).rows[0]).toEqual({ name: "Manual" });
      expect((await db.query("SELECT count(*)::int AS n FROM public.allocation_rule_unit_shares")).rows[0]).toEqual({ n: 2 });

      await expect(call(rule("equal", "Equal"), [], "2020-01-01T00:00:00Z"))
        .rejects.toThrow("Allocation rule changed since it was opened");
      const updated = (await call(rule("equal", "Equal"), [], created.rule.updated_at)).rows[0].result;
      expect(updated.rule.method).toBe("equal");
      expect(updated.shares).toHaveLength(0);
      expect((await db.query("SELECT count(*)::int AS n FROM public.allocation_rule_unit_shares")).rows[0]).toEqual({ n: 0 });

      await db.exec(`
        GRANT SELECT ON public.units, public.cost_entries TO authenticated;
        GRANT SELECT, INSERT, UPDATE ON public.allocation_rules TO authenticated;
        GRANT SELECT, INSERT, DELETE ON public.allocation_rule_unit_shares TO authenticated;
        ALTER TABLE public.allocation_rules ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.allocation_rule_unit_shares ENABLE ROW LEVEL SECURITY;
        CREATE POLICY rule_read ON public.allocation_rules FOR SELECT TO authenticated USING (true);
        CREATE POLICY shares_read ON public.allocation_rule_unit_shares FOR SELECT TO authenticated USING (true);
        CREATE POLICY rule_insert ON public.allocation_rules FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY rule_update ON public.allocation_rules FOR UPDATE TO authenticated
          USING (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY shares_insert ON public.allocation_rule_unit_shares FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY shares_delete ON public.allocation_rule_unit_shares FOR DELETE TO authenticated
          USING (current_setting('test.can_write', true) = 'yes');
        SET ROLE authenticated;
      `);
      await db.query("SELECT set_config('test.can_write', 'no', false)");
      await expect(call(rule("manual-percentage", "Reopened"), firstShares, updated.rule.updated_at)).rejects.toThrow();
      await db.query("SELECT set_config('test.can_write', 'yes', false)");
      const writer = (await call(rule("manual-percentage", "Reopened"), firstShares, updated.rule.updated_at)).rows[0].result;
      expect(writer.rule.name).toBe("Reopened");
      expect(writer.shares).toHaveLength(2);
      await db.exec("RESET ROLE");
    } finally {
      await db.close();
    }
  });
});
