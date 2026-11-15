-- A rule and its manual shares are one configuration change.
CREATE OR REPLACE FUNCTION public.save_allocation_rule_with_shares(
  p_rule jsonb,
  p_shares jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_rule public.allocation_rules%ROWTYPE;
  v_prior public.allocation_rules%ROWTYPE;
  v_payload jsonb;
  v_rule_id uuid;
  v_portfolio_id uuid;
  v_property_id uuid;
  v_unit_id uuid;
  v_share_ids uuid[] := ARRAY[]::uuid[];
  v_unit_ids uuid[] := ARRAY[]::uuid[];
  v_total numeric := 0;
  v_old_count integer;
  v_deleted_count integer;
BEGIN
  IF jsonb_typeof(p_rule) <> 'object' OR jsonb_typeof(p_shares) <> 'array' THEN
    RAISE EXCEPTION 'Allocation rule and shares have invalid shapes' USING ERRCODE = '22023';
  END IF;
  v_rule_id := (p_rule->>'id')::uuid;
  v_portfolio_id := (p_rule->>'portfolio_id')::uuid;
  v_property_id := (p_rule->>'property_id')::uuid;
  IF v_rule_id IS NULL OR v_portfolio_id IS NULL OR v_property_id IS NULL
    OR nullif(trim(p_rule->>'name'), '') IS NULL
    OR p_rule->>'method' NOT IN ('equal', 'surface-area', 'manual-percentage', 'millieme') THEN
    RAISE EXCEPTION 'Allocation rule requires an id, property, name, and valid method' USING ERRCODE = '22023';
  END IF;
  IF (p_rule->>'method' = 'manual-percentage') IS DISTINCT FROM (jsonb_array_length(p_shares) > 0) THEN
    RAISE EXCEPTION 'Manual rules require shares; other methods cannot retain manual shares' USING ERRCODE = '22023';
  END IF;

  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_shares) AS row(value) LOOP
    v_unit_id := (v_payload->>'unit_id')::uuid;
    IF jsonb_typeof(v_payload) <> 'object'
      OR (v_payload->>'id')::uuid IS NULL
      OR (v_payload->>'allocation_rule_id')::uuid IS DISTINCT FROM v_rule_id
      OR v_unit_id IS NULL
      OR (v_payload->>'percentage_share')::numeric IS NULL
      OR (v_payload->>'percentage_share')::numeric < 0
      OR (v_payload->>'percentage_share')::numeric > 100
      OR (v_payload->>'fixed_amount_share') IS NOT NULL
      OR (v_payload->>'coefficient') IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.units
        WHERE id = v_unit_id AND portfolio_id = v_portfolio_id AND property_id = v_property_id
      ) THEN
      RAISE EXCEPTION 'Manual allocation share has an invalid unit, rule, or percentage' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + (v_payload->>'percentage_share')::numeric;
    v_share_ids := array_append(v_share_ids, (v_payload->>'id')::uuid);
    v_unit_ids := array_append(v_unit_ids, v_unit_id);
  END LOOP;
  IF p_rule->>'method' = 'manual-percentage' AND abs(v_total - 100) > 0.01 THEN
    RAISE EXCEPTION 'Manual allocation shares must total 100 percent' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_unit_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_unit_ids) AS selected(id))
    OR cardinality(v_share_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_share_ids) AS selected(id)) THEN
    RAISE EXCEPTION 'Manual allocation shares require unique units and ids' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    SELECT * INTO v_rule FROM jsonb_populate_record(
      NULL::public.allocation_rules,
      p_rule || jsonb_build_object('created_at', clock_timestamp(), 'updated_at', clock_timestamp())
    );
    INSERT INTO public.allocation_rules SELECT (v_rule).* RETURNING * INTO v_rule;
  ELSE
    SELECT * INTO v_prior FROM public.allocation_rules
    WHERE id = v_rule_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Allocation rule was not found or is not accessible' USING ERRCODE = 'P0002';
    END IF;
    IF v_prior.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Allocation rule changed since it was opened. Reload and try again.' USING ERRCODE = '40001';
    END IF;
    IF v_prior.property_id IS DISTINCT FROM v_property_id AND EXISTS (
      SELECT 1 FROM public.cost_entries WHERE allocation_rule_id = v_rule_id
    ) THEN
      RAISE EXCEPTION 'Cannot move a rule used by cost entries to another property' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO v_old_count FROM public.allocation_rule_unit_shares
    WHERE allocation_rule_id = v_rule_id AND portfolio_id = v_portfolio_id;
    DELETE FROM public.allocation_rule_unit_shares
    WHERE allocation_rule_id = v_rule_id AND portfolio_id = v_portfolio_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count <> v_old_count THEN
      RAISE EXCEPTION 'Existing shares could not all be replaced' USING ERRCODE = '42501';
    END IF;
    UPDATE public.allocation_rules SET
      property_id = v_property_id,
      name = p_rule->>'name',
      method = p_rule->>'method',
      apply_only_to_occupied_units = (p_rule->>'apply_only_to_occupied_units')::boolean,
      include_unavailable_units = (p_rule->>'include_unavailable_units')::boolean,
      share_key = p_rule->>'share_key',
      millieme_allocation_mode = coalesce(p_rule->>'millieme_allocation_mode', 'normalized'),
      notes = coalesce(p_rule->>'notes', '')
    WHERE id = v_rule_id AND portfolio_id = v_portfolio_id
    RETURNING * INTO v_rule;
  END IF;

  INSERT INTO public.allocation_rule_unit_shares
  SELECT (jsonb_populate_record(
    NULL::public.allocation_rule_unit_shares,
    item.value || jsonb_build_object(
      'portfolio_id', v_portfolio_id,
      'created_at', clock_timestamp(),
      'updated_at', clock_timestamp()
    )
  )).*
  FROM jsonb_array_elements(p_shares) AS item(value);

  RETURN jsonb_build_object(
    'rule', to_jsonb(v_rule),
    'shares', coalesce((
      SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.allocation_rule_unit_shares AS item WHERE item.id = ANY(v_share_ids)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_allocation_rule_with_shares(jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_allocation_rule_with_shares(jsonb, jsonb, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
