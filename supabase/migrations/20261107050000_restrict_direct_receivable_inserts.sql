-- The scheduled job owns routine receivable creation. Interactive creation
-- remains possible only within the lease/reconciliation transactions.
CREATE FUNCTION public.client_create_lease_with_schedule(
  p_lease jsonb,
  p_assignments jsonb,
  p_receivables jsonb,
  p_tenants jsonb
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
    RAISE EXCEPTION 'Lease creation is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_lease_with_schedule(p_lease, p_assignments, p_receivables, p_tenants);
END;
$$;

CREATE FUNCTION public.client_create_charges_reconciliation(
  p_reconciliation jsonb,
  p_receivable jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portfolio_id uuid;
BEGIN
  IF jsonb_typeof(p_reconciliation) <> 'object' THEN
    RAISE EXCEPTION 'Invalid reconciliation payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_reconciliation->>'portfolio_id')::uuid;
  IF v_portfolio_id IS NULL OR NOT public.has_portfolio_role(
    v_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Reconciliation creation is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_charges_reconciliation(p_reconciliation, p_receivable);
END;
$$;

REVOKE INSERT ON public.receivable_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_lease_with_schedule(jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_charges_reconciliation(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_create_lease_with_schedule(jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_create_charges_reconciliation(jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_create_lease_with_schedule(jsonb, jsonb, jsonb, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_create_charges_reconciliation(jsonb, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
