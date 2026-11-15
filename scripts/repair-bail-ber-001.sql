-- Manual, irreversible Demo billing repair. Do not run without separate write approval.
-- Re-run scripts/preflight-bail-ber-001.sql immediately before this transaction.
-- No cash receipts or allocations are changed; all affected rows must still be unpaid.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA repair_audit;
REVOKE ALL ON SCHEMA repair_audit FROM PUBLIC;
CREATE TABLE repair_audit.bail_ber_001_20261115 (
  entity text NOT NULL CHECK (entity IN ('lease', 'receivable')),
  row_id uuid NOT NULL,
  before_row jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, row_id)
);
REVOKE ALL ON TABLE repair_audit.bail_ber_001_20261115 FROM PUBLIC;

CREATE TEMP TABLE expected_ber_slots ON COMMIT DROP AS
SELECT due_date::date, item_type,
  CASE WHEN due_date < '2026-08-01'::date THEN 2 ELSE 1 END AS expected_rows
FROM generate_series('2025-04-01'::date, '2026-11-01'::date, interval '1 month') AS due_date
CROSS JOIN (VALUES ('rent'), ('charges')) AS types(item_type);

DO $$
DECLARE
  v_count integer;
  v_lease_id constant uuid := '52694c9c-1ec2-4581-b289-5bfcd618326f';
  v_main_unit constant uuid := '7effa754-d886-46a9-a601-df68fe7b65bc';
  v_storage_unit constant uuid := 'fa7daf21-cb8b-48a6-9c6a-132eefcf4b08';
  v_portfolio_id constant uuid := 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7';
