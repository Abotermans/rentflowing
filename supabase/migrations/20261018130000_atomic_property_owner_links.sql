-- Replace a property's owner links as one checked transaction. Direct writes
-- are removed from browser roles so concurrent replacements serialize on the
-- parent property row and cannot be bypassed by a stale tab.
CREATE OR REPLACE FUNCTION public.set_property_owner_links(
  p_property_id uuid,
  p_expected_links jsonb,
  p_desired_owner_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portfolio_id uuid;
  v_expected jsonb;
  v_id uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_current_count integer;
  v_distinct_count integer;
BEGIN
  IF p_property_id IS NULL OR jsonb_typeof(p_expected_links) IS DISTINCT FROM 'array'
    OR p_desired_owner_ids IS NULL OR array_position(p_desired_owner_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid property owner replacement payload' USING ERRCODE = '22023';
  END IF;

  SELECT portfolio_id INTO v_portfolio_id
  FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property was not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_portfolio_role(v_portfolio_id, auth.uid(),
    ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]) THEN
    RAISE EXCEPTION 'Property owner changes require a writer role' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.property_owner_links
  WHERE property_id = p_property_id FOR UPDATE;
  SELECT count(*) INTO v_current_count FROM public.property_owner_links
  WHERE property_id = p_property_id;
  IF v_current_count <> jsonb_array_length(p_expected_links) THEN
    RAISE EXCEPTION 'Property owners changed since this form was loaded. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  FOR v_expected IN SELECT value FROM jsonb_array_elements(p_expected_links) LOOP
    IF jsonb_typeof(v_expected) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid expected owner link' USING ERRCODE = '22023';
    END IF;
    v_id := (v_expected->>'id')::uuid;
    IF v_id IS NULL OR v_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Duplicate or missing expected owner link' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_id);
    IF NOT EXISTS (
      SELECT 1 FROM public.property_owner_links AS link
      WHERE link.id = v_id AND link.property_id = p_property_id
        AND link.portfolio_id = v_portfolio_id
        AND link.owner_id = (v_expected->>'owner_id')::uuid
        AND link.updated_at = (v_expected->>'updated_at')::timestamptz
    ) THEN
      RAISE EXCEPTION 'Property owners changed since this form was loaded. Reload and retry.' USING ERRCODE = '40001';
    END IF;
  END LOOP;

  SELECT count(DISTINCT owner_id) INTO v_distinct_count
  FROM unnest(p_desired_owner_ids) AS desired(owner_id);
  IF v_distinct_count <> cardinality(p_desired_owner_ids) THEN
    RAISE EXCEPTION 'Duplicate owner in desired links' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_desired_owner_ids) AS desired(owner_id)
    LEFT JOIN public.property_owners AS owner
      ON owner.id = desired.owner_id AND owner.portfolio_id = v_portfolio_id
    WHERE owner.id IS NULL
  ) THEN
    RAISE EXCEPTION 'An owner does not belong to this portfolio' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.property_owner_links
  WHERE property_id = p_property_id AND portfolio_id = v_portfolio_id
    AND NOT (owner_id = ANY(p_desired_owner_ids));
  INSERT INTO public.property_owner_links (portfolio_id, property_id, owner_id)
  SELECT v_portfolio_id, p_property_id, desired.owner_id
  FROM unnest(p_desired_owner_ids) AS desired(owner_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.property_owner_links AS link
    WHERE link.property_id = p_property_id AND link.owner_id = desired.owner_id
  );

  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(link) ORDER BY link.id)
    FROM public.property_owner_links AS link
    WHERE link.property_id = p_property_id AND link.portfolio_id = v_portfolio_id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.set_property_owner_links(uuid, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_property_owner_links(uuid, jsonb, uuid[]) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.property_owner_links FROM authenticated;
NOTIFY pgrst, 'reload schema';
