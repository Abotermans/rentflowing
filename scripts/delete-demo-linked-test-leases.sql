-- Manual Demo cleanup of three owner-confirmed test leases and their linked data.
-- Do not run without separate approval for all 184 affected rows.
-- Keeps before-images in the private repair_audit schema, without exporting data.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS repair_audit;
REVOKE ALL ON SCHEMA repair_audit FROM PUBLIC;
CREATE TABLE repair_audit.demo_linked_test_leases_20261115 (
  entity text NOT NULL,
  row_id uuid NOT NULL,
  before_row jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, row_id)
);
REVOKE ALL ON TABLE repair_audit.demo_linked_test_leases_20261115 FROM PUBLIC;

CREATE TEMP TABLE target_demo_leases (id uuid PRIMARY KEY, reference text NOT NULL) ON COMMIT DROP;
INSERT INTO target_demo_leases VALUES
  ('d3e2d7f8-f03c-4748-afaa-7f6749308474', 'BAIL-AMS-001'),
  ('62dff3c9-9e32-4697-a177-e4f5f46ca168', 'BAIL-BRU-001'),
  ('897b15d1-251a-4ba2-ba38-702687375537', 'BAIL-PAR-001');

DO $$
DECLARE
  v_count integer;
BEGIN
  LOCK TABLE public.leases, public.lease_unit_assignments,
    public.receivable_items, public.cash_receipts, public.receipt_allocations,
    public.guarantees, public.lease_amendments, public.lease_amendment_changes,
    public.lease_status_changes, public.lease_documents,
    public.charges_reconciliations IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM public.leases l JOIN target_demo_leases t ON t.id = l.id
      WHERE l.lease_reference = t.reference
        AND l.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
        AND l.lifecycle_stage = 'ended') <> 3
    OR (SELECT count(*) FROM public.lease_unit_assignments
      WHERE lease_id IN (SELECT id FROM target_demo_leases)) <> 3
    OR (SELECT count(*) FROM public.receivable_items
      WHERE lease_id IN (SELECT id FROM target_demo_leases)) <> 134
    OR (SELECT count(*) FROM public.cash_receipts
      WHERE lease_id IN (SELECT id FROM target_demo_leases)) <> 10
    OR (SELECT count(*) FROM public.receipt_allocations a
      JOIN public.receivable_items r ON r.id = a.receivable_item_id
      WHERE r.lease_id IN (SELECT id FROM target_demo_leases)) <> 18
    OR (SELECT count(*) FROM public.guarantees
      WHERE lease_id IN (SELECT id FROM target_demo_leases)) <> 3
    OR (SELECT count(*) FROM public.lease_amendments
      WHERE lease_id IN (SELECT id FROM target_demo_leases)) <> 4
    OR (SELECT count(*) FROM public.lease_amendment_changes
      WHERE amendment_id IN (SELECT id FROM public.lease_amendments
        WHERE lease_id IN (SELECT id FROM target_demo_leases))) <> 6
    OR (SELECT count(*) FROM public.lease_status_changes
      WHERE lease_id IN (SELECT id FROM target_demo_leases)) <> 3
    OR EXISTS (SELECT 1 FROM public.lease_documents
      WHERE lease_id IN (SELECT id FROM target_demo_leases))
    OR EXISTS (SELECT 1 FROM public.charges_reconciliations
      WHERE lease_id IN (SELECT id FROM target_demo_leases)
        OR receivable_item_id IN (SELECT id FROM public.receivable_items
          WHERE lease_id IN (SELECT id FROM target_demo_leases)))
    OR EXISTS (SELECT 1 FROM public.lease_amendments
      WHERE supersedes_amendment_id IN (SELECT id FROM public.lease_amendments
        WHERE lease_id IN (SELECT id FROM target_demo_leases))
        AND lease_id NOT IN (SELECT id FROM target_demo_leases))
    OR EXISTS (SELECT 1 FROM public.cash_receipts
      WHERE lease_id IN (SELECT id FROM target_demo_leases)
        AND (import_batch_id IS NOT NULL OR raw_bank_transaction_id IS NOT NULL))
    OR EXISTS (SELECT 1 FROM public.receipt_allocations a
      JOIN public.cash_receipts cr ON cr.id = a.cash_receipt_id
      JOIN public.receivable_items r ON r.id = a.receivable_item_id
      WHERE (cr.lease_id IN (SELECT id FROM target_demo_leases))
        IS DISTINCT FROM (r.lease_id IN (SELECT id FROM target_demo_leases)))
  THEN
    RAISE EXCEPTION 'Demo test lease data changed; cleanup aborted';
  END IF;

  INSERT INTO repair_audit.demo_linked_test_leases_20261115 (entity, row_id, before_row)
  SELECT 'lease', id, to_jsonb(l) FROM public.leases l
    WHERE id IN (SELECT id FROM target_demo_leases)
  UNION ALL SELECT 'assignment', id, to_jsonb(a) FROM public.lease_unit_assignments a
    WHERE lease_id IN (SELECT id FROM target_demo_leases)
  UNION ALL SELECT 'receivable', id, to_jsonb(r) FROM public.receivable_items r
    WHERE lease_id IN (SELECT id FROM target_demo_leases)
  UNION ALL SELECT 'receipt', id, to_jsonb(cr) FROM public.cash_receipts cr
    WHERE lease_id IN (SELECT id FROM target_demo_leases)
  UNION ALL SELECT 'allocation', a.id, to_jsonb(a) FROM public.receipt_allocations a
    JOIN public.receivable_items r ON r.id = a.receivable_item_id
    WHERE r.lease_id IN (SELECT id FROM target_demo_leases)
  UNION ALL SELECT 'guarantee', id, to_jsonb(g) FROM public.guarantees g
    WHERE lease_id IN (SELECT id FROM target_demo_leases)
  UNION ALL SELECT 'amendment', id, to_jsonb(a) FROM public.lease_amendments a
    WHERE lease_id IN (SELECT id FROM target_demo_leases)
  UNION ALL SELECT 'amendment_change', c.id, to_jsonb(c) FROM public.lease_amendment_changes c
    JOIN public.lease_amendments a ON a.id = c.amendment_id
    WHERE a.lease_id IN (SELECT id FROM target_demo_leases)
  UNION ALL SELECT 'status_change', id, to_jsonb(s) FROM public.lease_status_changes s
    WHERE lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 184 THEN RAISE EXCEPTION 'Expected 184 before-images; cleanup aborted'; END IF;

  DELETE FROM public.receipt_allocations a
  USING public.receivable_items r
  WHERE a.receivable_item_id = r.id AND r.lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 18 THEN RAISE EXCEPTION 'Expected 18 allocations'; END IF;

  DELETE FROM public.lease_amendment_changes c
  USING public.lease_amendments a
  WHERE c.amendment_id = a.id AND a.lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 6 THEN RAISE EXCEPTION 'Expected six amendment changes'; END IF;

  DELETE FROM public.receivable_items WHERE lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 134 THEN RAISE EXCEPTION 'Expected 134 receivables'; END IF;

  DELETE FROM public.cash_receipts WHERE lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 10 THEN RAISE EXCEPTION 'Expected ten receipts'; END IF;

  DELETE FROM public.guarantees WHERE lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Expected three guarantees'; END IF;

  DELETE FROM public.lease_amendments WHERE lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 4 THEN RAISE EXCEPTION 'Expected four amendments'; END IF;

  DELETE FROM public.lease_status_changes WHERE lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Expected three status changes'; END IF;

  DELETE FROM public.lease_unit_assignments WHERE lease_id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Expected three assignments'; END IF;

  DELETE FROM public.leases WHERE id IN (SELECT id FROM target_demo_leases);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Expected three leases'; END IF;

  IF (SELECT count(*) FROM repair_audit.demo_linked_test_leases_20261115) <> 184
    OR EXISTS (SELECT 1 FROM public.receivable_items r
      JOIN repair_audit.demo_linked_test_leases_20261115 audit
        ON audit.entity = 'receivable' AND audit.row_id = r.id)
    OR EXISTS (SELECT 1 FROM public.cash_receipts cr
      JOIN repair_audit.demo_linked_test_leases_20261115 audit
        ON audit.entity = 'receipt' AND audit.row_id = cr.id)
  THEN
    RAISE EXCEPTION 'Demo test lease cleanup postcondition failed; rolled back';
  END IF;
END;
$$;

COMMIT;
