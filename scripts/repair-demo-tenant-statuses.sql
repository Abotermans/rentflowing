-- Manual Demo data repair. Do not run without separate write approval.
-- Re-run scripts/preflight-demo-tenant-statuses.sql immediately before this transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA tenant_status_repair_audit;
REVOKE ALL ON SCHEMA tenant_status_repair_audit FROM PUBLIC, anon, authenticated;
CREATE TABLE tenant_status_repair_audit.before_20261115 (
  tenant_id uuid PRIMARY KEY,
  before_row jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE tenant_status_repair_audit.before_20261115 FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE expected_tenant_statuses (
  id uuid PRIMARY KEY,
  old_status text NOT NULL,
  new_status text NOT NULL,
  expected_updated_at timestamptz NOT NULL
) ON COMMIT DROP;
INSERT INTO expected_tenant_statuses VALUES
  ('0349ad9c-7c63-44c3-a92c-96816f390d88', 'applicant', 'active',
    '2026-01-15 00:00:00+00'),
  ('8f09fdd0-87b0-4291-8fd8-f8ed4d9913fc', 'active', 'applicant',
    '2026-06-16 11:18:35.416687+00'),
  ('cb7892a0-d718-4154-bfb7-a3a0aceed577', 'former', 'applicant',
    '2025-12-31 00:00:00+00');

DO $$
DECLARE
  v_count integer;
BEGIN
  LOCK TABLE public.tenants, public.leases IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO v_count
  FROM expected_tenant_statuses e JOIN public.tenants t ON t.id = e.id
  WHERE t.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
    AND t.status = e.old_status AND t.updated_at = e.expected_updated_at;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Demo tenant identities or versions changed; no statuses were corrected';
  END IF;

  SELECT count(*) INTO v_count
  FROM expected_tenant_statuses e JOIN public.tenants t ON t.id = e.id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN bool_or(l.lifecycle_stage = 'active') THEN 'active'
      WHEN bool_or(l.lifecycle_stage IN ('draft', 'pending-signature', 'signed')) THEN 'applicant'
      WHEN count(*) > 0 THEN 'former'
      ELSE NULL
    END AS expected_status
    FROM public.leases l
    WHERE l.portfolio_id = t.portfolio_id
      AND (l.tenant_ids ? t.id::text OR l.billing_tenant_id = t.id)
  ) d
  WHERE d.expected_status = e.new_status;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Linked lease stages changed; no tenant statuses were corrected';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.tenants t
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN bool_or(l.lifecycle_stage = 'active') THEN 'active'
      WHEN bool_or(l.lifecycle_stage IN ('draft', 'pending-signature', 'signed')) THEN 'applicant'
      WHEN count(*) > 0 THEN 'former'
      ELSE NULL
    END AS expected_status
    FROM public.leases l
    WHERE l.portfolio_id = t.portfolio_id
      AND (l.tenant_ids ? t.id::text OR l.billing_tenant_id = t.id)
  ) d
  WHERE d.expected_status IS NOT NULL AND t.status IS DISTINCT FROM d.expected_status;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Unexpected tenant status mismatches; no statuses were corrected';
  END IF;

  INSERT INTO tenant_status_repair_audit.before_20261115 (tenant_id, before_row)
  SELECT t.id, to_jsonb(t)
  FROM public.tenants t JOIN expected_tenant_statuses e ON e.id = t.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Expected three tenant before-images'; END IF;

  UPDATE public.tenants t
  SET status = e.new_status, updated_at = now()
  FROM expected_tenant_statuses e
  WHERE t.id = e.id AND t.status = e.old_status
    AND t.updated_at = e.expected_updated_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Expected exactly three tenant corrections'; END IF;

  SELECT count(*) INTO v_count
  FROM expected_tenant_statuses e JOIN public.tenants t ON t.id = e.id
  WHERE t.status = e.new_status;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Tenant status postcondition failed'; END IF;
END;
$$;

COMMIT;
