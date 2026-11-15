-- The closure routine uses CURRENT_DATE for its end-date and occupancy checks.
-- Run it in the property's calendar day, then restore the caller's time zone.
CREATE OR REPLACE FUNCTION public.client_close_lease_atomically(
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
  v_current_lease public.leases%ROWTYPE;
  v_property_time_zone text;
  v_previous_time_zone text;
  v_result jsonb;
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

  SELECT * INTO v_current_lease FROM public.leases
  WHERE id = (p_lease->>'id')::uuid AND portfolio_id = v_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found in this portfolio' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_lease) AS supplied(key, value)
    WHERE supplied.key NOT IN (
      'lifecycle_stage', 'end_date', 'end_reason', 'termination_reason',
      'move_out_actual_date', 'notes'
    )
      AND supplied.value IS DISTINCT FROM to_jsonb(v_current_lease)->supplied.key
  ) THEN
    RAISE EXCEPTION 'Lease closure cannot change non-closure terms'
      USING ERRCODE = '22023';
  END IF;

  SELECT property.time_zone INTO v_property_time_zone
  FROM public.properties AS property
  WHERE property.id = v_current_lease.property_id
    AND property.portfolio_id = v_portfolio_id;
  IF v_property_time_zone IS NULL THEN
    RAISE EXCEPTION 'Lease property was not found' USING ERRCODE = 'P0002';
  END IF;

  v_previous_time_zone := current_setting('TimeZone');
  PERFORM set_config('TimeZone', v_property_time_zone, true);
  v_result := public.close_lease_atomically(
    p_lease, p_expected_updated_at, p_vacancy_date, p_free_units, p_reason, p_notes
  );
  PERFORM set_config('TimeZone', v_previous_time_zone, true);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.client_close_lease_atomically(
  jsonb, timestamptz, date, boolean, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_close_lease_atomically(
  jsonb, timestamptz, date, boolean, text, text
) TO authenticated;

-- A signed initial contract can be downgraded only while the lease has not
-- started in the property's calendar, regardless of the API server's zone.
CREATE OR REPLACE FUNCTION public.apply_initial_contract_lease_transition(
  p_lease_id uuid,
  p_was_signed boolean,
  p_is_signed boolean,
  p_signed_date date,
  p_keep_lease_signed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_property_today date;
BEGIN
  SELECT * INTO v_lease FROM public.leases WHERE id = p_lease_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT (now() AT TIME ZONE property.time_zone)::date INTO v_property_today
  FROM public.properties AS property
  WHERE property.id = v_lease.property_id
    AND property.portfolio_id = v_lease.portfolio_id;
  IF v_property_today IS NULL THEN
    RAISE EXCEPTION 'Lease property was not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_is_signed AND v_lease.lifecycle_stage IN ('draft', 'pending-signature') THEN
    UPDATE public.leases SET lifecycle_stage = 'signed', signed_date = p_signed_date
    WHERE id = p_lease_id RETURNING * INTO v_lease;
  ELSIF p_was_signed AND NOT p_is_signed
    AND v_lease.lifecycle_stage = 'signed' AND v_lease.start_date > v_property_today THEN
    IF p_keep_lease_signed IS NULL THEN
      RAISE EXCEPTION 'Choose whether to keep the future lease signed'
        USING ERRCODE = '22023';
    END IF;
    IF NOT p_keep_lease_signed THEN
      UPDATE public.leases SET lifecycle_stage = 'pending-signature', signed_date = NULL
      WHERE id = p_lease_id RETURNING * INTO v_lease;
    END IF;
  END IF;
  RETURN to_jsonb(v_lease);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_initial_contract_lease_transition(
  uuid, boolean, boolean, date, boolean
) FROM PUBLIC, authenticated;

NOTIFY pgrst, 'reload schema';
