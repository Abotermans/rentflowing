// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-4000-8000-000000000001";
const lease = "00000000-0000-4000-8000-000000000002";
const property = "00000000-0000-4000-8000-000000000007";
const tenant = "00000000-0000-4000-8000-000000000008";
const reconciliationId = "00000000-0000-4000-8000-000000000003";
const receivableId = "00000000-0000-4000-8000-000000000004";

const reconciliation = (resolution = "owe", delta = -20, withReceivable = true) => ({
  id: reconciliationId, portfolio_id: portfolio, lease_id: lease,
  period_start: "2026-01-01", period_end: "2026-12-31",
  provisions_collected: 100, actual_recoverable: 120, delta, resolution,
  receivable_item_id: withReceivable ? receivableId : null, notes: "",
});
const receivable = (amount = 20) => ({
  id: receivableId, portfolio_id: portfolio, lease_id: lease,
  property_id: property, tenant_id: tenant,
  item_type: "charges-adjustment", origin: "adjustment", status: "open",
  due_date: "2027-01-01", expected_amount: amount,
  allocated_amount: 0, outstanding_amount: amount,
});

describe("atomic charges reconciliation migration", () => {
  it("commits both rows, rejects invalid balances, and rolls back failed child writes and protected deletes", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE TABLE public.leases (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          property_id uuid NOT NULL, billing_tenant_id uuid NOT NULL
        );
        CREATE TABLE public.receivable_items (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL,
          property_id uuid NOT NULL, tenant_id uuid NOT NULL,
          item_type text NOT NULL, origin text NOT NULL, status text NOT NULL,
          due_date date NOT NULL, expected_amount numeric NOT NULL,
          allocated_amount numeric NOT NULL, outstanding_amount numeric NOT NULL,
          created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
        );
        CREATE TABLE public.charges_reconciliations (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL,
          period_start date NOT NULL, period_end date NOT NULL,
          provisions_collected numeric NOT NULL, actual_recoverable numeric NOT NULL,
          delta numeric NOT NULL, resolution text NOT NULL,
          receivable_item_id uuid REFERENCES public.receivable_items(id) ON DELETE SET NULL,
          notes text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
        );
        CREATE TABLE public.receipt_allocations (
          id uuid PRIMARY KEY, receivable_item_id uuid NOT NULL REFERENCES public.receivable_items(id)
        );
        INSERT INTO public.leases VALUES ('${lease}', '${portfolio}', '${property}', '${tenant}');
      `);
      await db.exec(await readFile(new URL("../../supabase/migrations/20261018000000_atomic_charges_reconciliation.sql", import.meta.url), "utf8"));
      const create = (r: object, item: object | null) => db.query<{ result: {
        reconciliation: { updated_at: string }; receivable: { id: string } | null;
      } }>("SELECT public.create_charges_reconciliation($1::jsonb, $2::jsonb) AS result", [JSON.stringify(r), item ? JSON.stringify(item) : null]);
      const remove = (updated: string) => db.query<{ result: { reconciliation_id: string } }>(
        "SELECT public.delete_charges_reconciliation($1::uuid, $2::uuid, $3::timestamptz) AS result",
        [reconciliationId, portfolio, updated],
      );
      await expect(create(reconciliation("refund", -20), receivable(-20)))
        .rejects.toThrow("Resolution does not match");
      await expect(create({ ...reconciliation(), delta: -10 }, receivable(10)))
        .rejects.toThrow("Invalid reconciliation fields");
      await expect(create(reconciliation(), receivable(-20)))
        .rejects.toThrow("Adjustment receivable does not match");
      await expect(create(reconciliation(), { ...receivable(), property_id: lease }))
        .rejects.toThrow("Adjustment receivable does not match");
      await db.exec(`ALTER TABLE public.charges_reconciliations ADD CONSTRAINT force_failure CHECK (notes <> 'reject');`);
      await expect(create({ ...reconciliation(), notes: "reject" }, receivable()))
        .rejects.toThrow("force_failure");
      expect((await db.query("SELECT count(*)::int AS n FROM public.receivable_items")).rows[0]).toEqual({ n: 0 });
      const noAction = (await create({ ...reconciliation("none", -20, false), id: "00000000-0000-4000-8000-000000000006", period_end: "2026-06-30" }, null)).rows[0].result;
      expect(noAction.receivable).toBeNull();
      const created = (await create(reconciliation(), receivable())).rows[0].result;
      expect(created.receivable?.id).toBe(receivableId);
      await expect(create(reconciliation(), receivable())).rejects.toThrow("already been reconciled");
      await expect(remove("2020-01-01T00:00:00Z")).rejects.toThrow("changed since");
      await db.exec(`INSERT INTO public.receipt_allocations VALUES ('00000000-0000-4000-8000-000000000005', '${receivableId}');`);
      await expect(remove(created.reconciliation.updated_at)).rejects.toThrow("reconciliation.deleteAllocated");
      await db.exec("DELETE FROM public.receipt_allocations;");
      await db.exec(`
        GRANT SELECT ON public.leases, public.receipt_allocations TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivable_items, public.charges_reconciliations TO authenticated;
        ALTER TABLE public.receivable_items ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.charges_reconciliations ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ri_read ON public.receivable_items FOR SELECT TO authenticated USING (true);
        CREATE POLICY cr_read ON public.charges_reconciliations FOR SELECT TO authenticated USING (true);
        CREATE POLICY ri_write ON public.receivable_items FOR DELETE TO authenticated USING (current_setting('test.can_delete_receivable', true) = 'yes');
        CREATE POLICY cr_write ON public.charges_reconciliations FOR DELETE TO authenticated USING (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY ri_update ON public.receivable_items FOR UPDATE TO authenticated USING (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY cr_update ON public.charges_reconciliations FOR UPDATE TO authenticated USING (current_setting('test.can_write', true) = 'yes');
        SET ROLE authenticated;
      `);
      await db.query("SELECT set_config('test.can_write', 'no', false)");
      await expect(remove(created.reconciliation.updated_at)).rejects.toThrow();
      await db.query("SELECT set_config('test.can_write', 'yes', false)");
      await db.query("SELECT set_config('test.can_delete_receivable', 'no', false)");
      await expect(remove(created.reconciliation.updated_at)).rejects.toThrow("Adjustment receivable could not be deleted");
      expect((await db.query("SELECT count(*)::int AS n FROM public.charges_reconciliations WHERE id = $1", [reconciliationId])).rows[0]).toEqual({ n: 1 });
      await db.query("SELECT set_config('test.can_delete_receivable', 'yes', false)");
      const deleted = (await remove(created.reconciliation.updated_at)).rows[0].result;
      expect(deleted.reconciliation_id).toBe(reconciliationId);
      await db.exec("RESET ROLE");
      expect((await db.query("SELECT count(*)::int AS n FROM public.receivable_items")).rows[0]).toEqual({ n: 0 });
    } finally {
      await db.close();
    }
  });
});
