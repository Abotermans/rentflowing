-- Save a property and its selected owners in one transaction. The owner-link
-- routine locks the property and verifies the caller's expected link snapshot.
CREATE OR REPLACE FUNCTION public.save_property_with_owners(
  p_property jsonb,
  p_owner_ids uuid[],
  p_expected_updated_at timestamptz,
  p_expected_links jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_portfolio_id uuid;
  v_property public.properties%ROWTYPE;
  v_links jsonb;
  v_key text;
  v_total numeric;
BEGIN
  IF jsonb_typeof(p_property) IS DISTINCT FROM 'object'
    OR p_owner_ids IS NULL OR jsonb_typeof(p_expected_links) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid property save payload' USING ERRCODE = '22023';
  END IF;
  v_id := (p_property->>'id')::uuid;
  v_portfolio_id := (p_property->>'portfolio_id')::uuid;
  IF v_id IS NULL OR v_portfolio_id IS NULL
    OR nullif(btrim(p_property->>'name'), '') IS NULL
    OR nullif(btrim(p_property->>'reference_code'), '') IS NULL THEN
    RAISE EXCEPTION 'Property id, portfolio, name and reference are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(v_portfolio_id, auth.uid(),
    ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]) THEN
    RAISE EXCEPTION 'Property changes require a writer role' USING ERRCODE = '42501';
  END IF;
  IF (p_property->>'millieme_base')::integer <= 0 THEN
    RAISE EXCEPTION 'Millieme base must be positive' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    IF jsonb_array_length(p_expected_links) <> 0 THEN
      RAISE EXCEPTION 'New property cannot have expected owner links' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.properties (
      id, portfolio_id, name, reference_code, address1, address2, city,
      postal_code, region_or_state, country_code, locale, currency_code,
      measurement_system, property_type, owner_name, description, status,
      millieme_base, millieme_keys, is_partially_owned
    ) VALUES (
      v_id, v_portfolio_id, btrim(p_property->>'name'), btrim(p_property->>'reference_code'),
      coalesce(p_property->>'address1', ''), coalesce(p_property->>'address2', ''),
      coalesce(p_property->>'city', ''), coalesce(p_property->>'postal_code', ''),
      coalesce(p_property->>'region_or_state', ''), coalesce(p_property->>'country_code', 'FR'),
      coalesce(p_property->>'locale', 'fr-FR'), coalesce(p_property->>'currency_code', 'EUR'),
      coalesce(p_property->>'measurement_system', 'metric'),
      coalesce(p_property->>'property_type', 'residential'),
      coalesce(p_property->>'owner_name', ''), coalesce(p_property->>'description', ''),
      coalesce(p_property->>'status', 'active'),
      coalesce((p_property->>'millieme_base')::integer, 1000),
      CASE WHEN jsonb_typeof(p_property->'millieme_keys') = 'array'
        AND jsonb_array_length(p_property->'millieme_keys') > 0
        THEN ARRAY(SELECT jsonb_array_elements_text(p_property->'millieme_keys'))
        ELSE ARRAY['general']::text[] END,
      coalesce((p_property->>'is_partially_owned')::boolean, false)
    ) RETURNING * INTO v_property;
  ELSE
    SELECT * INTO v_property FROM public.properties
    WHERE id = v_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Property was not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_property.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Property changed since this form was loaded. Reload and retry.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.properties SET
      name = btrim(p_property->>'name'),
      reference_code = btrim(p_property->>'reference_code'),
      address1 = coalesce(p_property->>'address1', ''),
      address2 = coalesce(p_property->>'address2', ''),
      city = coalesce(p_property->>'city', ''),
      postal_code = coalesce(p_property->>'postal_code', ''),
      region_or_state = coalesce(p_property->>'region_or_state', ''),
      country_code = coalesce(p_property->>'country_code', 'FR'),
      locale = coalesce(p_property->>'locale', 'fr-FR'),
      currency_code = coalesce(p_property->>'currency_code', 'EUR'),
      measurement_system = coalesce(p_property->>'measurement_system', 'metric'),
      property_type = coalesce(p_property->>'property_type', 'residential'),
      owner_name = coalesce(p_property->>'owner_name', ''),
      description = coalesce(p_property->>'description', ''),
      status = coalesce(p_property->>'status', 'active'),
      millieme_base = coalesce((p_property->>'millieme_base')::integer, 1000),
      millieme_keys = CASE WHEN jsonb_typeof(p_property->'millieme_keys') = 'array'
        AND jsonb_array_length(p_property->'millieme_keys') > 0
        THEN ARRAY(SELECT jsonb_array_elements_text(p_property->'millieme_keys'))
        ELSE ARRAY['general']::text[] END,
      is_partially_owned = coalesce((p_property->>'is_partially_owned')::boolean, false)
    WHERE id = v_id AND portfolio_id = v_portfolio_id
    RETURNING * INTO v_property;
  END IF;

  FOR v_key IN SELECT unnest(v_property.millieme_keys) LOOP
    SELECT coalesce(sum(CASE
      WHEN jsonb_typeof(u.millieme_shares->v_key) = 'number'
        AND (u.millieme_shares->>v_key)::numeric >= 0
      THEN (u.millieme_shares->>v_key)::numeric
      ELSE 0 END), 0)
    INTO v_total
    FROM public.units AS u
    WHERE u.property_id = v_id;
    IF v_total > v_property.millieme_base THEN
      RAISE EXCEPTION 'Unit millieme shares for key % total %, above property base %',
        v_key, v_total, v_property.millieme_base USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_links := public.set_property_owner_links(v_id, p_expected_links, p_owner_ids);
  RETURN jsonb_build_object('property', to_jsonb(v_property), 'links', v_links);
END;
$$;

REVOKE ALL ON FUNCTION public.save_property_with_owners(jsonb, uuid[], timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_property_with_owners(jsonb, uuid[], timestamptz, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
