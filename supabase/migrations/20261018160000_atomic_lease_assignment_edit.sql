-- Edit a lease, its affected tenant statuses and its complete assignment
-- history together. No partial lease edit survives an assignment failure.
CREATE FUNCTION public.save_lease_with_assignments(
  p_lease jsonb,
  p_tenants jsonb,
  p_expected_updated_at timestamptz,
  p_expected_assignments jsonb,
  p_assignments jsonb,
  p_schedule_from date,
  p_expected_receivables jsonb,
  p_removed_receivables jsonb,
  p_new_receivables jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_assignment public.lease_unit_assignments%ROWTYPE;
  v_receivable public.receivable_items%ROWTYPE;
  v_payload jsonb;
  v_prior_payload jsonb;
  v_nested jsonb;
  v_conflict record;
  v_lease_id uuid;
  v_portfolio_id uuid;
  v_id uuid;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_seen_payloads jsonb := '[]'::jsonb;
  v_current_count integer;
  v_deleted_count integer;
  v_removed_ids uuid[] := ARRAY[]::uuid[];
  v_receivable_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF jsonb_typeof(p_lease) <> 'object' OR jsonb_typeof(p_tenants) <> 'array'
    OR jsonb_typeof(p_expected_assignments) <> 'array'
    OR jsonb_typeof(p_assignments) <> 'array'
    OR jsonb_typeof(p_expected_receivables) <> 'array'
    OR jsonb_typeof(p_removed_receivables) <> 'array'
    OR jsonb_typeof(p_new_receivables) <> 'array'
    OR jsonb_array_length(p_assignments) = 0
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Invalid lease assignment edit payload' USING ERRCODE = '22023';
  END IF;
  v_lease_id := (p_lease->>'id')::uuid;
  v_portfolio_id := (p_lease->>'portfolio_id')::uuid;
  SELECT * INTO v_lease FROM public.leases
  WHERE id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;
  IF v_lease.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Lease changed since it was opened. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  IF (p_lease->>'property_id')::uuid IS DISTINCT FROM v_lease.property_id THEN
    RAISE EXCEPTION 'A lease cannot be moved to another property after creation' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.lease_unit_assignments
  WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE;
  SELECT count(*) INTO v_current_count FROM public.lease_unit_assignments
  WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id;
  IF v_current_count <> jsonb_array_length(p_expected_assignments) THEN
    RAISE EXCEPTION 'Lease assignments changed since this form was loaded. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_expected_assignments) AS item(value) LOOP
    v_id := (v_payload->>'id')::uuid;
    IF v_id IS NULL OR v_id = ANY(v_seen_ids) OR NOT EXISTS (
      SELECT 1 FROM public.lease_unit_assignments AS item
      WHERE item.id = v_id AND item.lease_id = v_lease_id
        AND item.portfolio_id = v_portfolio_id
        AND item.updated_at IS NOT DISTINCT FROM (v_payload->>'updated_at')::timestamptz
    ) THEN
      RAISE EXCEPTION 'Lease assignments changed since this form was loaded. Reload and retry.' USING ERRCODE = '40001';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
  END LOOP;
  v_seen_ids := ARRAY[]::uuid[];

  -- Serialize assignments on each unit before checking overlap with other leases.
  FOR v_id IN
    SELECT DISTINCT (value->>'unit_id')::uuid
    FROM jsonb_array_elements(p_assignments) AS row(value)
    ORDER BY 1
  LOOP
    PERFORM 1 FROM public.units
    WHERE id = v_id AND portfolio_id = v_portfolio_id
      AND property_id = v_lease.property_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lease unit was not found or belongs to another property' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_assignments) AS item(value) LOOP
    IF jsonb_typeof(v_payload) <> 'object'
      OR (v_payload->>'id')::uuid IS NULL
      OR (v_payload->>'lease_id')::uuid IS DISTINCT FROM v_lease_id
      OR (v_payload->>'unit_id')::uuid IS NULL THEN
      RAISE EXCEPTION 'Lease assignment has an invalid id, lease, or unit' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_assignment FROM jsonb_populate_record(NULL::public.lease_unit_assignments, v_payload);
    IF v_assignment.start_date IS NULL
      OR (v_assignment.end_date IS NOT NULL AND v_assignment.end_date < v_assignment.start_date)
      OR v_assignment.rent_share < 0 OR v_assignment.charges_share < 0
      OR v_assignment.id = ANY(v_seen_ids)
      OR EXISTS (SELECT 1 FROM public.lease_unit_assignments AS other
        WHERE other.id = v_assignment.id AND other.lease_id <> v_lease_id) THEN
      RAISE EXCEPTION 'Lease assignment has an invalid date window, negative share, or duplicate id' USING ERRCODE = '22023';
    END IF;
    FOR v_prior_payload IN SELECT value FROM jsonb_array_elements(v_seen_payloads) AS prior(value) LOOP
      IF v_prior_payload->>'unit_id' = v_assignment.unit_id::text
        AND daterange((v_prior_payload->>'start_date')::date,
          (v_prior_payload->>'end_date')::date, '[)')
          && daterange(v_assignment.start_date, v_assignment.end_date, '[)') THEN
        RAISE EXCEPTION 'Lease assignments for the same unit overlap' USING ERRCODE = '23514';
      END IF;
    END LOOP;
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
      AND existing.lease_id <> v_lease_id
      AND other.lifecycle_stage NOT IN ('ended', 'terminated')
      AND bounds.other_start < coalesce(bounds.other_end, 'infinity'::date)
      AND bounds.proposed_start < coalesce(bounds.proposed_end, 'infinity'::date)
      AND bounds.other_start < coalesce(bounds.proposed_end, 'infinity'::date)
      AND bounds.proposed_start < coalesce(bounds.other_end, 'infinity'::date)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format(
        'Unit %s conflicts with lease %s (%s to %s) for proposed period %s to %s. %s',
        coalesce(nullif(v_conflict.unit_code, ''), v_assignment.unit_id::text),
        coalesce(nullif(v_conflict.lease_reference, ''), 'unknown'),
        v_conflict.start_date, coalesce(v_conflict.end_date::text, 'open-ended'),
        v_conflict.proposed_start, coalesce(v_conflict.proposed_end::text, 'open-ended'),
        CASE WHEN v_conflict.end_date IS NULL THEN 'The conflicting assignment has no end date.'
          ELSE format('The unit is available from %s onward.', v_conflict.end_date) END
      ), ERRCODE = '23514';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_assignment.id);
    v_seen_payloads := v_seen_payloads || jsonb_build_array(v_payload);
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.lease_unit_assignments AS existing
    WHERE existing.lease_id = v_lease_id AND existing.portfolio_id = v_portfolio_id
      AND existing.id <> ALL(v_seen_ids)) THEN
    RAISE EXCEPTION 'Lease edit omitted an existing assignment' USING ERRCODE = '22023';
  END IF;
  IF p_schedule_from IS NULL THEN
    IF jsonb_array_length(p_expected_receivables) <> 0
      OR jsonb_array_length(p_removed_receivables) <> 0
      OR jsonb_array_length(p_new_receivables) <> 0 THEN
      RAISE EXCEPTION 'Schedule changes require an effective date' USING ERRCODE = '22023';
    END IF;
  ELSE
    PERFORM 1 FROM public.receivable_items
    WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id
      AND origin = 'lease-schedule' AND due_date >= p_schedule_from FOR UPDATE;
    SELECT count(*) INTO v_current_count FROM public.receivable_items
    WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id
      AND origin = 'lease-schedule' AND due_date >= p_schedule_from;
    IF v_current_count <> jsonb_array_length(p_expected_receivables) THEN
      RAISE EXCEPTION 'Lease receivables changed since this form was loaded. Reload and retry.' USING ERRCODE = '40001';
    END IF;
    v_seen_ids := ARRAY[]::uuid[];
    FOR v_payload IN SELECT value FROM jsonb_array_elements(p_expected_receivables) AS item(value) LOOP
      v_id := (v_payload->>'id')::uuid;
      IF v_id IS NULL OR v_id = ANY(v_seen_ids) OR NOT EXISTS (
        SELECT 1 FROM public.receivable_items AS item
        WHERE item.id = v_id AND item.lease_id = v_lease_id
          AND item.portfolio_id = v_portfolio_id
          AND item.origin = 'lease-schedule' AND item.due_date >= p_schedule_from
          AND item.updated_at IS NOT DISTINCT FROM (v_payload->>'updated_at')::timestamptz
      ) THEN
        RAISE EXCEPTION 'Lease receivables changed since this form was loaded. Reload and retry.' USING ERRCODE = '40001';
      END IF;
      v_seen_ids := array_append(v_seen_ids, v_id);
    END LOOP;
  END IF;

  SELECT r.id, u.unit_code, r.due_date INTO v_conflict
  FROM public.receivable_items AS r
  JOIN public.units AS u ON u.id = r.unit_id
  WHERE r.lease_id = v_lease_id AND r.portfolio_id = v_portfolio_id
    AND r.origin = 'lease-schedule' AND r.status <> 'cancelled'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_removed_receivables) AS removed(value)
      WHERE (removed.value->>'id')::uuid = r.id
    )
    AND EXISTS (
      SELECT 1 FROM public.lease_unit_assignments AS current_assignment
      WHERE current_assignment.lease_id = v_lease_id
        AND current_assignment.unit_id = r.unit_id
        AND current_assignment.start_date <= coalesce(r.cycle_end_date,
          (date_trunc('month', r.due_date) + interval '1 month - 1 day')::date)
        AND (current_assignment.end_date IS NULL
          OR current_assignment.end_date >= date_trunc('month', r.due_date)::date)
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_assignments) AS proposed(value)
      WHERE (proposed.value->>'unit_id')::uuid = r.unit_id
        AND (proposed.value->>'start_date')::date <= coalesce(r.cycle_end_date,
          (date_trunc('month', r.due_date) + interval '1 month - 1 day')::date)
        AND ((proposed.value->>'end_date')::date IS NULL
          OR (proposed.value->>'end_date')::date >= date_trunc('month', r.due_date)::date)
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Unit %s cannot be detached from existing lease receivable due %s. Keep its billing period covered or review the receivable first.',
      v_conflict.unit_code, v_conflict.due_date USING ERRCODE = '23514';
  END IF;

  v_nested := public.save_lease_with_tenant_statuses(
    p_lease, p_tenants, p_expected_updated_at, NULL, NULL
  );
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_assignments) AS item(value) LOOP
    INSERT INTO public.lease_unit_assignments
      (id, portfolio_id, lease_id, unit_id, start_date, end_date, rent_share, charges_share, notes)
    VALUES (
      (v_payload->>'id')::uuid, v_portfolio_id, v_lease_id,
      (v_payload->>'unit_id')::uuid, (v_payload->>'start_date')::date,
      (v_payload->>'end_date')::date, (v_payload->>'rent_share')::numeric,
      (v_payload->>'charges_share')::numeric, coalesce(v_payload->>'notes', '')
    ) ON CONFLICT (id) DO UPDATE SET
      unit_id = EXCLUDED.unit_id, start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date, rent_share = EXCLUDED.rent_share,
      charges_share = EXCLUDED.charges_share, notes = EXCLUDED.notes;
  END LOOP;
  v_seen_ids := ARRAY[]::uuid[];
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_removed_receivables) AS item(value) LOOP
    v_id := (v_payload->>'id')::uuid;
    IF v_id IS NULL OR v_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'Duplicate or missing removed receivable id' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
    SELECT * INTO v_receivable FROM public.receivable_items
    WHERE id = v_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND OR v_receivable.lease_id IS DISTINCT FROM v_lease_id
      OR v_receivable.origin <> 'lease-schedule'
      OR v_receivable.status NOT IN ('open', 'overdue')
      OR v_receivable.allocated_amount <> 0
      OR v_receivable.due_date < p_schedule_from
      OR v_receivable.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz
      OR EXISTS (SELECT 1 FROM public.receipt_allocations WHERE receivable_item_id = v_id) THEN
      RAISE EXCEPTION 'A future receivable changed or has a payment. Reload and review.' USING ERRCODE = '40001';
    END IF;
    DELETE FROM public.receivable_items WHERE id = v_id AND portfolio_id = v_portfolio_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count <> 1 THEN
      RAISE EXCEPTION 'A future receivable could not be removed. Reload and retry.' USING ERRCODE = '40001';
    END IF;
    v_removed_ids := array_append(v_removed_ids, v_id);
  END LOOP;
  v_seen_ids := ARRAY[]::uuid[];
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_new_receivables) AS item(value) LOOP
    v_id := (v_payload->>'id')::uuid;
    IF v_id IS NULL OR v_id = ANY(v_seen_ids)
      OR (v_payload->>'lease_id')::uuid IS DISTINCT FROM v_lease_id
      OR (v_payload->>'property_id')::uuid IS DISTINCT FROM v_lease.property_id
      OR v_payload->>'origin' <> 'lease-schedule'
      OR v_payload->>'status' NOT IN ('open', 'overdue')
      OR (v_payload->>'allocated_amount')::numeric IS DISTINCT FROM 0
      OR (v_payload->>'outstanding_amount')::numeric IS DISTINCT FROM (v_payload->>'expected_amount')::numeric
      OR (v_payload->>'due_date')::date < p_schedule_from
      OR NOT EXISTS (SELECT 1 FROM public.units WHERE id = (v_payload->>'unit_id')::uuid
        AND portfolio_id = v_portfolio_id AND property_id = v_lease.property_id)
      OR NOT EXISTS (SELECT 1 FROM public.lease_unit_assignments AS assignment
        WHERE assignment.lease_id = v_lease_id
          AND assignment.unit_id = (v_payload->>'unit_id')::uuid
          AND assignment.start_date <= coalesce((v_payload->>'cycle_end_date')::date,
            (date_trunc('month', (v_payload->>'due_date')::date) + interval '1 month - 1 day')::date)
          AND (assignment.end_date IS NULL OR assignment.end_date >=
            date_trunc('month', (v_payload->>'due_date')::date)::date))
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_lease->'tenant_ids', '[]'::jsonb)) AS member(id)
        WHERE member.id::uuid = (v_payload->>'tenant_id')::uuid) THEN
      RAISE EXCEPTION 'Generated receivable has an invalid scope or date' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
    INSERT INTO public.receivable_items
    SELECT (jsonb_populate_record(
      NULL::public.receivable_items,
      v_payload || jsonb_build_object('portfolio_id', v_portfolio_id,
        'created_at', clock_timestamp(), 'updated_at', clock_timestamp())
    )).*;
    v_receivable_ids := array_append(v_receivable_ids, v_id);
  END LOOP;
  RETURN v_nested || jsonb_build_object('assignments', coalesce((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
    FROM public.lease_unit_assignments AS item
    WHERE item.lease_id = v_lease_id AND item.portfolio_id = v_portfolio_id
  ), '[]'::jsonb),
    'receivables', coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.receivable_items AS item WHERE item.id = ANY(v_receivable_ids)), '[]'::jsonb),
    'removed_receivable_ids', to_jsonb(v_removed_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.save_lease_with_assignments(jsonb, jsonb, timestamptz, jsonb, jsonb, date, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lease_with_assignments(jsonb, jsonb, timestamptz, jsonb, jsonb, date, jsonb, jsonb, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
