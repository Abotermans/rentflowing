-- Metadata edits must not bypass assignment and receivable regeneration.
CREATE FUNCTION public.client_save_lease_metadata(
  p_lease jsonb,
  p_tenants jsonb,
  p_expected_updated_at timestamptz,
  p_status_reason text DEFAULT NULL,
  p_status_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_field text;
  v_tenant_id uuid;
  v_tenant_status text;
  v_expected_status text;
  v_status_patch jsonb;
  v_next_stage text;
BEGIN
  IF jsonb_typeof(p_lease) <> 'object' OR jsonb_typeof(p_tenants) <> 'array'
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Invalid lease metadata payload' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lease FROM public.leases
  WHERE id = (p_lease->>'id')::uuid
    AND portfolio_id = (p_lease->>'portfolio_id')::uuid
  FOR UPDATE;
  IF NOT FOUND OR NOT public.has_portfolio_role(
    v_lease.portfolio_id, auth.uid(),
    ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = '42501';
  END IF;
  IF v_lease.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Lease changed since it was opened. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  FOR v_field IN SELECT key FROM jsonb_each(p_lease) LOOP
    IF v_field NOT IN (
      'id', 'portfolio_id', 'property_id', 'lifecycle_stage', 'signed_date',
      'notes', 'move_in_scheduled_date', 'move_in_actual_date',
      'move_in_meter_reading', 'move_in_water_meter_reading', 'move_in_checklist',
      'move_out_meter_reading', 'move_out_water_meter_reading',
      'move_out_checklist', 'move_out_notes', 'key_handover_count',
      'key_return_count', 'keys', 'return_status', 'return_notes',
      'payer_accounts'
    ) AND (p_lease->v_field) IS DISTINCT FROM (to_jsonb(v_lease)->v_field) THEN
      RAISE EXCEPTION 'Changing % requires the lease billing workflow', v_field
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_lease ? 'lifecycle_stage'
    AND p_lease->>'lifecycle_stage' IS DISTINCT FROM v_lease.lifecycle_stage THEN
    IF v_lease.lifecycle_stage IN ('ended', 'terminated') THEN
      RAISE EXCEPTION 'A closed lease cannot be reopened through metadata editing'
        USING ERRCODE = '22023';
    END IF;
    IF p_lease->>'lifecycle_stage' IN ('ended', 'terminated') THEN
      RAISE EXCEPTION 'Closing a lease requires the lease closure workflow'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  v_next_stage := coalesce(p_lease->>'lifecycle_stage', v_lease.lifecycle_stage);
  IF v_next_stage NOT IN ('draft', 'pending-signature', 'signed', 'active', 'ended', 'terminated') THEN
    RAISE EXCEPTION 'Invalid lease lifecycle stage' USING ERRCODE = '22023';
  END IF;
  IF v_next_stage IS DISTINCT FROM v_lease.lifecycle_stage
    AND NOT (v_lease.lifecycle_stage = 'draft'
      AND v_next_stage IN ('pending-signature', 'signed', 'active')
      OR v_lease.lifecycle_stage = 'pending-signature'
      AND v_next_stage IN ('draft', 'signed', 'active')
      OR v_lease.lifecycle_stage = 'signed'
      AND v_next_stage IN ('pending-signature', 'active')) THEN
    RAISE EXCEPTION 'Invalid lease lifecycle transition' USING ERRCODE = '22023';
  END IF;
  FOR v_tenant_id IN
    SELECT member.value::uuid
    FROM jsonb_array_elements_text(coalesce(v_lease.tenant_ids, '[]'::jsonb)) AS member(value)
  LOOP
    SELECT status INTO v_tenant_status FROM public.tenants
    WHERE id = v_tenant_id AND portfolio_id = v_lease.portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked tenant was not found' USING ERRCODE = 'P0002';
    END IF;
    SELECT CASE
      WHEN bool_or(CASE WHEN linked.id = v_lease.id THEN v_next_stage
        ELSE linked.lifecycle_stage END = 'active') THEN 'active'
      WHEN bool_or(CASE WHEN linked.id = v_lease.id THEN v_next_stage
        ELSE linked.lifecycle_stage END IN ('draft', 'pending-signature', 'signed'))
        THEN 'applicant'
      ELSE 'former'
    END INTO v_expected_status
    FROM public.leases AS linked
    WHERE linked.portfolio_id = v_lease.portfolio_id
      AND linked.tenant_ids @> jsonb_build_array(v_tenant_id::text);
    SELECT requested.value INTO v_status_patch
    FROM jsonb_array_elements(p_tenants) AS requested(value)
    WHERE requested.value->>'id' = v_tenant_id::text LIMIT 1;
    IF v_status_patch IS NOT NULL
      AND v_status_patch->>'status' IS DISTINCT FROM v_expected_status THEN
      RAISE EXCEPTION 'Tenant status must match linked leases' USING ERRCODE = '22023';
    END IF;
    IF v_next_stage IS DISTINCT FROM v_lease.lifecycle_stage
      AND v_tenant_status IS DISTINCT FROM v_expected_status
      AND v_status_patch IS NULL THEN
      RAISE EXCEPTION 'Lease stage change requires the linked tenant status update'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN public.save_lease_with_tenant_statuses(
    p_lease, p_tenants, p_expected_updated_at, p_status_reason, p_status_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.client_save_lease_metadata(jsonb, jsonb, timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_save_lease_metadata(jsonb, jsonb, timestamptz, text, text)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_lease_with_tenant_statuses(jsonb, jsonb, timestamptz, text, text)
  FROM authenticated;
REVOKE UPDATE ON public.leases FROM authenticated;

NOTIFY pgrst, 'reload schema';
