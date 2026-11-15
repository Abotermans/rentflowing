-- Reject precision that numeric(14,2) columns would otherwise round away.
CREATE FUNCTION public.validate_receipt_cent_payload(
  p_receipt jsonb, p_receivables jsonb, p_allocations jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_value jsonb;
  v_row jsonb;
  v_amount numeric;
BEGIN
  IF jsonb_typeof(p_receipt) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_receivables) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid receipt monetary payload' USING ERRCODE = '22023';
  END IF;

  FOR v_value IN SELECT value FROM (VALUES
    (p_receipt->'amount_received'), (p_receipt->'unmatched_amount')
  ) AS values_to_check(value) LOOP
    IF jsonb_typeof(v_value) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Receipt monetary payload must use exact cents' USING ERRCODE = '22023';
    END IF;
    v_amount := (v_value #>> '{}')::numeric;
    IF v_amount * 100 <> trunc(v_amount * 100) THEN
      RAISE EXCEPTION 'Receipt monetary payload must use exact cents' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_receivables) AS row(value) LOOP
    FOR v_value IN SELECT value FROM (VALUES
      (v_row->'allocated_amount'), (v_row->'outstanding_amount')
    ) AS values_to_check(value) LOOP
      IF jsonb_typeof(v_value) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Receipt monetary payload must use exact cents' USING ERRCODE = '22023';
      END IF;
      v_amount := (v_value #>> '{}')::numeric;
      IF v_amount * 100 <> trunc(v_amount * 100) THEN
        RAISE EXCEPTION 'Receipt monetary payload must use exact cents' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_allocations) AS row(value) LOOP
    v_value := v_row->'allocated_amount';
    IF jsonb_typeof(v_value) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Receipt monetary payload must use exact cents' USING ERRCODE = '22023';
    END IF;
    v_amount := (v_value #>> '{}')::numeric;
    IF v_amount * 100 <> trunc(v_amount * 100) THEN
      RAISE EXCEPTION 'Receipt monetary payload must use exact cents' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_receipt_cent_payload(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.client_save_receipt_allocations(
  p_receipt jsonb,
  p_receivables jsonb,
  p_allocations jsonb,
  p_expected_receipt_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portfolio_id uuid;
BEGIN
  IF jsonb_typeof(p_receipt) <> 'object' THEN
    RAISE EXCEPTION 'Invalid receipt payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_receipt->>'portfolio_id')::uuid;
  IF v_portfolio_id IS NULL OR NOT public.has_portfolio_role(
    v_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Receipt write is not permitted' USING ERRCODE = '42501';
  END IF;
  PERFORM public.validate_receipt_cent_payload(p_receipt, p_receivables, p_allocations);
  RETURN public.save_receipt_allocations(
    p_receipt, p_receivables, p_allocations, p_expected_receipt_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.client_save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
