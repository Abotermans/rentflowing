-- The lease, its unit windows, generated receivables, and tenant statuses
-- must either all persist or all roll back.
CREATE OR REPLACE FUNCTION public.create_lease_with_schedule(
  p_lease jsonb,
  p_assignments jsonb,
  p_receivables jsonb,
  p_tenants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_assignment public.lease_unit_assignments%ROWTYPE;
  v_conflict record;
  v_tenant public.tenants%ROWTYPE;
  v_payload jsonb;
  v_lease_id uuid;
  v_portfolio_id uuid;
  v_id uuid;
  v_assignment_ids uuid[] := ARRAY[]::uuid[];
  v_unit_ids uuid[] := ARRAY[]::uuid[];
  v_receivable_ids uuid[] := ARRAY[]::uuid[];
  v_tenant_ids uuid[] := ARRAY[]::uuid[];
  v_rent_total numeric;
  v_charges_total numeric;
BEGIN
  IF jsonb_typeof(p_lease) <> 'object'
    OR jsonb_typeof(p_assignments) <> 'array'
    OR jsonb_typeof(p_receivables) <> 'array'
    OR jsonb_typeof(p_tenants) <> 'array'
    OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Lease and child rows have invalid shapes' USING ERRCODE = '22023';
  END IF;
  v_lease_id := (p_lease->>'id')::uuid;
  v_portfolio_id := (p_lease->>'portfolio_id')::uuid;
  IF v_lease_id IS NULL OR v_portfolio_id IS NULL OR (p_lease->>'property_id')::uuid IS NULL THEN
    RAISE EXCEPTION 'Lease id, portfolio, and property are required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_lease->'monthly_rent') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_lease->'monthly_charges') IS DISTINCT FROM 'number'
    OR (p_lease->>'monthly_rent')::numeric < 0
    OR (p_lease->>'monthly_charges')::numeric < 0 THEN
    RAISE EXCEPTION 'Lease monthly rent and charges must be non-negative amounts' USING ERRCODE = '22023';
  END IF;

  -- Lock units in a stable order so concurrent lease creation cannot both
  -- pass the date-window check for the same unit.
  FOR v_id IN
    SELECT DISTINCT (value->>'unit_id')::uuid
    FROM jsonb_array_elements(p_assignments) AS row(value)
    ORDER BY 1
  LOOP
    PERFORM 1 FROM public.units
    WHERE id = v_id AND portfolio_id = v_portfolio_id
      AND property_id = (p_lease->>'property_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lease unit was not found, is not accessible, or belongs to another property' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_assignments) AS row(value) LOOP
    IF jsonb_typeof(v_payload) <> 'object'
      OR (v_payload->>'id')::uuid IS NULL
      OR (v_payload->>'lease_id')::uuid IS DISTINCT FROM v_lease_id
      OR (v_payload->>'unit_id')::uuid IS NULL THEN
      RAISE EXCEPTION 'Lease assignment has an invalid id, lease, or unit' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_assignment FROM jsonb_populate_record(NULL::public.lease_unit_assignments, v_payload);
    IF v_assignment.start_date IS NULL
      OR (v_assignment.end_date IS NOT NULL AND v_assignment.end_date < v_assignment.start_date)
      OR jsonb_typeof(v_payload->'rent_share') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_payload->'charges_share') IS DISTINCT FROM 'number'
      OR v_assignment.rent_share < 0 OR v_assignment.charges_share < 0 THEN
      RAISE EXCEPTION 'Lease unit assignment needs valid dates and non-negative rent and charges shares' USING ERRCODE = '22023';
    END IF;
    SELECT units.unit_code, other.lease_reference,
      bounds.other_start AS start_date, bounds.other_end AS end_date,
      bounds.proposed_start, bounds.proposed_end INTO v_conflict
    FROM public.lease_unit_assignments AS existing
    JOIN public.leases AS other ON other.id = existing.lease_id
    JOIN public.units AS units ON units.id = existing.unit_id
    CROSS JOIN LATERAL (
      SELECT greatest(existing.start_date, other.start_date) AS other_start,
        least(existing.end_date, other.end_date, other.move_out_actual_date) AS other_end,
        greatest(v_assignment.start_date, (p_lease->>'start_date')::date) AS proposed_start,
        least(v_assignment.end_date, (p_lease->>'end_date')::date,
          (p_lease->>'move_out_actual_date')::date) AS proposed_end
    ) AS bounds
    WHERE existing.unit_id = v_assignment.unit_id
      AND existing.portfolio_id = v_portfolio_id
      AND other.lifecycle_stage NOT IN ('ended', 'terminated')
      AND bounds.other_start < coalesce(bounds.other_end, 'infinity'::date)
      AND bounds.proposed_start < coalesce(bounds.proposed_end, 'infinity'::date)
      AND bounds.other_start < coalesce(bounds.proposed_end, 'infinity'::date)
      AND bounds.proposed_start < coalesce(bounds.other_end, 'infinity'::date)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION USING
        MESSAGE = format(
          'Unit %s conflicts with lease %s (%s to %s) for proposed period %s to %s. %s',
          coalesce(nullif(v_conflict.unit_code, ''), v_assignment.unit_id::text),
          coalesce(nullif(v_conflict.lease_reference, ''), 'unknown'),
          v_conflict.start_date,
          coalesce(v_conflict.end_date::text, 'open-ended'),
          v_conflict.proposed_start,
          coalesce(v_conflict.proposed_end::text, 'open-ended'),
          CASE WHEN v_conflict.end_date IS NULL
            THEN 'The conflicting assignment has no end date.'
            ELSE format('The unit is available from %s onward.', v_conflict.end_date)
          END
        ),
        ERRCODE = '23514';
    END IF;
    v_assignment_ids := array_append(v_assignment_ids, v_assignment.id);
    v_unit_ids := array_append(v_unit_ids, v_assignment.unit_id);
  END LOOP;
  IF cardinality(v_unit_ids) <>
    (SELECT count(DISTINCT id) FROM unnest(v_unit_ids) AS selected(id)) THEN
    RAISE EXCEPTION 'A unit may appear only once in a new lease' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.units AS unit
    WHERE unit.id = ANY(v_unit_ids)
      AND unit.portfolio_id = v_portfolio_id
      AND unit.property_id = (p_lease->>'property_id')::uuid
      AND unit.unit_type NOT IN ('parking', 'storage')
  ) THEN
    RAISE EXCEPTION 'Lease needs a main residential or commercial unit'
      USING ERRCODE = '23514';
  END IF;
  SELECT sum((item.value->>'rent_share')::numeric),
    sum((item.value->>'charges_share')::numeric)
    INTO v_rent_total, v_charges_total
  FROM jsonb_array_elements(p_assignments) AS item(value);
  IF round(v_rent_total, 2) IS DISTINCT FROM round((p_lease->>'monthly_rent')::numeric, 2)
    OR round(v_charges_total, 2) IS DISTINCT FROM round((p_lease->>'monthly_charges')::numeric, 2) THEN
    RAISE EXCEPTION 'Unit rent and charges shares must total the lease monthly rent and charges'
      USING ERRCODE = '23514';
  END IF;
  WITH windows AS (
    SELECT (item.value->>'start_date')::date AS start_date,
      (item.value->>'end_date')::date AS end_date,
      (item.value->>'rent_share')::numeric AS rent_share,
      (item.value->>'charges_share')::numeric AS charges_share
    FROM jsonb_array_elements(p_assignments) AS item(value)
  ), boundaries AS (
    SELECT (p_lease->>'start_date')::date AS as_of
    UNION SELECT start_date FROM windows
    UNION SELECT end_date + 1 FROM windows WHERE end_date IS NOT NULL
  )
  SELECT boundary.as_of, coalesce(sum(active.rent_share), 0) AS rent_share,
    coalesce(sum(active.charges_share), 0) AS charges_share
    INTO v_conflict
  FROM boundaries AS boundary
  LEFT JOIN windows AS active ON active.start_date <= boundary.as_of
    AND (active.end_date IS NULL OR active.end_date >= boundary.as_of)
  WHERE boundary.as_of >= (p_lease->>'start_date')::date
    AND ((p_lease->>'end_date')::date IS NULL
      OR boundary.as_of <= (p_lease->>'end_date')::date)
  GROUP BY boundary.as_of
  HAVING round(coalesce(sum(active.rent_share), 0), 2)
      IS DISTINCT FROM round((p_lease->>'monthly_rent')::numeric, 2)
    OR round(coalesce(sum(active.charges_share), 0), 2)
      IS DISTINCT FROM round((p_lease->>'monthly_charges')::numeric, 2)
  ORDER BY boundary.as_of
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'Unit rent and charges on % total % and %, but lease monthly rent and charges are % and %. Use an amendment for dated price changes',
      v_conflict.as_of, v_conflict.rent_share, v_conflict.charges_share,
      p_lease->>'monthly_rent', p_lease->>'monthly_charges'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_lease FROM jsonb_populate_record(
    NULL::public.leases,
    p_lease || jsonb_build_object('created_at', clock_timestamp(), 'updated_at', clock_timestamp())
  );
  INSERT INTO public.leases SELECT (v_lease).* RETURNING * INTO v_lease;

  INSERT INTO public.lease_unit_assignments
  SELECT (jsonb_populate_record(
    NULL::public.lease_unit_assignments,
    item.value || jsonb_build_object(
      'portfolio_id', v_portfolio_id,
      'created_at', clock_timestamp(),
      'updated_at', clock_timestamp()
    )
  )).*
  FROM jsonb_array_elements(p_assignments) AS item(value);

  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_receivables) AS row(value) LOOP
    IF jsonb_typeof(v_payload) <> 'object'
      OR (v_payload->>'id')::uuid IS NULL
      OR (v_payload->>'lease_id')::uuid IS DISTINCT FROM v_lease_id
      OR (v_payload->>'property_id')::uuid IS DISTINCT FROM (p_lease->>'property_id')::uuid
      OR ((v_payload->>'unit_id')::uuid IS NOT NULL AND
          (v_payload->>'unit_id')::uuid <> ALL(v_unit_ids))
      OR ((v_payload->>'tenant_id')::uuid IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(coalesce(p_lease->'tenant_ids', '[]'::jsonb)) AS member(id)
          WHERE member.id::uuid = (v_payload->>'tenant_id')::uuid
        )) THEN
      RAISE EXCEPTION 'Generated receivable has an invalid lease, property, or unit' USING ERRCODE = '22023';
    END IF;
    v_receivable_ids := array_append(v_receivable_ids, (v_payload->>'id')::uuid);
  END LOOP;
  INSERT INTO public.receivable_items
  SELECT (jsonb_populate_record(
    NULL::public.receivable_items,
    item.value || jsonb_build_object(
      'portfolio_id', v_portfolio_id,
      'created_at', clock_timestamp(),
      'updated_at', clock_timestamp()
    )
  )).*
  FROM jsonb_array_elements(p_receivables) AS item(value);

  FOR v_payload IN
    SELECT value FROM jsonb_array_elements(p_tenants) AS row(value)
    ORDER BY value->>'id'
  LOOP
    v_id := (v_payload->>'id')::uuid;
    IF v_id IS NULL OR v_payload->>'status' NOT IN ('applicant', 'active', 'former')
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(p_lease->'tenant_ids', '[]'::jsonb)) AS member(id)
        WHERE member.id::uuid = v_id
      ) THEN
      RAISE EXCEPTION 'Tenant status update is outside this lease' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_tenant FROM public.tenants
    WHERE id = v_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lease tenant was not found or is not accessible' USING ERRCODE = 'P0002';
    END IF;
    IF v_tenant.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'Tenant changed since the lease was opened. Reload and try again.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.tenants SET status = v_payload->>'status'
    WHERE id = v_id AND portfolio_id = v_portfolio_id;
    v_tenant_ids := array_append(v_tenant_ids, v_id);
  END LOOP;

  RETURN jsonb_build_object(
    'lease', to_jsonb(v_lease),
    'assignments', coalesce((
      SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.lease_unit_assignments AS item WHERE item.id = ANY(v_assignment_ids)
    ), '[]'::jsonb),
    'receivables', coalesce((
      SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.receivable_items AS item WHERE item.id = ANY(v_receivable_ids)
    ), '[]'::jsonb),
    'tenants', coalesce((
      SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.tenants AS item WHERE item.id = ANY(v_tenant_ids)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_lease_with_schedule(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lease_with_schedule(jsonb, jsonb, jsonb, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
