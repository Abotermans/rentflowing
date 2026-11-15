-- Apply the lease snapshot, assignment windows, amendment statuses and future
-- schedule in one transaction. The caller computes the business amounts; this
-- function checks freshness, scope and payment protection before writing.
CREATE OR REPLACE FUNCTION public.activate_amendment_with_schedule(
  p_target_amendment_id uuid,
  p_lease jsonb,
  p_assignments jsonb,
  p_amendments jsonb,
  p_removed_receivables jsonb,
  p_new_receivables jsonb,
  p_tenants jsonb,
  p_expected_lease_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_target public.lease_amendments%ROWTYPE;
  v_assignment public.lease_unit_assignments%ROWTYPE;
  v_amendment public.lease_amendments%ROWTYPE;
  v_receivable public.receivable_items%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_payload jsonb;
  v_lease_id uuid;
  v_portfolio_id uuid;
  v_property_id uuid;
  v_old_tenant_ids jsonb;
  v_id uuid;
  v_unit_id uuid;
  v_count integer;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_assignment_ids uuid[] := ARRAY[]::uuid[];
  v_amendment_ids uuid[] := ARRAY[]::uuid[];
  v_receivable_ids uuid[] := ARRAY[]::uuid[];
  v_removed_ids uuid[] := ARRAY[]::uuid[];
  v_tenant_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF jsonb_typeof(p_lease) <> 'object'
    OR jsonb_typeof(p_assignments) <> 'array'
    OR jsonb_typeof(p_amendments) <> 'array'
    OR jsonb_typeof(p_removed_receivables) <> 'array'
    OR jsonb_typeof(p_new_receivables) <> 'array'
    OR jsonb_typeof(p_tenants) <> 'array'
    OR p_expected_lease_updated_at IS NULL THEN
    RAISE EXCEPTION 'Invalid amendment activation payload' USING ERRCODE = '22023';
  END IF;
  v_lease_id := (p_lease->>'id')::uuid;
  v_portfolio_id := (p_lease->>'portfolio_id')::uuid;
  v_property_id := (p_lease->>'property_id')::uuid;
  IF v_lease_id IS NULL OR v_portfolio_id IS NULL OR v_property_id IS NULL
    OR p_target_amendment_id IS NULL THEN
    RAISE EXCEPTION 'Lease, property and amendment are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lease FROM public.leases
  WHERE id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE;
  IF NOT FOUND OR v_lease.property_id IS DISTINCT FROM v_property_id THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;
  IF v_lease.updated_at IS DISTINCT FROM p_expected_lease_updated_at THEN
    RAISE EXCEPTION 'Lease changed since activation was prepared. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  v_old_tenant_ids := v_lease.tenant_ids;
  SELECT * INTO v_target FROM public.lease_amendments
  WHERE id = p_target_amendment_id AND lease_id = v_lease_id
    AND portfolio_id = v_portfolio_id FOR UPDATE;
  IF NOT FOUND OR v_target.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Only a draft or scheduled amendment can be activated' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_amendments) AS item(value)
    WHERE (item.value->>'id')::uuid = p_target_amendment_id
      AND item.value->>'status' = 'active'
  ) THEN
    RAISE EXCEPTION 'Activation must include the target amendment' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lease_amendments AS prior
    WHERE prior.lease_id = v_lease_id AND prior.portfolio_id = v_portfolio_id
      AND prior.id <> p_target_amendment_id AND prior.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_amendments) AS item(value)
        WHERE (item.value->>'id')::uuid = prior.id AND item.value->>'status' = 'ended'
      )
  ) THEN
    RAISE EXCEPTION 'All previous active amendments must end in the same transaction' USING ERRCODE = '40001';
  END IF;

  -- Serialize conflicting lease creations/activations by unit, matching the
  -- unit-lock protocol in create_lease_with_schedule.
  FOR v_unit_id IN
    SELECT DISTINCT (item.value->>'unit_id')::uuid
    FROM jsonb_array_elements(p_assignments) AS item(value)
    ORDER BY 1
  LOOP
    PERFORM 1 FROM public.units
    WHERE id = v_unit_id AND portfolio_id = v_portfolio_id
      AND property_id = v_property_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assignment unit was not found or belongs to another property' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_assignments) AS item(value) LOOP
    v_id := (v_payload->>'id')::uuid;
    v_unit_id := (v_payload->>'unit_id')::uuid;
    IF jsonb_typeof(v_payload) <> 'object' OR v_id IS NULL OR v_unit_id IS NULL
      OR (v_payload->>'lease_id')::uuid IS DISTINCT FROM v_lease_id
      OR (v_payload->>'portfolio_id')::uuid IS DISTINCT FROM v_portfolio_id
      OR (v_payload->>'start_date')::date IS NULL
      OR ((v_payload->>'end_date')::date IS NOT NULL AND
          (v_payload->>'end_date')::date < (v_payload->>'start_date')::date)
      OR v_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'Assignment has an invalid scope, date window or duplicate id' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
    IF EXISTS (
      SELECT 1 FROM public.lease_unit_assignments AS existing
      JOIN public.leases AS other ON other.id = existing.lease_id
      CROSS JOIN LATERAL (
        SELECT greatest(existing.start_date, other.start_date) AS other_start,
          least(existing.end_date, other.end_date, other.move_out_actual_date) AS other_end,
          greatest((v_payload->>'start_date')::date, (p_lease->>'start_date')::date) AS proposed_start,
          least((v_payload->>'end_date')::date, (p_lease->>'end_date')::date,
            (p_lease->>'move_out_actual_date')::date) AS proposed_end
      ) AS bounds
      WHERE existing.unit_id = v_unit_id AND existing.lease_id <> v_lease_id
        AND existing.portfolio_id = v_portfolio_id
        AND other.lifecycle_stage NOT IN ('ended', 'terminated')
        AND bounds.other_start < coalesce(bounds.other_end, 'infinity'::date)
        AND bounds.proposed_start < coalesce(bounds.proposed_end, 'infinity'::date)
        AND bounds.other_start < coalesce(bounds.proposed_end, 'infinity'::date)
        AND bounds.proposed_start < coalesce(bounds.other_end, 'infinity'::date)
    ) THEN
      RAISE EXCEPTION 'Unit assignment conflicts with another lease in this date window' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_assignment FROM public.lease_unit_assignments
    WHERE id = v_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF FOUND THEN
      IF v_assignment.lease_id IS DISTINCT FROM v_lease_id
        OR v_assignment.unit_id IS DISTINCT FROM v_unit_id
        OR v_assignment.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz THEN
        RAISE EXCEPTION 'Assignment changed since activation was prepared. Reload and retry.' USING ERRCODE = '40001';
      END IF;
      UPDATE public.lease_unit_assignments SET
        start_date = (v_payload->>'start_date')::date,
        end_date = (v_payload->>'end_date')::date,
        rent_share = (v_payload->>'rent_share')::numeric,
        charges_share = (v_payload->>'charges_share')::numeric,
        notes = coalesce(v_payload->>'notes', '')
      WHERE id = v_id AND portfolio_id = v_portfolio_id;
    ELSE
      IF v_payload->>'expected_updated_at' IS NOT NULL THEN
        RAISE EXCEPTION 'Expected an existing assignment' USING ERRCODE = '40001';
      END IF;
      INSERT INTO public.lease_unit_assignments
      SELECT (jsonb_populate_record(
        NULL::public.lease_unit_assignments,
        (v_payload - 'expected_updated_at') || jsonb_build_object(
          'created_at', clock_timestamp(), 'updated_at', clock_timestamp()
        )
      )).*;
    END IF;
    v_assignment_ids := array_append(v_assignment_ids, v_id);
  END LOOP;

  v_seen_ids := ARRAY[]::uuid[];
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_amendments) AS item(value) LOOP
    v_id := (v_payload->>'id')::uuid;
    IF v_id IS NULL OR v_id = ANY(v_seen_ids)
      OR (v_payload->>'portfolio_id')::uuid IS DISTINCT FROM v_portfolio_id
      OR (v_payload->>'lease_id')::uuid IS DISTINCT FROM v_lease_id
      OR (v_id = p_target_amendment_id AND v_payload->>'status' <> 'active')
      OR (v_id <> p_target_amendment_id AND v_payload->>'status' <> 'ended') THEN
      RAISE EXCEPTION 'Invalid amendment status transition' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
    SELECT * INTO v_amendment FROM public.lease_amendments
    WHERE id = v_id AND lease_id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND OR v_amendment.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz
      OR (v_id <> p_target_amendment_id AND v_amendment.status <> 'active') THEN
      RAISE EXCEPTION 'Amendment changed since activation was prepared. Reload and retry.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.lease_amendments SET
      status = v_payload->>'status',
      supersedes_amendment_id = (v_payload->>'supersedes_amendment_id')::uuid
    WHERE id = v_id AND portfolio_id = v_portfolio_id;
    v_amendment_ids := array_append(v_amendment_ids, v_id);
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
      OR v_receivable.due_date < v_target.effective_date
      OR v_receivable.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz
      OR EXISTS (SELECT 1 FROM public.receipt_allocations WHERE receivable_item_id = v_id) THEN
      RAISE EXCEPTION 'A future receivable changed or has a payment. Reload and review.' USING ERRCODE = '40001';
    END IF;
    DELETE FROM public.receivable_items WHERE id = v_id AND portfolio_id = v_portfolio_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Future receivable could not be replaced' USING ERRCODE = '42501';
    END IF;
    v_removed_ids := array_append(v_removed_ids, v_id);
  END LOOP;

  v_seen_ids := ARRAY[]::uuid[];
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_new_receivables) AS item(value) LOOP
    v_id := (v_payload->>'id')::uuid;
    IF v_id IS NULL OR v_id = ANY(v_seen_ids)
      OR (v_payload->>'portfolio_id')::uuid IS DISTINCT FROM v_portfolio_id
      OR (v_payload->>'lease_id')::uuid IS DISTINCT FROM v_lease_id
      OR (v_payload->>'property_id')::uuid IS DISTINCT FROM v_property_id
      OR v_payload->>'origin' <> 'lease-schedule'
      OR v_payload->>'status' NOT IN ('open', 'overdue')
      OR (v_payload->>'allocated_amount')::numeric IS DISTINCT FROM 0
      OR (v_payload->>'outstanding_amount')::numeric IS DISTINCT FROM (v_payload->>'expected_amount')::numeric
      OR (v_payload->>'due_date')::date < v_target.effective_date
      OR NOT EXISTS (
        SELECT 1 FROM public.units
        WHERE id = (v_payload->>'unit_id')::uuid AND portfolio_id = v_portfolio_id
          AND property_id = v_property_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(p_lease->'tenant_ids', '[]'::jsonb)) AS member(id)
        WHERE member.id::uuid = (v_payload->>'tenant_id')::uuid
      ) THEN
      RAISE EXCEPTION 'Generated receivable has an invalid scope or date' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
    INSERT INTO public.receivable_items
    SELECT (jsonb_populate_record(
      NULL::public.receivable_items,
      v_payload || jsonb_build_object('created_at', clock_timestamp(), 'updated_at', clock_timestamp())
    )).*;
    v_receivable_ids := array_append(v_receivable_ids, v_id);
  END LOOP;

  UPDATE public.leases SET
    lifecycle_stage = p_lease->>'lifecycle_stage',
    end_reason = p_lease->>'end_reason',
    monthly_rent = (p_lease->>'monthly_rent')::numeric,
    monthly_charges = (p_lease->>'monthly_charges')::numeric,
    end_date = (p_lease->>'end_date')::date,
    deposit_or_guarantee_amount = (p_lease->>'deposit_or_guarantee_amount')::numeric,
    notice_period_text = p_lease->>'notice_period_text',
    rent_formula = (p_lease->>'rent_formula')::integer,
    indexation_enabled = (p_lease->>'indexation_enabled')::boolean,
    indexation_frequency = p_lease->>'indexation_frequency',
    indexation_base_date = (p_lease->>'indexation_base_date')::date,
    indexation_base_index = (p_lease->>'indexation_base_index')::numeric,
    indexation_current_index = (p_lease->>'indexation_current_index')::numeric,
    indexation_cap_percent = (p_lease->>'indexation_cap_percent')::numeric,
    indexation_rounding_mode = p_lease->>'indexation_rounding_mode',
    indexation_notes = coalesce(p_lease->>'indexation_notes', ''),
    has_advance_payment = (p_lease->>'has_advance_payment')::boolean,
    advance_payment_amount = (p_lease->>'advance_payment_amount')::numeric,
    advance_payment_date = (p_lease->>'advance_payment_date')::date,
    advance_allocation_method = p_lease->>'advance_allocation_method',
    advance_applied_to = p_lease->>'advance_applied_to',
    advance_allocation_start_date = (p_lease->>'advance_allocation_start_date')::date,
    advance_allocation_duration_months = (p_lease->>'advance_allocation_duration_months')::integer,
    fixed_monthly_reduction_amount = (p_lease->>'fixed_monthly_reduction_amount')::numeric,
    tenant_ids = p_lease->'tenant_ids',
    billing_tenant_id = (p_lease->>'billing_tenant_id')::uuid
  WHERE id = v_lease_id AND portfolio_id = v_portfolio_id
  RETURNING * INTO v_lease;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease update was denied' USING ERRCODE = '42501';
  END IF;

  v_seen_ids := ARRAY[]::uuid[];
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_tenants) AS item(value) LOOP
    v_id := (v_payload->>'id')::uuid;
    IF v_id IS NULL OR v_id = ANY(v_seen_ids)
      OR v_payload->>'status' NOT IN ('applicant', 'active', 'former')
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(v_old_tenant_ids, '[]'::jsonb)) AS member(id)
        WHERE member.id::uuid = v_id
        UNION ALL
        SELECT 1 FROM jsonb_array_elements_text(coalesce(p_lease->'tenant_ids', '[]'::jsonb)) AS member(id)
        WHERE member.id::uuid = v_id
      ) THEN
      RAISE EXCEPTION 'Invalid tenant status update' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);
    SELECT * INTO v_tenant FROM public.tenants
    WHERE id = v_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND OR v_tenant.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'Tenant changed since activation was prepared. Reload and retry.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.tenants SET status = v_payload->>'status'
    WHERE id = v_id AND portfolio_id = v_portfolio_id;
    v_tenant_ids := array_append(v_tenant_ids, v_id);
  END LOOP;

  RETURN jsonb_build_object(
    'lease', to_jsonb(v_lease),
    'assignments', coalesce((SELECT jsonb_agg(to_jsonb(item)) FROM public.lease_unit_assignments AS item WHERE item.id = ANY(v_assignment_ids)), '[]'::jsonb),
    'amendments', coalesce((SELECT jsonb_agg(to_jsonb(item)) FROM public.lease_amendments AS item WHERE item.id = ANY(v_amendment_ids)), '[]'::jsonb),
    'receivables', coalesce((SELECT jsonb_agg(to_jsonb(item)) FROM public.receivable_items AS item WHERE item.id = ANY(v_receivable_ids)), '[]'::jsonb),
    'removed_receivable_ids', to_jsonb(v_removed_ids),
    'tenants', coalesce((SELECT jsonb_agg(to_jsonb(item)) FROM public.tenants AS item WHERE item.id = ANY(v_tenant_ids)), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_amendment_with_schedule(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_amendment_with_schedule(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
