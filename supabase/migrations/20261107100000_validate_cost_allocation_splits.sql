-- An informational cost still has a unit allocation, but neither party owes it.
-- Keep the existing atomic save and permission boundary while validating its
-- allocation totals before any row is written.
CREATE OR REPLACE FUNCTION public.save_cost_entry_with_allocations(
  p_entry jsonb,
  p_allocations jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_entry public.cost_entries%ROWTYPE;
  v_previous public.cost_entries%ROWTYPE;
  v_saved public.cost_entries%ROWTYPE;
  v_id uuid;
  v_portfolio_id uuid;
  v_property_id uuid;
  v_deleted integer;
  v_existing_count integer;
  v_allocated_total numeric;
  v_recoverable_total numeric;
  v_owned_budget numeric;
  v_owned_shares numeric;
  v_millieme_base integer;
  v_partially_owned boolean;
  v_absolute_mode boolean;
  v_share_key text;
BEGIN
  IF jsonb_typeof(p_entry) <> 'object' OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Cost entry and allocations must be an object and array' USING ERRCODE = '22023';
  END IF;

  v_id := (p_entry->>'id')::uuid;
  v_portfolio_id := (p_entry->>'portfolio_id')::uuid;
  v_property_id := (p_entry->>'property_id')::uuid;
  IF v_id IS NULL OR v_portfolio_id IS NULL OR v_property_id IS NULL THEN
    RAISE EXCEPTION 'Cost entry id, portfolio and property are required' USING ERRCODE = '22023';
  END IF;

  IF (p_entry->>'amount')::numeric IS NULL OR (p_entry->>'amount')::numeric <= 0 THEN
    RAISE EXCEPTION 'Cost amount must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_entry->>'recovery_type' NOT IN (
    'owner-only', 'tenant-recoverable', 'partially-recoverable', 'informational'
  ) OR p_entry->>'recovery_type' IS NULL THEN
    RAISE EXCEPTION 'Invalid cost recovery type' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
      OR (item.value->>'cost_entry_id')::uuid IS DISTINCT FROM v_id
      OR (item.value->>'property_id')::uuid IS DISTINCT FROM v_property_id
      OR (item.value->>'allocated_amount')::numeric IS NULL
      OR (item.value->>'allocated_amount')::numeric < 0
      OR (item.value->>'recoverable_amount')::numeric IS NULL
      OR (item.value->>'recoverable_amount')::numeric < 0
      OR (item.value->>'owner_burden_amount')::numeric IS NULL
      OR (item.value->>'owner_burden_amount')::numeric < 0
      OR item.value->>'recovery_type' IS DISTINCT FROM p_entry->>'recovery_type'
      OR (
        CASE p_entry->>'recovery_type'
          WHEN 'informational' THEN
            (item.value->>'recoverable_amount')::numeric <> 0
            OR (item.value->>'owner_burden_amount')::numeric <> 0
          WHEN 'owner-only' THEN
            (item.value->>'recoverable_amount')::numeric <> 0
            OR (item.value->>'owner_burden_amount')::numeric IS DISTINCT FROM
              (item.value->>'allocated_amount')::numeric
          WHEN 'tenant-recoverable' THEN
            (item.value->>'owner_burden_amount')::numeric <> 0
            OR (item.value->>'recoverable_amount')::numeric IS DISTINCT FROM
              (item.value->>'allocated_amount')::numeric
          ELSE
            (item.value->>'allocated_amount')::numeric IS DISTINCT FROM
            ((item.value->>'recoverable_amount')::numeric + (item.value->>'owner_burden_amount')::numeric)
        END
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.units AS unit
        WHERE unit.id = (item.value->>'unit_id')::uuid
          AND unit.property_id = v_property_id
          AND unit.portfolio_id = v_portfolio_id
      )
  ) THEN
    RAISE EXCEPTION 'Cost allocations must match the cost, property, unit and recovery split' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum((item.value->>'allocated_amount')::numeric), 0),
    coalesce(sum((item.value->>'recoverable_amount')::numeric), 0)
    INTO v_allocated_total, v_recoverable_total
  FROM jsonb_array_elements(p_allocations) AS item(value);
  IF p_entry->>'recovery_type' = 'partially-recoverable' AND
    v_recoverable_total IS DISTINCT FROM round(
      v_allocated_total * (p_entry->>'recoverable_percentage')::numeric / 100, 2
    ) THEN
    RAISE EXCEPTION 'Cost allocation recovery does not match the configured percentage' USING ERRCODE = '22023';
  END IF;

  SELECT is_partially_owned, millieme_base
    INTO v_partially_owned, v_millieme_base
  FROM public.properties
  WHERE id = v_property_id AND portfolio_id = v_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost property was not found' USING ERRCODE = 'P0002';
  END IF;
  v_owned_budget := (p_entry->>'amount')::numeric;
  IF v_partially_owned AND (p_entry->>'unit_id') IS NULL THEN
    SELECT method = 'millieme' AND millieme_allocation_mode = 'absolute',
      coalesce(nullif(share_key, ''), 'general')
      INTO v_absolute_mode, v_share_key
    FROM public.allocation_rules
    WHERE id = (p_entry->>'allocation_rule_id')::uuid
      AND property_id = v_property_id AND portfolio_id = v_portfolio_id;
    IF v_absolute_mode IS DISTINCT FROM true THEN
      v_share_key := 'general';
    END IF;
    SELECT coalesce(sum(CASE
      WHEN jsonb_typeof(unit.millieme_shares->v_share_key) = 'number'
        THEN greatest(0, (unit.millieme_shares->>v_share_key)::numeric)
      ELSE 0 END), 0)
      INTO v_owned_shares
    FROM public.units AS unit
    WHERE unit.property_id = v_property_id AND unit.portfolio_id = v_portfolio_id;
    v_owned_budget := round(
      v_owned_budget * least(1, v_owned_shares / greatest(1, v_millieme_base)), 2
    );
  END IF;
  IF v_allocated_total > v_owned_budget THEN
    RAISE EXCEPTION 'Cost allocations cannot exceed the owner-managed invoice share' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    SELECT * INTO v_entry FROM jsonb_populate_record(
      NULL::public.cost_entries,
      p_entry || jsonb_build_object(
        'created_at', clock_timestamp(),
        'updated_at', clock_timestamp(),
        'recognition_mode', coalesce(p_entry->>'recognition_mode', 'immediate')
      )
    );
    INSERT INTO public.cost_entries SELECT (v_entry).* RETURNING * INTO v_saved;
  ELSE
    SELECT * INTO v_previous FROM public.cost_entries
    WHERE id = v_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cost entry was not found or is not accessible' USING ERRCODE = 'P0002';
    END IF;
    IF v_previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Cost entry changed since it was opened. Reload and try again.' USING ERRCODE = '40001';
    END IF;

    SELECT * INTO v_entry FROM jsonb_populate_record(v_previous, p_entry);
    IF v_entry.id IS DISTINCT FROM v_previous.id
      OR v_entry.portfolio_id IS DISTINCT FROM v_previous.portfolio_id THEN
      RAISE EXCEPTION 'Cost entry identity and portfolio cannot change' USING ERRCODE = '22023';
    END IF;
    UPDATE public.cost_entries SET
      category_id = v_entry.category_id,
      property_id = v_entry.property_id,
      unit_id = v_entry.unit_id,
      allocation_rule_id = v_entry.allocation_rule_id,
      label = v_entry.label,
      description = v_entry.description,
      frequency = v_entry.frequency,
      start_date = v_entry.start_date,
      end_date = v_entry.end_date,
      amount = v_entry.amount,
      currency_code = v_entry.currency_code,
      recognition_mode = v_entry.recognition_mode,
      amortization_start_date = v_entry.amortization_start_date,
      amortization_end_date = v_entry.amortization_end_date,
      is_tax = v_entry.is_tax,
      recovery_type = v_entry.recovery_type,
      recoverable_percentage = v_entry.recoverable_percentage,
      vendor_name = v_entry.vendor_name,
      invoice_reference = v_entry.invoice_reference,
      status = v_entry.status,
      notes = v_entry.notes
    WHERE id = v_id AND portfolio_id = v_portfolio_id
    RETURNING * INTO v_saved;

    SELECT count(*) INTO v_existing_count FROM public.cost_allocation_results
    WHERE cost_entry_id = v_id;
    DELETE FROM public.cost_allocation_results WHERE cost_entry_id = v_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted <> v_existing_count THEN
      RAISE EXCEPTION 'Could not replace all prior cost allocations' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.cost_allocation_results
  SELECT (jsonb_populate_record(
    NULL::public.cost_allocation_results,
    item.value || jsonb_build_object(
      'portfolio_id', v_portfolio_id,
      'created_at', clock_timestamp(),
      'updated_at', clock_timestamp()
    )
  )).*
  FROM jsonb_array_elements(p_allocations) AS item(value);

  RETURN jsonb_build_object(
    'entry', to_jsonb(v_saved),
    'allocations', coalesce((
      SELECT jsonb_agg(to_jsonb(result) ORDER BY result.id)
      FROM public.cost_allocation_results AS result
      WHERE result.cost_entry_id = v_id
    ), '[]'::jsonb)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