BEGIN
  LOCK TABLE public.leases, public.lease_unit_assignments, public.receivable_items,
    public.receipt_allocations, public.cash_receipts,
    public.charges_reconciliations, public.lease_amendments
    IN SHARE ROW EXCLUSIVE MODE;

  PERFORM 1 FROM public.leases WHERE id = v_lease_id FOR UPDATE;
  PERFORM 1 FROM public.receivable_items WHERE lease_id = v_lease_id ORDER BY id FOR UPDATE;

  IF (SELECT count(*) FROM public.leases
      WHERE id = v_lease_id AND portfolio_id = v_portfolio_id
        AND lease_reference = 'BAIL-BER-001' AND lifecycle_stage = 'active'
        AND property_id = '222d1577-6e88-4606-8b32-97ff5794a222'::uuid
        AND billing_tenant_id = '4c4ca095-b6c4-4bc8-af5f-f895c56b9c4b'::uuid
        AND start_date = '2025-04-01' AND end_date = '2028-03-31'
        AND due_day_of_month = 1 AND rent_formula = 1
        AND monthly_rent = 910 AND monthly_charges = 250) <> 1
    OR (SELECT count(*) FROM public.lease_unit_assignments WHERE lease_id = v_lease_id) <> 2
    OR (SELECT count(*) FROM public.lease_unit_assignments
        WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id
          AND start_date = '2025-04-01' AND end_date = '2028-03-31'
          AND ((unit_id = v_main_unit AND rent_share = 850 AND charges_share = 190)
            OR (unit_id = v_storage_unit AND rent_share = 60 AND charges_share = 0))) <> 2
    OR (SELECT count(*) FROM public.receivable_items WHERE lease_id = v_lease_id) <> 72
    OR EXISTS (SELECT 1 FROM public.receivable_items r
      WHERE r.lease_id = v_lease_id
        AND (r.portfolio_id IS DISTINCT FROM v_portfolio_id
          OR r.property_id IS DISTINCT FROM '222d1577-6e88-4606-8b32-97ff5794a222'::uuid
          OR r.tenant_id IS DISTINCT FROM '4c4ca095-b6c4-4bc8-af5f-f895c56b9c4b'::uuid
          OR r.origin IS DISTINCT FROM 'lease-schedule'
          OR r.currency_code IS DISTINCT FROM 'EUR'
          OR r.status NOT IN ('open', 'overdue') OR r.allocated_amount IS DISTINCT FROM 0
          OR r.outstanding_amount IS DISTINCT FROM r.expected_amount
          OR r.expected_amount IS DISTINCT FROM CASE r.item_type
            WHEN 'rent' THEN 910::numeric WHEN 'charges' THEN 250::numeric END
          OR r.period_month IS DISTINCT FROM to_char(r.due_date, 'YYYY-MM')
          OR r.cycle_index IS DISTINCT FROM
            ((extract(year FROM age(r.due_date, '2025-04-01'::date))::integer * 12)
              + extract(month FROM age(r.due_date, '2025-04-01'::date))::integer + 1)
          OR r.cycle_end_date IS DISTINCT FROM
            (date_trunc('month', r.due_date) + interval '1 month - 1 day')::date
          OR r.label IS DISTINCT FROM CASE r.item_type
            WHEN 'rent' THEN 'Monthly Rent' WHEN 'charges' THEN 'Monthly Charges' END
          OR r.notes IS DISTINCT FROM ''
          OR r.priority IS DISTINCT FROM CASE r.item_type
            WHEN 'rent' THEN 10 WHEN 'charges' THEN 20 END))
    OR EXISTS (SELECT 1 FROM public.receipt_allocations a
      JOIN public.receivable_items r ON r.id = a.receivable_item_id
      WHERE r.lease_id = v_lease_id)
    OR EXISTS (SELECT 1 FROM public.cash_receipts WHERE lease_id = v_lease_id)
    OR EXISTS (SELECT 1 FROM public.charges_reconciliations
      WHERE lease_id = v_lease_id OR receivable_item_id IN
        (SELECT id FROM public.receivable_items WHERE lease_id = v_lease_id))
    OR EXISTS (SELECT 1 FROM public.lease_amendments WHERE lease_id = v_lease_id)
    OR EXISTS (SELECT 1 FROM public.receivable_items r
      LEFT JOIN expected_ber_slots e ON e.due_date = r.due_date AND e.item_type = r.item_type
      WHERE r.lease_id = v_lease_id AND e.due_date IS NULL)
  THEN
    RAISE EXCEPTION 'BAIL-BER-001 preflight changed; no rows were corrected';
  END IF;

  SELECT count(*) INTO v_count FROM expected_ber_slots e
  LEFT JOIN (
    SELECT r.due_date, r.item_type, count(*) AS row_count,
      count(*) FILTER (WHERE r.unit_id = v_main_unit) AS main_rows,
      count(*) FILTER (WHERE r.unit_id = v_storage_unit) AS storage_rows
    FROM public.receivable_items r WHERE r.lease_id = v_lease_id
    GROUP BY r.due_date, r.item_type
  ) s USING (due_date, item_type)
  WHERE s.row_count IS DISTINCT FROM e.expected_rows
    OR s.main_rows IS DISTINCT FROM CASE WHEN e.expected_rows = 2 THEN 1 ELSE 0 END
    OR s.storage_rows IS DISTINCT FROM 1;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'BAIL-BER-001 schedule slots changed; no rows were corrected';
  END IF;

  INSERT INTO repair_audit.bail_ber_001_20261115 (entity, row_id, before_row)
  SELECT 'lease', l.id, to_jsonb(l) FROM public.leases l WHERE l.id = v_lease_id
  UNION ALL
  SELECT 'receivable', r.id, to_jsonb(r) FROM public.receivable_items r
  WHERE r.lease_id = v_lease_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 73 THEN RAISE EXCEPTION 'Expected 73 before-images'; END IF;

  DELETE FROM public.receivable_items r
  WHERE r.lease_id = v_lease_id AND r.unit_id = v_storage_unit
    AND r.due_date < '2026-08-01'::date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 32 THEN RAISE EXCEPTION 'Expected exactly 32 duplicate schedule rows'; END IF;

  UPDATE public.receivable_items r SET unit_id = v_main_unit
  WHERE r.lease_id = v_lease_id AND r.unit_id = v_storage_unit
    AND r.due_date >= '2026-08-01'::date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 8 THEN RAISE EXCEPTION 'Expected exactly eight schedule unit corrections'; END IF;

  UPDATE public.receivable_items r
  SET expected_amount = 190, outstanding_amount = 190
  WHERE r.lease_id = v_lease_id AND r.item_type = 'charges';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 20 THEN RAISE EXCEPTION 'Expected exactly 20 charges corrections'; END IF;

  UPDATE public.leases SET monthly_charges = 190 WHERE id = v_lease_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Expected exactly one lease correction'; END IF;

  SELECT count(*) INTO v_count FROM public.receivable_items r
  WHERE r.lease_id = v_lease_id AND r.unit_id = v_main_unit
    AND r.status IN ('open', 'overdue') AND r.allocated_amount = 0
    AND r.outstanding_amount = r.expected_amount
    AND r.expected_amount = CASE r.item_type
      WHEN 'rent' THEN 910::numeric WHEN 'charges' THEN 190::numeric END;
  IF v_count <> 40 OR (SELECT count(*) FROM public.receivable_items
      WHERE lease_id = v_lease_id) <> 40 THEN
    RAISE EXCEPTION 'BAIL-BER-001 postcondition failed; all changes rolled back';
  END IF;
END;
$$;

COMMIT;
