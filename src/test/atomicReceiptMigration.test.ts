// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolio = "00000000-0000-4000-8000-000000000001";
const lease = "00000000-0000-4000-8000-000000000002";
const tenant = "00000000-0000-4000-8000-000000000003";
const property = "00000000-0000-4000-8000-000000000004";
const receivable = "00000000-0000-4000-8000-000000000005";
const receipt = "00000000-0000-4000-8000-000000000006";
const allocation = "00000000-0000-4000-8000-000000000007";

const receiptPayload = (id: string, amount: number, unmatched: number) => ({
  id, portfolio_id: portfolio, tenant_id: tenant, lease_id: lease, property_id: property,
  unit_id: null, source_type: "bank-transfer", payment_date: "2026-01-15",
  booking_date: null, value_date: null, amount_received: amount, currency_code: "EUR",
  payer_name: null, payer_iban: null, payer_bic: null, reference: null,
  remittance_information: null, end_to_end_reference: null,
  status: "unmatched", unmatched_amount: unmatched, notes: "",
  import_batch_id: null, raw_bank_transaction_id: null,
});
const allocationPayload = (id: string, receiptId: string, amount: number) => ({
  id, cash_receipt_id: receiptId, receivable_item_id: receivable,
  allocated_amount: amount, allocation_type: "manual", allocation_date: "2026-01-15", notes: "",
});

