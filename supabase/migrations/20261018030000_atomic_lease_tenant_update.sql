-- Persist a lease edit and the resulting tenant statuses as one transaction.
CREATE OR REPLACE FUNCTION public.save_lease_with_tenant_statuses(
  p_lease jsonb,
  p_tenants jsonb,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_payload jsonb;
  v_lease_id uuid;
  v_portfolio_id uuid;
  v_old_tenant_ids jsonb;
  v_id uuid;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_set_clause text;
BEGIN
  IF jsonb_typeof(p_lease) <> 'object' OR jsonb_typeof(p_tenants) <> 'array'
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Invalid lease update payload' USING ERRCODE = '22023';
  END IF;
  v_lease_id := (p_lease->>'id')::uuid;
  v_portfolio_id := (p_lease->>'portfolio_id')::uuid;
  IF v_lease_id IS NULL OR v_portfolio_id IS NULL
    OR p_lease ? 'created_at' OR p_lease ? 'updated_at' THEN
    RAISE EXCEPTION 'Lease id and portfolio are required; timestamps are database managed' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_lease) AS supplied(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute AS field
      WHERE field.attrelid = 'public.leases'::regclass
        AND field.attname = supplied.name AND field.attnum > 0 AND NOT field.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'Lease update contains an unknown column' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lease FROM public.leases
  WHERE id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;
  IF v_lease.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Lease changed since it was opened. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  IF (p_lease->>'property_id')::uuid IS DISTINCT FROM v_lease.property_id THEN
    RAISE EXCEPTION 'Move the lease through the dedicated property workflow' USING ERRCODE = '22023';
  END IF;
  v_old_tenant_ids := v_lease.tenant_ids;
  SELECT string_agg(
    pg_catalog.format('%1$I = (source.record).%1$I', supplied.name), ', '
  ) INTO v_set_clause
  FROM jsonb_object_keys(p_lease) AS supplied(name)
  WHERE supplied.name NOT IN ('id', 'portfolio_id', 'property_id');
  IF v_set_clause IS NULL THEN
    RAISE EXCEPTION 'Lease update has no mutable fields' USING ERRCODE = '22023';
  END IF;
  EXECUTE pg_catalog.format(
    'WITH source AS (SELECT jsonb_populate_record(NULL::public.leases, $1) AS record)
     UPDATE public.leases AS target SET %s FROM source
     WHERE target.id = $2 AND target.portfolio_id = $3 RETURNING target.*',
    v_set_clause
  ) INTO v_lease USING p_lease, v_lease_id, v_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease update was denied' USING ERRCODE = '42501';
  END IF;

  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_tenants) AS item(value) LOOP
    v_id := (v_payload->>'id')::uuid;
    IF v_id IS NULL OR v_id = ANY(v_seen_ids)
      OR v_payload->>'status' NOT IN ('applicant', 'active', 'former')
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(v_old_tenant_ids, '[]'::jsonb)) AS member(id)
        WHERE member.id::uuid = v_id
        UNION ALL
        SELECT 1 FROM jsonb_array_elements_text(coalesce(v_lease.tenant_ids, '[]'::jsonb)) AS member(id)
        WHERE member.id::uuid = v_id
      ) THEN
      RAISE EXCEPTION 'Tenant status update is outside this lease' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
    SELECT * INTO v_tenant FROM public.tenants
    WHERE id = v_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND OR v_tenant.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'Tenant changed since the lease was opened. Reload and retry.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.tenants SET status = v_payload->>'status'
    WHERE id = v_id AND portfolio_id = v_portfolio_id;
  END LOOP;

  RETURN jsonb_build_object(
    'lease', to_jsonb(v_lease),
    'tenants', coalesce((
      SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.tenants AS item WHERE item.id = ANY(v_seen_ids)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_lease_with_tenant_statuses(jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lease_with_tenant_statuses(jsonb, jsonb, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
