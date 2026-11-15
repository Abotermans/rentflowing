-- Manual, one-time Demo repair. Do not run without explicit approval.
-- Requires a privileged SQL session; never include this in migrations.
-- Re-run scripts/preflight-lease-unit-share-backfill.sql immediately first.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS repair_audit;
REVOKE ALL ON SCHEMA repair_audit FROM PUBLIC;
CREATE TABLE repair_audit.active_assignment_pricing_20261115 (
  row_id uuid PRIMARY KEY,
  before_row jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE repair_audit.active_assignment_pricing_20261115 FROM PUBLIC;

CREATE TEMP TABLE expected_assignment_pricing ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('7ebedef0-89d3-46eb-a1f9-5833a4e023d4'::uuid, 'BAIL-AMS-003',
   'cc57bf2f-34da-4484-acfc-ec7a9f024b41'::uuid,
   'c2577669-d780-4b0a-9f92-12102705a98a'::uuid, 'EUR',
   2600::numeric, 320::numeric, '2024-04-01'::date),
  ('813ae43e-bec1-4206-b299-f73e1d5bf2ad'::uuid, 'BAIL-LON-001',
   'd0f7cbd6-0e2d-4ced-b419-a26b706dc4de'::uuid,
   'd157fcfa-e740-4f7b-8b9b-5ab3ea3a4976'::uuid, 'GBP',
   1800::numeric, 120::numeric, '2024-10-01'::date),
  ('17111997-78c5-45ac-a207-91e1ed96c4c3'::uuid, 'BAIL-LON-002',
   '91afded5-fa59-4215-8123-d07ad485b4bd'::uuid,
   '5561bdcc-9aa3-4a49-b8b3-33d66a4a83e3'::uuid, 'GBP',
   2200::numeric, 140::numeric, '2025-02-01'::date)
) AS rows(lease_id, lease_reference, assignment_id, unit_id, currency_code,
  monthly_rent, monthly_charges, lease_start_date);

DO $$
DECLARE
  v_count integer;
BEGIN
  LOCK TABLE public.lease_amendments, public.lease_amendment_changes IN SHARE MODE;
  PERFORM 1 FROM public.leases l
  WHERE l.id IN (SELECT lease_id FROM expected_assignment_pricing)
  ORDER BY l.id FOR UPDATE;
  PERFORM 1 FROM public.properties p
  WHERE p.id IN (
    SELECT l.property_id FROM public.leases l
    JOIN expected_assignment_pricing e ON e.lease_id = l.id
  ) ORDER BY p.id FOR UPDATE;
  PERFORM 1 FROM public.units u
  WHERE u.id IN (SELECT unit_id FROM expected_assignment_pricing)
  ORDER BY u.id FOR UPDATE;
  PERFORM 1 FROM public.lease_unit_assignments a
  WHERE a.id IN (SELECT assignment_id FROM expected_assignment_pricing)
  ORDER BY a.id FOR UPDATE;

  SELECT count(*) INTO v_count
  FROM expected_assignment_pricing e
  JOIN public.leases l ON l.id = e.lease_id
  JOIN public.properties p ON p.id = l.property_id
  JOIN public.lease_unit_assignments a ON a.id = e.assignment_id
  JOIN public.units u ON u.id = e.unit_id
  WHERE l.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
    AND l.lease_reference = e.lease_reference AND l.lifecycle_stage = 'active'
    AND l.start_date = e.lease_start_date
    AND l.monthly_rent = e.monthly_rent
    AND l.monthly_charges = e.monthly_charges
    AND p.currency_code = e.currency_code
    AND a.lease_id = e.lease_id AND a.unit_id = e.unit_id
    AND a.portfolio_id = l.portfolio_id
    AND a.start_date = e.lease_start_date AND a.end_date IS NULL
    AND a.rent_share IS NULL AND a.charges_share IS NULL
    AND u.portfolio_id = l.portfolio_id AND u.property_id = l.property_id
    AND u.base_rent = e.monthly_rent AND u.base_charges = e.monthly_charges;
  IF v_count <> 3 OR EXISTS (
    SELECT 1 FROM public.leases l
    WHERE l.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
      AND l.lease_reference IN (SELECT lease_reference FROM expected_assignment_pricing)
      AND l.id NOT IN (SELECT lease_id FROM expected_assignment_pricing)
  ) OR EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    JOIN expected_assignment_pricing e ON e.lease_id = a.lease_id
    WHERE a.id <> e.assignment_id
  ) OR EXISTS (
    SELECT 1 FROM public.lease_amendments am
    JOIN expected_assignment_pricing e ON e.lease_id = am.lease_id
    JOIN public.lease_amendment_changes c ON c.amendment_id = am.id
    WHERE c.field_name IS DISTINCT FROM 'leaseEndDate'
  ) THEN
    RAISE EXCEPTION 'Demo assignment pricing preflight changed; no rows were corrected';
  END IF;

  INSERT INTO repair_audit.active_assignment_pricing_20261115 (row_id, before_row)
  SELECT a.id, to_jsonb(a) FROM public.lease_unit_assignments a
  JOIN expected_assignment_pricing e ON e.assignment_id = a.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Expected three assignment before-images'; END IF;

  UPDATE public.lease_unit_assignments a
  SET rent_share = e.monthly_rent, charges_share = e.monthly_charges
  FROM expected_assignment_pricing e WHERE a.id = e.assignment_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 OR EXISTS (
    SELECT 1 FROM expected_assignment_pricing e
    LEFT JOIN public.lease_unit_assignments a ON a.id = e.assignment_id
    WHERE a.rent_share IS DISTINCT FROM e.monthly_rent
      OR a.charges_share IS DISTINCT FROM e.monthly_charges
  ) OR (SELECT count(*) FROM repair_audit.active_assignment_pricing_20261115) <> 3 THEN
    RAISE EXCEPTION 'Demo assignment pricing repair did not update exactly three rows';
  END IF;
END;
$$;

COMMIT;
