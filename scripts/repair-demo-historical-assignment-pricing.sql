-- Manual Demo repair for four historical single-unit assignments.
-- Do not run without explicit approval and a fresh read-only target check.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS repair_audit;
REVOKE ALL ON SCHEMA repair_audit FROM PUBLIC;
CREATE TABLE repair_audit.historical_assignment_pricing_20261115 (
  row_id uuid PRIMARY KEY,
  before_row jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE repair_audit.historical_assignment_pricing_20261115 FROM PUBLIC;

CREATE TEMP TABLE expected_historical_pricing ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('beb5db9a-2a6c-4e95-9713-65c0a5775a63'::uuid, 'BAIL-BRU-003',
   '17f52226-a44a-4ba7-93b5-20af8db5a7d2'::uuid,
   '9c484f26-26b0-4e23-a690-b462e602b902'::uuid,
   '6dad2c85-9bf8-44d1-b331-1b55e1d5a5b7'::uuid, 'EUR', 'ended',
   '2025-07-01'::date, '2026-06-17'::date, 2200::numeric, 350::numeric,
   2200::numeric, 350::numeric),
  ('49da25a6-2ec1-4b00-9fd5-6ac6f4e2b300'::uuid, 'BAIL-BRU-004',
   '2a5c8a0c-9476-4aaa-a765-a22c2cea6cd4'::uuid,
   '6b5eacf1-bc5f-4f3b-bd6d-4344ca6a66da'::uuid,
   '6dad2c85-9bf8-44d1-b331-1b55e1d5a5b7'::uuid, 'EUR', 'terminated',
   '2024-01-01'::date, '2025-05-31'::date, 1100::numeric, 150::numeric,
   1100::numeric, 150::numeric),
  ('fa49dad6-532b-4efe-a059-726e4d4b5f54'::uuid, 'BAIL-PAR-002',
   '076b4b1a-e12d-4c93-ac96-6888eb2bfa36'::uuid,
   '92ec6a02-e2e0-4031-896a-418b60f137d3'::uuid,
   '1e6b3a25-7b20-4979-b86a-225676598528'::uuid, 'GBP', 'ended',
   '2023-09-01'::date, '2025-12-31'::date, 1600::numeric, 180::numeric,
   1650::numeric, 180::numeric),
  ('b922d1c1-1bf7-4163-aef5-ebe40c67ab4a'::uuid, 'BAIL-PAR-004',
   '57df90c9-6ba9-49d1-820d-6d44350efba1'::uuid,
   '78ea5689-f402-45c0-b245-63db978ae9ad'::uuid,
   '1e6b3a25-7b20-4979-b86a-225676598528'::uuid, 'GBP', 'ended',
   '2022-01-01'::date, '2023-12-31'::date, 820::numeric, 80::numeric,
   850::numeric, 80::numeric)
) AS rows(lease_id, lease_reference, assignment_id, unit_id, property_id,
  currency_code, lifecycle_stage, start_date, end_date, monthly_rent,
  monthly_charges, unit_base_rent, unit_base_charges);

DO $$
DECLARE
  v_count integer;
  v_portfolio constant uuid := 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7';
BEGIN
  LOCK TABLE public.properties, public.units, public.leases,
    public.lease_unit_assignments, public.lease_amendments,
    public.lease_amendment_changes IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO v_count
  FROM expected_historical_pricing e
  JOIN public.leases l ON l.id = e.lease_id
  JOIN public.properties p ON p.id = e.property_id
  JOIN public.units u ON u.id = e.unit_id
  JOIN public.lease_unit_assignments a ON a.id = e.assignment_id
  WHERE l.portfolio_id = v_portfolio
    AND l.lease_reference = e.lease_reference
    AND l.property_id = e.property_id
    AND l.lifecycle_stage = e.lifecycle_stage
    AND l.start_date = e.start_date AND l.end_date = e.end_date
    AND l.monthly_rent = e.monthly_rent
    AND l.monthly_charges = e.monthly_charges
    AND p.currency_code = e.currency_code
    AND u.portfolio_id = v_portfolio AND u.property_id = e.property_id
    AND u.base_rent = e.unit_base_rent
    AND u.base_charges = e.unit_base_charges
    AND a.portfolio_id = v_portfolio AND a.lease_id = e.lease_id
    AND a.unit_id = e.unit_id
    AND a.start_date = e.start_date AND a.end_date = e.end_date
    AND a.rent_share IS NULL AND a.charges_share IS NULL;
  IF v_count <> 4 OR EXISTS (
    SELECT 1 FROM public.leases l
    JOIN expected_historical_pricing e ON e.lease_reference = l.lease_reference
    WHERE l.portfolio_id = v_portfolio AND l.id <> e.lease_id
  ) OR EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    JOIN expected_historical_pricing e ON e.lease_id = a.lease_id
    WHERE a.id <> e.assignment_id
  ) OR (SELECT count(*) FROM public.lease_amendments am
    JOIN expected_historical_pricing e ON e.lease_id = am.lease_id) <> 1
    OR (SELECT count(*) FROM public.lease_amendments am
      WHERE am.id = '1f42bf0a-1f59-45a3-8a11-d0c5ab3d9887'::uuid
        AND am.lease_id = 'beb5db9a-2a6c-4e95-9713-65c0a5775a63'::uuid
        AND am.status = 'draft' AND am.effective_date = '2026-07-01') <> 1
  THEN
    RAISE EXCEPTION 'Historical assignment pricing preflight changed; no rows were corrected';
  END IF;

  INSERT INTO repair_audit.historical_assignment_pricing_20261115 (row_id, before_row)
  SELECT a.id, to_jsonb(a) FROM public.lease_unit_assignments a
  JOIN expected_historical_pricing e ON e.assignment_id = a.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 4 THEN RAISE EXCEPTION 'Expected four assignment before-images'; END IF;

  UPDATE public.lease_unit_assignments a
  SET rent_share = e.monthly_rent, charges_share = e.monthly_charges
  FROM expected_historical_pricing e WHERE a.id = e.assignment_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 4 OR EXISTS (
    SELECT 1 FROM expected_historical_pricing e
    LEFT JOIN public.lease_unit_assignments a ON a.id = e.assignment_id
    WHERE a.rent_share IS DISTINCT FROM e.monthly_rent
      OR a.charges_share IS DISTINCT FROM e.monthly_charges
  ) OR (SELECT count(*) FROM repair_audit.historical_assignment_pricing_20261115) <> 4
  THEN
    RAISE EXCEPTION 'Historical assignment pricing postcondition failed';
  END IF;
END;
$$;
COMMIT;
