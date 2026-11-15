-- Close a lease and all of its dependent lifecycle rows in one transaction.
CREATE OR REPLACE FUNCTION public.close_lease_atomically(
  p_lease jsonb,
  p_expected_updated_at timestamptz,
  p_vacancy_date date,
  p_free_units boolean DEFAULT true,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_previous public.leases%ROWTYPE;
  v_portfolio_id uuid;
  v_lease_id uuid;
  v_unit_ids uuid[] := ARRAY[]::uuid[];
  v_tenant_id uuid;
  v_tenant_ids uuid[] := ARRAY[]::uuid[];
  v_tenant_status text;
  v_set_clause text;
BEGIN
  IF jsonb_typeof(p_lease) <> 'object' OR p_expected_updated_at IS NULL
    OR p_vacancy_date IS NULL OR p_lease ? 'created_at' OR p_lease ? 'updated_at' THEN
    RAISE EXCEPTION 'Invalid lease closure payload' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_lease) AS supplied(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute AS field
      WHERE field.attrelid = 'public.leases'::regclass
        AND field.attname = supplied.name AND field.attnum > 0 AND NOT field.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'Lease closure contains an unknown column' USING ERRCODE = '22023';
  END IF;
  v_lease_id := (p_lease->>'id')::uuid;
  v_portfolio_id := (p_lease->>'portfolio_id')::uuid;
  IF v_lease_id IS NULL OR v_portfolio_id IS NULL THEN
    RAISE EXCEPTION 'Lease and portfolio are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_previous FROM public.leases
  WHERE id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;
  IF v_previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Lease changed since it was opened. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  IF v_previous.lifecycle_stage IN ('ended', 'terminated')
    OR p_lease->>'lifecycle_stage' NOT IN ('ended', 'terminated')
    OR (p_lease->>'property_id')::uuid IS DISTINCT FROM v_previous.property_id
    OR (p_lease->>'start_date')::date IS DISTINCT FROM v_previous.start_date
    OR (p_lease->'tenant_ids') IS DISTINCT FROM v_previous.tenant_ids
    OR (p_lease->>'billing_tenant_id')::uuid IS DISTINCT FROM v_previous.billing_tenant_id
    OR p_lease->>'end_date' IS NULL
    OR p_vacancy_date < v_previous.start_date
    OR p_vacancy_date > CURRENT_DATE
    OR (p_lease->>'end_date')::date < v_previous.start_date
    OR (p_lease->>'end_date')::date > p_vacancy_date THEN
    RAISE EXCEPTION 'Invalid lease closure state or date' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(pg_catalog.format('%1$I = (source.record).%1$I', supplied.name), ', ')
    INTO v_set_clause
  FROM jsonb_object_keys(p_lease) AS supplied(name)
  WHERE supplied.name NOT IN ('id', 'portfolio_id', 'property_id', 'tenant_ids', 'billing_tenant_id');
  IF v_set_clause IS NULL THEN
    RAISE EXCEPTION 'Lease closure has no mutable fields' USING ERRCODE = '22023';
  END IF;
  EXECUTE pg_catalog.format(
    'WITH source AS (SELECT jsonb_populate_record(NULL::public.leases, $1) AS record)
     UPDATE public.leases AS target SET %s FROM source
     WHERE target.id = $2 AND target.portfolio_id = $3 RETURNING target.*',
    v_set_clause
  ) INTO v_lease USING p_lease, v_lease_id, v_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease closure was denied' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT unit_id), ARRAY[]::uuid[]) INTO v_unit_ids
  FROM public.lease_unit_assignments
  WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id
    AND start_date <= p_vacancy_date
    AND (end_date IS NULL OR end_date >= p_vacancy_date);
  DELETE FROM public.lease_unit_assignments
  WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id
    AND start_date > p_vacancy_date;
  UPDATE public.lease_unit_assignments SET end_date = p_vacancy_date
  WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id
    AND start_date <= p_vacancy_date
    AND (end_date IS NULL OR end_date > p_vacancy_date);
  UPDATE public.lease_amendments
  SET status = CASE WHEN v_lease.lifecycle_stage = 'terminated' THEN 'terminated' ELSE 'ended' END
  WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id AND status = 'active';

  IF p_free_units THEN
    UPDATE public.units AS unit SET current_status = 'vacant', available_from = p_vacancy_date
    WHERE unit.id = ANY(v_unit_ids) AND unit.portfolio_id = v_portfolio_id
      AND unit.current_status NOT IN ('vacant', 'archived')
      AND NOT EXISTS (
        SELECT 1 FROM public.lease_unit_assignments AS assignment
        JOIN public.leases AS other ON other.id = assignment.lease_id
        WHERE assignment.unit_id = unit.id AND assignment.lease_id <> v_lease_id
          AND assignment.portfolio_id = v_portfolio_id AND other.portfolio_id = v_portfolio_id
          AND other.lifecycle_stage = 'active'
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      );
  END IF;

  SELECT coalesce(array_agg(DISTINCT member.id::uuid), ARRAY[]::uuid[]) INTO v_tenant_ids
  FROM jsonb_array_elements_text(coalesce(v_previous.tenant_ids, '[]'::jsonb)) AS member(id);
  FOREACH v_tenant_id IN ARRAY v_tenant_ids LOOP
    PERFORM 1 FROM public.tenants
    WHERE id = v_tenant_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked tenant was not found or is not accessible' USING ERRCODE = 'P0002';
    END IF;
    SELECT CASE
      WHEN bool_or(linked.lifecycle_stage = 'active') THEN 'active'
      WHEN bool_or(linked.lifecycle_stage IN ('draft', 'pending-signature', 'signed')) THEN 'applicant'
      ELSE 'former'
    END INTO v_tenant_status
    FROM public.leases AS linked
    WHERE linked.portfolio_id = v_portfolio_id
      AND linked.tenant_ids @> jsonb_build_array(v_tenant_id::text);
    UPDATE public.tenants SET status = v_tenant_status
    WHERE id = v_tenant_id AND portfolio_id = v_portfolio_id
      AND status IS DISTINCT FROM v_tenant_status;
  END LOOP;

  INSERT INTO public.lease_status_changes
    (lease_id, portfolio_id, from_stage, to_stage, reason, notes, changed_by)
  VALUES
    (v_lease_id, v_portfolio_id, v_previous.lifecycle_stage, v_lease.lifecycle_stage,
     coalesce(nullif(p_reason, ''), v_lease.lifecycle_stage), p_notes, auth.uid());

  RETURN jsonb_build_object(
    'lease', to_jsonb(v_lease),
    'assignments', coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.lease_unit_assignments AS item
      WHERE item.lease_id = v_lease_id AND item.portfolio_id = v_portfolio_id), '[]'::jsonb),
    'amendments', coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.lease_amendments AS item
      WHERE item.lease_id = v_lease_id AND item.portfolio_id = v_portfolio_id), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.units AS item WHERE item.id = ANY(v_unit_ids)
        AND item.portfolio_id = v_portfolio_id), '[]'::jsonb),
    'tenants', coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.tenants AS item WHERE item.id = ANY(v_tenant_ids)
        AND item.portfolio_id = v_portfolio_id), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_lease_atomically(jsonb, timestamptz, date, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_lease_atomically(jsonb, timestamptz, date, boolean, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
