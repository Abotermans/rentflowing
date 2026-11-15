-- Amendment status and change rows must only be written through scoped,
-- version-checked transactions. Service-role scheduled work retains the
-- original atomic activation function.
REVOKE INSERT, UPDATE ON public.lease_amendments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.lease_amendment_changes FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.save_amendment_with_changes(jsonb, jsonb, timestamptz)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_amendment_with_schedule(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.close_lease_atomically(
  jsonb, timestamptz, date, boolean, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.activate_amendment_with_schedule(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) TO service_role;

CREATE FUNCTION public.client_save_amendment_with_changes(
  p_amendment jsonb,
  p_changes jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portfolio_id uuid;
BEGIN
  IF jsonb_typeof(p_amendment) <> 'object' THEN
    RAISE EXCEPTION 'Invalid amendment payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_amendment->>'portfolio_id')::uuid;
  IF v_portfolio_id IS NULL OR NOT public.has_portfolio_role(
    v_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Amendment write is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.save_amendment_with_changes(p_amendment, p_changes, p_expected_updated_at);
END;
$$;

CREATE FUNCTION public.client_activate_amendment_with_schedule(
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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portfolio_id uuid;
BEGIN
  IF jsonb_typeof(p_lease) <> 'object' THEN
    RAISE EXCEPTION 'Invalid lease payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_lease->>'portfolio_id')::uuid;
  IF v_portfolio_id IS NULL OR NOT public.has_portfolio_role(
    v_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Amendment activation is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.activate_amendment_with_schedule(
    p_target_amendment_id, p_lease, p_assignments, p_amendments,
    p_removed_receivables, p_new_receivables, p_tenants, p_expected_lease_updated_at
  );
END;
$$;

CREATE FUNCTION public.client_close_lease_atomically(
  p_lease jsonb,
  p_expected_updated_at timestamptz,
  p_vacancy_date date,
  p_free_units boolean DEFAULT true,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portfolio_id uuid;
BEGIN
  IF jsonb_typeof(p_lease) <> 'object' THEN
    RAISE EXCEPTION 'Invalid lease payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_lease->>'portfolio_id')::uuid;
  IF v_portfolio_id IS NULL OR NOT public.has_portfolio_role(
    v_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Lease closure is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.close_lease_atomically(
    p_lease, p_expected_updated_at, p_vacancy_date, p_free_units, p_reason, p_notes
  );
END;
$$;

CREATE FUNCTION public.change_amendment_status(
  p_amendment_id uuid,
  p_portfolio_id uuid,
  p_expected_updated_at timestamptz,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amendment public.lease_amendments%ROWTYPE;
BEGIN
  IF p_amendment_id IS NULL OR p_portfolio_id IS NULL
    OR p_expected_updated_at IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'Amendment, portfolio, version and status are required'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(
    p_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Amendment status change is not permitted' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_amendment FROM public.lease_amendments
  WHERE id = p_amendment_id AND portfolio_id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Amendment was not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_amendment.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Amendment changed since it was opened. Reload and retry.'
      USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (v_amendment.status = 'draft' AND p_status = 'scheduled') OR
    (v_amendment.status = 'scheduled' AND p_status = 'draft')
  ) THEN
    RAISE EXCEPTION 'Only draft and scheduled amendments can change status directly'
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.lease_amendments SET status = p_status
  WHERE id = p_amendment_id AND portfolio_id = p_portfolio_id
  RETURNING * INTO v_amendment;
  RETURN to_jsonb(v_amendment);
END;
$$;

REVOKE ALL ON FUNCTION public.client_save_amendment_with_changes(jsonb, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_activate_amendment_with_schedule(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_close_lease_atomically(
  jsonb, timestamptz, date, boolean, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_amendment_status(uuid, uuid, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_save_amendment_with_changes(jsonb, jsonb, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_activate_amendment_with_schedule(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_close_lease_atomically(
  jsonb, timestamptz, date, boolean, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_amendment_status(uuid, uuid, timestamptz, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