describe("atomic receipt allocation migration", () => {
  it("locks balances, rejects stale or cross-currency writes, and rolls back child failure", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
        CREATE SCHEMA auth;
        CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT '00000000-0000-4000-8000-000000000099'::uuid $$;
        CREATE FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
          RETURNS boolean LANGUAGE sql STABLE
          AS $$ SELECT current_setting('test.can_write', true) = 'yes' $$;
        CREATE TABLE public.receivable_items (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid, tenant_id uuid,
          property_id uuid, currency_code text NOT NULL, expected_amount numeric(14,2) NOT NULL,
          allocated_amount numeric(14,2) NOT NULL, outstanding_amount numeric(14,2) NOT NULL,
          status text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.cash_receipts (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, tenant_id uuid, lease_id uuid,
          property_id uuid, unit_id uuid, source_type text NOT NULL, payment_date date NOT NULL,
          booking_date date, value_date date, amount_received numeric(14,2) NOT NULL,
          currency_code text NOT NULL, payer_name text, payer_iban text, payer_bic text,
          reference text, remittance_information text, end_to_end_reference text,
          status text NOT NULL, unmatched_amount numeric(14,2) NOT NULL, notes text NOT NULL,
          import_batch_id text, raw_bank_transaction_id text, legacy_id text,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.receipt_allocations (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          cash_receipt_id uuid NOT NULL REFERENCES public.cash_receipts(id),
          receivable_item_id uuid NOT NULL REFERENCES public.receivable_items(id),
          allocated_amount numeric(14,2) NOT NULL CHECK (allocated_amount <= 100),
          allocation_type text NOT NULL, allocation_date date NOT NULL, notes text NOT NULL,
          legacy_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE FUNCTION public.touch_payment_updated_at() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
        CREATE TRIGGER receipt_touch BEFORE UPDATE ON public.cash_receipts
          FOR EACH ROW EXECUTE FUNCTION public.touch_payment_updated_at();
        CREATE TRIGGER receivable_touch BEFORE UPDATE ON public.receivable_items
          FOR EACH ROW EXECUTE FUNCTION public.touch_payment_updated_at();
        INSERT INTO public.receivable_items
          (id, portfolio_id, lease_id, tenant_id, property_id, currency_code,
           expected_amount, allocated_amount, outstanding_amount, status)
        VALUES ('${receivable}', '${portfolio}', '${lease}', '${tenant}', '${property}',
                'EUR', 300, 0, 300, 'open');
      `);
      const migration = await readFile(new URL("../../supabase/migrations/20261017210000_atomic_receipt_allocations.sql", import.meta.url), "utf8");
      await db.exec(migration);
      const call = async (r: object, items: object[], rows: object[], expected?: string) => db.query<{ result: {
        receipt: { unmatched_amount: number; updated_at: string };
        receivables: Array<{ allocated_amount: number; updated_at: string }>;
        allocations: object[];
      } }>(
        "SELECT public.save_receipt_allocations($1::jsonb, $2::jsonb, $3::jsonb, $4::timestamptz) AS result",
        [JSON.stringify(r), JSON.stringify(items), JSON.stringify(rows), expected ?? null],
      );
      const original = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.receivable_items WHERE id = $1", [receivable],
      )).rows[0];
      const update = (amount: number, expectedUpdatedAt = original.updated_at) => ({
        id: receivable, allocated_amount: amount, outstanding_amount: 300 - amount,
        status: amount === 300 ? "paid" : "partially-paid", expected_updated_at: expectedUpdatedAt,
      });

      const created = (await call(
        receiptPayload(receipt, 120, 20), [update(100)], [allocationPayload(allocation, receipt, 100)],
      )).rows[0].result;
      expect(Number(created.receipt.unmatched_amount)).toBe(20);
      expect(Number(created.receivables[0].allocated_amount)).toBe(100);
      expect(created.allocations).toHaveLength(1);

      await expect(call(
        receiptPayload(receipt, 120, 0), [update(120, created.receivables[0].updated_at)],
        [allocationPayload("00000000-0000-4000-8000-000000000008", receipt, 20)],
        "2020-01-01T00:00:00Z",
      )).rejects.toThrow("Receipt changed since it was opened");

      await expect(call(
        receiptPayload(receipt, 120, 0), [update(120, original.updated_at)],
        [allocationPayload("00000000-0000-4000-8000-000000000008", receipt, 20)],
        created.receipt.updated_at,
      )).rejects.toThrow("Receivable changed since it was opened");

      await expect(call(
        { ...receiptPayload("00000000-0000-4000-8000-000000000012", 20, 0), currency_code: "GBP" },
        [update(120, created.receivables[0].updated_at)],
        [allocationPayload("00000000-0000-4000-8000-000000000013", "00000000-0000-4000-8000-000000000012", 20)],
      )).rejects.toThrow("currency, or scope");

      await expect(call(
        receiptPayload("00000000-0000-4000-8000-000000000020", 20, 0),
        [{ ...update(120, created.receivables[0].updated_at), status: "paid" }],
        [allocationPayload("00000000-0000-4000-8000-000000000021", "00000000-0000-4000-8000-000000000020", 20)],
      )).rejects.toThrow("currency, or scope");

      await expect(call(
        receiptPayload("00000000-0000-4000-8000-000000000014", 40, 0),
        [update(140, created.receivables[0].updated_at)],
        [
          allocationPayload("00000000-0000-4000-8000-000000000015", "00000000-0000-4000-8000-000000000014", 20),
          allocationPayload("00000000-0000-4000-8000-000000000015", "00000000-0000-4000-8000-000000000014", 20),
        ],
      )).rejects.toThrow("ids must be unique");

      const failedReceipt = "00000000-0000-4000-8000-000000000009";
      await expect(call(
        receiptPayload(failedReceipt, 101, 0), [update(201, created.receivables[0].updated_at)],
        [allocationPayload("00000000-0000-4000-8000-000000000010", failedReceipt, 101)],
      )).rejects.toThrow();
      expect((await db.query("SELECT count(*)::int AS n FROM public.cash_receipts")).rows[0]).toEqual({ n: 1 });
      expect((await db.query("SELECT allocated_amount::text AS amount FROM public.receivable_items")).rows[0]).toEqual({ amount: "100.00" });

      const changed = (await call(
        receiptPayload(receipt, 120, 0), [update(120, created.receivables[0].updated_at)],
        [allocationPayload("00000000-0000-4000-8000-000000000011", receipt, 20)],
        created.receipt.updated_at,
      )).rows[0].result;
      expect(Number(changed.receipt.unmatched_amount)).toBe(0);
      expect(Number(changed.receivables[0].allocated_amount)).toBe(120);
      expect((await db.query("SELECT count(*)::int AS n FROM public.receipt_allocations")).rows[0]).toEqual({ n: 2 });

      await db.exec(`
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_receipts, public.receivable_items, public.receipt_allocations TO authenticated;
        ALTER TABLE public.cash_receipts ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.receivable_items ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.receipt_allocations ENABLE ROW LEVEL SECURITY;
        CREATE POLICY receipt_read ON public.cash_receipts FOR SELECT TO authenticated USING (true);
        CREATE POLICY item_read ON public.receivable_items FOR SELECT TO authenticated USING (true);
        CREATE POLICY allocation_read ON public.receipt_allocations FOR SELECT TO authenticated USING (true);
        CREATE POLICY receipt_insert ON public.cash_receipts FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY receipt_update ON public.cash_receipts FOR UPDATE TO authenticated
          USING (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY item_update ON public.receivable_items FOR UPDATE TO authenticated
          USING (current_setting('test.can_write', true) = 'yes');
        CREATE POLICY allocation_insert ON public.receipt_allocations FOR INSERT TO authenticated
          WITH CHECK (current_setting('test.can_write', true) = 'yes');
        SET ROLE authenticated;
      `);
      const nextReceipt = "00000000-0000-4000-8000-000000000016";
      const nextAllocation = "00000000-0000-4000-8000-000000000017";
      const nextUpdate = update(140, changed.receivables[0].updated_at);
      await db.query("SELECT set_config('test.can_write', 'no', false)");
      await expect(call(
        receiptPayload(nextReceipt, 20, 0), [nextUpdate],
        [allocationPayload(nextAllocation, nextReceipt, 20)],
      )).rejects.toThrow();
      await db.query("SELECT set_config('test.can_write', 'yes', false)");
      const writerSave = (await call(
        receiptPayload(nextReceipt, 20, 0), [nextUpdate],
        [allocationPayload(nextAllocation, nextReceipt, 20)],
      )).rows[0].result;
      expect(Number(writerSave.receivables[0].allocated_amount)).toBe(140);
      await db.exec("RESET ROLE");
      expect((await db.query("SELECT count(*)::int AS n FROM public.cash_receipts")).rows[0]).toEqual({ n: 2 });

      await db.query("UPDATE public.receivable_items SET status = 'cancelled' WHERE id = $1", [receivable]);
      const cancelled = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.receivable_items WHERE id = $1", [receivable],
      )).rows[0];
      await expect(call(
        receiptPayload("00000000-0000-4000-8000-000000000018", 20, 0),
        [update(160, cancelled.updated_at)],
        [allocationPayload("00000000-0000-4000-8000-000000000019", "00000000-0000-4000-8000-000000000018", 20)],
      )).rejects.toThrow("currency, or scope");
      expect((await db.query("SELECT count(*)::int AS n FROM public.cash_receipts")).rows[0]).toEqual({ n: 2 });

      const standaloneId = "00000000-0000-4000-8000-000000000022";
      const standalone = (await call(receiptPayload(standaloneId, 50, 50), [], [])).rows[0].result;
      expect(Number(standalone.receipt.unmatched_amount)).toBe(50);
      expect(standalone.receivables).toEqual([]);
      expect(standalone.allocations).toEqual([]);
      await expect(call(receiptPayload("00000000-0000-4000-8000-000000000023", 50, 40), [], []))
        .rejects.toThrow("do not reconcile");
      expect((await db.query("SELECT count(*)::int AS n FROM public.cash_receipts")).rows[0]).toEqual({ n: 3 });

      for (const name of [
        "20261018234000_guard_receipt_amounts.sql",
        "20261018235000_guard_receipt_allocation_balance.sql",
        "20261018235500_guard_receivable_arithmetic.sql",
      ]) {
        await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"));
      }
      await db.query("UPDATE public.receivable_items SET status = 'partially-paid' WHERE id = $1", [receivable]);
      const resumable = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.receivable_items WHERE id = $1", [receivable],
      )).rows[0];
      const guardedReceiptId = "00000000-0000-4000-8000-000000000024";
      const guarded = (await call(
        receiptPayload(guardedReceiptId, 20, 0), [update(160, resumable.updated_at)],
        [allocationPayload("00000000-0000-4000-8000-000000000025", guardedReceiptId, 20)],
      )).rows[0].result;
      expect(Number(guarded.receipt.unmatched_amount)).toBe(0);
      expect(Number(guarded.receivables[0].allocated_amount)).toBe(160);

      await db.exec(await readFile(new URL("../../supabase/migrations/20261107030000_restrict_direct_receivable_updates.sql", import.meta.url), "utf8"));

      const privileges = (await db.query(`SELECT
        has_function_privilege('authenticated',
          'public.save_receipt_allocations(jsonb,jsonb,jsonb,timestamptz)', 'EXECUTE') AS old_rpc,
        has_function_privilege('authenticated',
          'public.client_save_receipt_allocations(jsonb,jsonb,jsonb,timestamptz)', 'EXECUTE') AS client_rpc,
        has_function_privilege('anon',
          'public.client_save_receipt_allocations(jsonb,jsonb,jsonb,timestamptz)', 'EXECUTE') AS anon_rpc,
        has_function_privilege('service_role',
          'public.save_receipt_allocations(jsonb,jsonb,jsonb,timestamptz)', 'EXECUTE') AS service_rpc,
        has_table_privilege('authenticated', 'public.cash_receipts', 'INSERT') AS direct_receipt_insert,
        has_table_privilege('authenticated', 'public.cash_receipts', 'UPDATE') AS direct_receipt_update,
        has_table_privilege('authenticated', 'public.cash_receipts', 'DELETE') AS direct_receipt_delete,
        has_table_privilege('authenticated', 'public.receipt_allocations', 'INSERT') AS direct_allocation_insert,
        has_table_privilege('authenticated', 'public.receipt_allocations', 'UPDATE') AS direct_allocation_update,
        has_table_privilege('authenticated', 'public.receipt_allocations', 'DELETE') AS direct_allocation_delete,
        has_table_privilege('authenticated', 'public.receivable_items', 'UPDATE') AS direct_receivable_update
      `)).rows[0];
      expect(privileges).toEqual({
        old_rpc: false, client_rpc: true, anon_rpc: false, service_rpc: true,
        direct_receipt_insert: false, direct_receipt_update: false, direct_receipt_delete: false,
        direct_allocation_insert: false, direct_allocation_update: false, direct_allocation_delete: false,
        direct_receivable_update: false,
      });

      await db.exec("SET ROLE authenticated");
      await db.query("SELECT set_config('test.can_write', 'no', false)");
      await expect(db.query("UPDATE public.receivable_items SET status = 'open' WHERE id = $1", [receivable]))
        .rejects.toThrow("permission denied");
      const clientCall = (id: string) => db.query<{ result: { receipt: { id: string } } }>(
        "SELECT public.client_save_receipt_allocations($1::jsonb, '[]'::jsonb, '[]'::jsonb) AS result",
        [JSON.stringify(receiptPayload(id, 25, 25))],
      );
      const clientId = "00000000-0000-4000-8000-000000000026";
      await expect(clientCall(clientId)).rejects.toThrow("not permitted");
      await db.query("SELECT set_config('test.can_write', 'yes', false)");
      await expect(db.query(
        "SELECT public.save_receipt_allocations($1::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [JSON.stringify(receiptPayload(clientId, 25, 25))],
      )).rejects.toThrow("permission denied");
      await expect(db.query(
        "INSERT INTO public.cash_receipts (id, portfolio_id, payment_date, amount_received, currency_code, status, unmatched_amount, notes) VALUES ($1, $2, '2026-01-15', 25, 'EUR', 'unmatched', 25, '')",
        [clientId, portfolio],
      )).rejects.toThrow("permission denied");
      const clientSaved = (await clientCall(clientId)).rows[0].result;
      expect(clientSaved.receipt.id).toBe(clientId);

      const current = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.receivable_items WHERE id = $1", [receivable],
      )).rows[0];
      const allocatedId = "00000000-0000-4000-8000-000000000027";
      const allocated = (await db.query<{ result: { receipt: { unmatched_amount: number }; allocations: object[] } }>(
        "SELECT public.client_save_receipt_allocations($1::jsonb, $2::jsonb, $3::jsonb) AS result",
        [
          JSON.stringify(receiptPayload(allocatedId, 20, 0)),
          JSON.stringify([update(180, current.updated_at)]),
          JSON.stringify([allocationPayload("00000000-0000-4000-8000-000000000028", allocatedId, 20)]),
        ],
      )).rows[0].result;
      expect(Number(allocated.receipt.unmatched_amount)).toBe(0);
      expect(allocated.allocations).toHaveLength(1);
      await db.exec("RESET ROLE");
    } finally {
      await db.close();
    }
  });
});
