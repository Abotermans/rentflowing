-- Manual, irreversible Demo cleanup. Do not run without explicit write approval.
-- Requires a privileged SQL session; never include this in migrations.
-- Re-run scripts/preflight-demo-test-leases.sql immediately beforehand.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE expected_test_leases ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('dfcc2668-1b94-4493-8d9e-41ea74bb05a3'::uuid, 'HUB', 'active',
   '2026-06-25 19:06:54.997416+00'::timestamptz),
  ('6ad937b7-7ba9-4b28-920b-a8826f15a668'::uuid, 'REZ', 'signed',
   '2026-06-25 18:31:52.306601+00'::timestamptz),
  ('ae014aa1-50c0-4ece-aee4-86faa617d9b3'::uuid, 'REZ2', 'signed',
   '2026-06-25 18:36:19.018415+00'::timestamptz)
) AS rows(id, lease_reference, lifecycle_stage, updated_at);

DO $$
DECLARE
  v_count integer;
BEGIN
  -- FK inserts into any dependent table must wait for these row locks.
  PERFORM 1 FROM public.leases l
  WHERE l.id IN (SELECT id FROM expected_test_leases)
  ORDER BY l.id FOR UPDATE;

  SELECT count(*) INTO v_count
  FROM expected_test_leases e
  JOIN public.leases l ON l.id = e.id
  WHERE l.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
    AND l.lease_reference = e.lease_reference
    AND l.lifecycle_stage = e.lifecycle_stage
    AND l.updated_at = e.updated_at;
  IF v_count <> 3 OR EXISTS (
    SELECT 1
    FROM pg_constraint fk
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN pg_namespace schema ON schema.oid = child.relnamespace
    WHERE fk.contype = 'f' AND fk.confrelid = 'public.leases'::regclass
      AND (schema.nspname <> 'public' OR child.relname NOT IN (
        'lease_unit_assignments', 'receivable_items', 'cash_receipts',
        'guarantees', 'lease_amendments', 'lease_documents',
        'charges_reconciliations', 'lease_status_changes'
      ))
  ) OR EXISTS (
    SELECT 1 FROM public.leases l
    WHERE l.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
      AND l.lease_reference IN (SELECT lease_reference FROM expected_test_leases)
      AND l.id NOT IN (SELECT id FROM expected_test_leases)
  ) OR EXISTS (
    SELECT 1 FROM public.lease_unit_assignments x
    WHERE x.lease_id IN (SELECT id FROM expected_test_leases)
  ) OR EXISTS (
    SELECT 1 FROM public.receivable_items x
    WHERE x.lease_id IN (SELECT id FROM expected_test_leases)
  ) OR EXISTS (
    SELECT 1 FROM public.cash_receipts x
    WHERE x.lease_id IN (SELECT id FROM expected_test_leases)
  ) OR EXISTS (
    SELECT 1 FROM public.guarantees x
    WHERE x.lease_id IN (SELECT id FROM expected_test_leases)
  ) OR EXISTS (
    SELECT 1 FROM public.lease_amendments x
    WHERE x.lease_id IN (SELECT id FROM expected_test_leases)
  ) OR EXISTS (
    SELECT 1 FROM public.lease_documents x
    WHERE x.lease_id IN (SELECT id FROM expected_test_leases)
  ) OR EXISTS (
    SELECT 1 FROM public.charges_reconciliations x
    WHERE x.lease_id IN (SELECT id FROM expected_test_leases)
  ) OR EXISTS (
    SELECT 1 FROM public.lease_status_changes x
    WHERE x.lease_id IN (SELECT id FROM expected_test_leases)
  ) THEN
    RAISE EXCEPTION 'Demo test-lease preflight changed; no leases were deleted';
  END IF;

  DELETE FROM public.leases l
  USING expected_test_leases e
  WHERE l.id = e.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Demo test-lease cleanup did not delete exactly three leases';
  END IF;
END;
$$;

COMMIT;
