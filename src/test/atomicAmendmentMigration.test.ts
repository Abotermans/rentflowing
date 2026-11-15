// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-4000-8000-000000000001";
const lease = "00000000-0000-4000-8000-000000000002";
const amendmentId = "00000000-0000-4000-8000-000000000003";
const changeId = "00000000-0000-4000-8000-000000000004";
const amendment = (title = "Initial", status = "draft") => ({
  id: amendmentId, portfolio_id: portfolio, lease_id: lease,
  amendment_number: 99, title, reason: "", notes: "",
  effective_date: "2026-06-01", signed_date: null, status,
  supersedes_amendment_id: null,
});
const change = (id = changeId, field = "clauseSummary") => ({
  id, portfolio_id: portfolio, amendment_id: amendmentId,
  field_name: field, change_type: "set", old_value: null,
  new_value: "Updated terms", metadata: null,
});

describe("atomic amendment migration", () => {
  it("numbers and replaces atomically, rejects stale and failed child writes, and enforces RLS", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE TABLE public.leases (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL);
        CREATE TABLE public.lease_amendments (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL REFERENCES public.leases(id),
          amendment_number integer NOT NULL, title text NOT NULL, reason text NOT NULL,
          notes text NOT NULL, effective_date date NOT NULL, signed_date date,
          status text NOT NULL, supersedes_amendment_id uuid,
          created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
        );
        CREATE TABLE public.lease_amendment_changes (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          amendment_id uuid NOT NULL REFERENCES public.lease_amendments(id),
          field_name text NOT NULL CHECK (field_name <> 'reject'),
          change_type text NOT NULL, old_value jsonb, new_value jsonb,
          metadata jsonb, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
        );
        CREATE FUNCTION public.touch_test_amendment() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
        CREATE TRIGGER amendment_touch BEFORE UPDATE ON public.lease_amendments
          FOR EACH ROW EXECUTE FUNCTION public.touch_test_amendment();
        INSERT INTO public.leases VALUES ('${lease}', '${portfolio}');
      `);
      await db.exec(await readFile(new URL("../../supabase/migrations/20261018010000_atomic_amendment_changes.sql", import.meta.url), "utf8"));
      const save = (a: object, rows: object[], expected?: string) => db.query<{ result: {
        amendment: { title: string; amendment_number: number; updated_at: string };
        changes: Array<{ field_name: string }>;
      } }>("SELECT public.save_amendment_with_changes($1::jsonb, $2::jsonb, $3::timestamptz) AS result",
        [JSON.stringify(a), JSON.stringify(rows), expected ?? null]);
      await expect(save(amendment(), [change(changeId, "reject")])).rejects.toThrow("lease_amendment_changes_field_name_check");
      expect((await db.query("SELECT count(*)::int AS n FROM public.lease_amendments")).rows[0]).toEqual({ n: 0 });
      const created = (await save(amendment(), [change()])).rows[0].result;
      expect(created.amendment.amendment_number).toBe(1);
      expect(created.changes).toHaveLength(1);
      await expect(save(amendment("Stale"), [change()], "2020-01-01T00:00:00Z"))
        .rejects.toThrow("changed since it was opened");
      await expect(save(amendment("Rejected"), [change(changeId, "reject")], created.amendment.updated_at))
        .rejects.toThrow("lease_amendment_changes_field_name_check");
      expect((await db.query("SELECT title FROM public.lease_amendments")).rows[0]).toEqual({ title: "Initial" });
      expect((await db.query("SELECT field_name FROM public.lease_amendment_changes")).rows[0]).toEqual({ field_name: "clauseSummary" });
      const updated = (await save(amendment("Revised", "scheduled"), [change("00000000-0000-4000-8000-000000000005", "rentFormula")], created.amendment.updated_at)).rows[0].result;
      expect(updated.amendment.title).toBe("Revised");
      expect(updated.changes).toEqual([expect.objectContaining({ field_name: "rentFormula" })]);
      expect((await db.query("SELECT count(*)::int AS n FROM public.lease_amendment_changes")).rows[0]).toEqual({ n: 1 });
      await db.exec(`
        GRANT SELECT, UPDATE ON public.leases TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_amendments, public.lease_amendment_changes TO authenticated;
        ALTER TABLE public.lease_amendments ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.lease_amendment_changes ENABLE ROW LEVEL SECURITY;
        CREATE POLICY am_read ON public.lease_amendments FOR SELECT TO authenticated USING (true);
        CREATE POLICY ch_read ON public.lease_amendment_changes FOR SELECT TO authenticated USING (true);
        CREATE POLICY am_update ON public.lease_amendments FOR UPDATE TO authenticated USING (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY ch_delete ON public.lease_amendment_changes FOR DELETE TO authenticated USING (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY ch_insert ON public.lease_amendment_changes FOR INSERT TO authenticated WITH CHECK (current_setting('test.can_write', true) = 'yes');
        SET ROLE authenticated;
      `);
      await db.query("SELECT set_config('test.can_write', 'no', false)");
      await expect(save(amendment("Denied"), [change()], updated.amendment.updated_at)).rejects.toThrow();
      await db.query("SELECT set_config('test.can_write', 'yes', false)");
      const writer = (await save(amendment("Allowed"), [change()], updated.amendment.updated_at)).rows[0].result;
      expect(writer.amendment.title).toBe("Allowed");
      await db.exec("RESET ROLE");
    } finally {
      await db.close();
    }
  });
});
