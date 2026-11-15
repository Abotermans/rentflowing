-- Save an amendment and its structured changes in one transaction.
CREATE OR REPLACE FUNCTION public.save_amendment_with_changes(
  p_amendment jsonb,
  p_changes jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_amendment public.lease_amendments%ROWTYPE;
  v_prior public.lease_amendments%ROWTYPE;
  v_change public.lease_amendment_changes%ROWTYPE;
  v_payload jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_portfolio_id uuid;
  v_lease_id uuid;
  v_amendment_id uuid;
  v_number integer;
  v_old_count integer;
  v_deleted_count integer;
  v_change_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF jsonb_typeof(p_amendment) <> 'object' OR jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'Invalid amendment payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_amendment->>'portfolio_id')::uuid;
  v_lease_id := (p_amendment->>'lease_id')::uuid;
  v_amendment_id := (p_amendment->>'id')::uuid;
  IF v_portfolio_id IS NULL OR v_lease_id IS NULL OR v_amendment_id IS NULL
    OR (p_amendment->>'effective_date')::date IS NULL
    OR p_amendment->>'status' IS NULL
    OR p_amendment->>'status' NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Amendment requires a lease, effective date, and editable status' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leases
    WHERE id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_changes) AS row(value) LOOP
    IF jsonb_typeof(v_payload) <> 'object'
      OR (v_payload->>'id')::uuid IS NULL
      OR (v_payload->>'amendment_id')::uuid IS DISTINCT FROM v_amendment_id
      OR (v_payload->>'portfolio_id')::uuid IS DISTINCT FROM v_portfolio_id
      OR nullif(trim(v_payload->>'field_name'), '') IS NULL
      OR v_payload->>'change_type' IS NULL
      OR v_payload->>'change_type' NOT IN ('set', 'add', 'remove', 'replace') THEN
      RAISE EXCEPTION 'Amendment change has an invalid id, field, or scope' USING ERRCODE = '22023';
    END IF;
    v_change_ids := array_append(v_change_ids, (v_payload->>'id')::uuid);
  END LOOP;
  IF cardinality(v_change_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_change_ids) AS selected(id)) THEN
    RAISE EXCEPTION 'Amendment changes require unique ids' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    SELECT coalesce(max(amendment_number), 0) + 1 INTO v_number
    FROM public.lease_amendments WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id;
    SELECT * INTO v_amendment FROM jsonb_populate_record(
      NULL::public.lease_amendments,
      p_amendment || jsonb_build_object(
        'amendment_number', v_number,
        'created_at', clock_timestamp(), 'updated_at', clock_timestamp()
      )
    );
    INSERT INTO public.lease_amendments SELECT (v_amendment).* RETURNING * INTO v_amendment;
  ELSE
    SELECT * INTO v_prior FROM public.lease_amendments
    WHERE id = v_amendment_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND OR v_prior.lease_id IS DISTINCT FROM v_lease_id THEN
      RAISE EXCEPTION 'Amendment was not found or is not accessible' USING ERRCODE = 'P0002';
    END IF;
    IF v_prior.status NOT IN ('draft', 'scheduled') THEN
      RAISE EXCEPTION 'Only draft or scheduled amendments can be edited' USING ERRCODE = '23514';
    END IF;
    IF v_prior.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Amendment changed since it was opened. Reload and try again.' USING ERRCODE = '40001';
    END IF;
    SELECT count(*) INTO v_old_count FROM public.lease_amendment_changes
    WHERE amendment_id = v_amendment_id AND portfolio_id = v_portfolio_id;
    DELETE FROM public.lease_amendment_changes
    WHERE amendment_id = v_amendment_id AND portfolio_id = v_portfolio_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count <> v_old_count THEN
      RAISE EXCEPTION 'Existing amendment changes could not all be replaced' USING ERRCODE = '42501';
    END IF;
    UPDATE public.lease_amendments SET
      title = coalesce(p_amendment->>'title', ''),
      reason = coalesce(p_amendment->>'reason', ''),
      notes = coalesce(p_amendment->>'notes', ''),
      effective_date = (p_amendment->>'effective_date')::date,
      signed_date = (p_amendment->>'signed_date')::date,
      status = p_amendment->>'status',
      supersedes_amendment_id = (p_amendment->>'supersedes_amendment_id')::uuid
    WHERE id = v_amendment_id AND portfolio_id = v_portfolio_id
    RETURNING * INTO v_amendment;
  END IF;
  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_changes) AS row(value) LOOP
    SELECT * INTO v_change FROM jsonb_populate_record(
      NULL::public.lease_amendment_changes,
      v_payload || jsonb_build_object('created_at', clock_timestamp(), 'updated_at', clock_timestamp())
    );
    INSERT INTO public.lease_amendment_changes SELECT (v_change).* RETURNING * INTO v_change;
    v_changes := v_changes || jsonb_build_array(to_jsonb(v_change));
  END LOOP;
  RETURN jsonb_build_object('amendment', to_jsonb(v_amendment), 'changes', v_changes);
END;
$$;

REVOKE ALL ON FUNCTION public.save_amendment_with_changes(jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_amendment_with_changes(jsonb, jsonb, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
