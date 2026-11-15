-- Owner-authorized Demo repair: two July duplicate bills and eight wrong unit anchors.
-- No amounts, receipts, allocations, or lease terms are changed.
-- Re-run the read-only preflight before this guarded transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS repair_audit;
REVOKE ALL ON SCHEMA repair_audit FROM PUBLIC;
CREATE TABLE repair_audit.bail_par_003_20261115 (
  row_id uuid PRIMARY KEY,
  before_row jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE repair_audit.bail_par_003_20261115 FROM PUBLIC;

CREATE TEMP TABLE expected_par_003_rows (
  id uuid PRIMARY KEY,
  item_type text NOT NULL,
  due_date date NOT NULL,
  cycle_end_date date NOT NULL,
  cycle_index integer NOT NULL,
  expected_amount numeric NOT NULL,
  unit_id uuid NOT NULL
) ON COMMIT DROP;
INSERT INTO expected_par_003_rows VALUES
  ('9bff18ac-8fa7-4905-a628-c42d3fd77500', 'charges', '2026-07-05', '2026-07-31', 1, 230, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('7e0f2ec8-1e62-484d-8a53-c11c514f94f8', 'charges', '2026-07-05', '2026-07-31', 1, 230, '682da39a-fd16-425a-8291-e1cbb5fc226d'),
  ('49f4b7c6-4540-48c8-a7e8-9c9f353b2d31', 'rent', '2026-07-05', '2026-07-31', 1, 2320, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('fa16c3e8-bda3-45b7-ad21-367ab1c3b7d4', 'rent', '2026-07-05', '2026-07-31', 1, 2320, '682da39a-fd16-425a-8291-e1cbb5fc226d'),
  ('1560d4ba-3a1f-4987-bd4b-5fc6896cd831', 'charges', '2026-08-05', '2026-08-31', 2, 230, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('a857bbec-461c-480d-b189-85d668dead20', 'rent', '2026-08-05', '2026-08-31', 2, 2320, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('8a01b95c-0385-44be-85e9-3f9c3f382fb3', 'charges', '2026-09-05', '2026-09-30', 3, 230, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('d851d94d-7cce-4ea5-a058-81087aa4b58b', 'rent', '2026-09-05', '2026-09-30', 3, 2320, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('3ce36f9d-8d03-4a84-8cd2-a3a974f2af43', 'charges', '2026-10-05', '2026-10-31', 4, 230, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('8878814d-fcc2-401a-bda2-1e65ed1d02c3', 'rent', '2026-10-05', '2026-10-31', 4, 2320, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('17fec932-ec7a-45c4-9a35-fd8c39ae79c6', 'charges', '2026-11-05', '2026-11-30', 5, 230, '618361ab-46be-4d6e-858b-0f7e8e9ad611'),
  ('30ee32d7-37dd-4c75-994e-299d1ad063d7', 'rent', '2026-11-05', '2026-11-30', 5, 2320, '618361ab-46be-4d6e-858b-0f7e8e9ad611');

DO $$
DECLARE
  v_count integer;
  v_lease constant uuid := 'bf75b74c-7cc0-483d-8b36-3cc131c11d66';
  v_portfolio constant uuid := 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7';
  v_property constant uuid := '1e6b3a25-7b20-4979-b86a-225676598528';
  v_tenant constant uuid := 'cb7892a0-d718-4154-bfb7-a3a0aceed577';
  v_main constant uuid := '682da39a-fd16-425a-8291-e1cbb5fc226d';
  v_parking constant uuid := '618361ab-46be-4d6e-858b-0f7e8e9ad611';
BEGIN
  LOCK TABLE public.leases, public.lease_unit_assignments,
    public.receivable_items, public.receipt_allocations, public.cash_receipts,
    public.charges_reconciliations, public.lease_amendments
    IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM public.leases
      WHERE id = v_lease AND portfolio_id = v_portfolio
        AND lease_reference = 'BAIL-PAR-003' AND property_id = v_property
        AND billing_tenant_id = v_tenant AND lifecycle_stage = 'signed'
        AND start_date = '2026-07-01' AND end_date = '2029-06-30'
        AND due_day_of_month = 5 AND rent_formula = 1
        AND monthly_rent = 2320 AND monthly_charges = 230) <> 1
    OR (SELECT count(*) FROM public.lease_unit_assignments WHERE lease_id = v_lease) <> 3
    OR (SELECT count(*) FROM public.lease_unit_assignments
      WHERE lease_id = v_lease AND portfolio_id = v_portfolio
        AND start_date = '2026-07-01' AND end_date IS NULL
        AND ((unit_id = v_main AND rent_share = 1350 AND charges_share = 150)
          OR (unit_id = v_parking AND rent_share = 120 AND charges_share = 0)
          OR (unit_id = '78ea5689-f402-45c0-b245-63db978ae9ad'::uuid
            AND rent_share = 850 AND charges_share = 80))) <> 3
    OR (SELECT count(*) FROM public.receivable_items WHERE lease_id = v_lease) <> 12
    OR EXISTS (SELECT 1 FROM expected_par_003_rows e
      LEFT JOIN public.receivable_items r ON r.id = e.id AND r.lease_id = v_lease
      WHERE r.id IS NULL OR r.portfolio_id IS DISTINCT FROM v_portfolio
        OR r.property_id IS DISTINCT FROM v_property
        OR r.tenant_id IS DISTINCT FROM v_tenant
        OR r.unit_id IS DISTINCT FROM e.unit_id
        OR r.item_type IS DISTINCT FROM e.item_type
        OR r.origin IS DISTINCT FROM 'lease-schedule'
        OR r.currency_code IS DISTINCT FROM 'GBP'
        OR r.due_date IS DISTINCT FROM e.due_date
        OR r.period_month IS DISTINCT FROM to_char(e.due_date, 'YYYY-MM')
        OR r.cycle_end_date IS DISTINCT FROM e.cycle_end_date
        OR r.cycle_index IS DISTINCT FROM e.cycle_index
        OR r.expected_amount IS DISTINCT FROM e.expected_amount
        OR r.outstanding_amount IS DISTINCT FROM e.expected_amount
        OR r.allocated_amount IS DISTINCT FROM 0
        OR r.status NOT IN ('open', 'overdue')
        OR r.label IS DISTINCT FROM CASE e.item_type
          WHEN 'rent' THEN 'Monthly Rent' ELSE 'Monthly Charges' END
        OR r.notes IS DISTINCT FROM ''
        OR r.priority IS DISTINCT FROM CASE e.item_type
          WHEN 'rent' THEN 10 ELSE 20 END)
    OR EXISTS (SELECT 1 FROM public.receipt_allocations a
      JOIN public.receivable_items r ON r.id = a.receivable_item_id
      WHERE r.lease_id = v_lease)
    OR EXISTS (SELECT 1 FROM public.cash_receipts WHERE lease_id = v_lease)
    OR EXISTS (SELECT 1 FROM public.charges_reconciliations
      WHERE lease_id = v_lease OR receivable_item_id IN
        (SELECT id FROM public.receivable_items WHERE lease_id = v_lease))
    OR EXISTS (SELECT 1 FROM public.lease_amendments WHERE lease_id = v_lease)
  THEN
    RAISE EXCEPTION 'BAIL-PAR-003 preflight changed; no rows were corrected';
  END IF;

  INSERT INTO repair_audit.bail_par_003_20261115 (row_id, before_row)
  SELECT r.id, to_jsonb(r) FROM public.receivable_items r WHERE r.lease_id = v_lease;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 12 THEN RAISE EXCEPTION 'Expected twelve before-images'; END IF;

  DELETE FROM public.receivable_items
  WHERE id IN ('9bff18ac-8fa7-4905-a628-c42d3fd77500'::uuid,
    '49f4b7c6-4540-48c8-a7e8-9c9f353b2d31'::uuid);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected two July duplicates'; END IF;

  UPDATE public.receivable_items SET unit_id = v_main
  WHERE lease_id = v_lease AND unit_id = v_parking
    AND due_date >= '2026-08-05'::date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 8 THEN RAISE EXCEPTION 'Expected eight unit corrections'; END IF;

  IF (SELECT count(*) FROM public.receivable_items WHERE lease_id = v_lease) <> 10
    OR EXISTS (SELECT 1 FROM public.receivable_items r
      WHERE r.lease_id = v_lease AND (r.unit_id IS DISTINCT FROM v_main
        OR r.allocated_amount IS DISTINCT FROM 0
        OR r.outstanding_amount IS DISTINCT FROM r.expected_amount))
    OR (SELECT count(*) FROM repair_audit.bail_par_003_20261115) <> 12
  THEN
    RAISE EXCEPTION 'BAIL-PAR-003 postcondition failed; all changes rolled back';
  END IF;
END;
$$;
COMMIT;
