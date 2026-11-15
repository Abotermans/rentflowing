-- Manual shares must change with their parent rule in one transaction.
-- Deleting an unused rule remains a direct scoped operation; shares cascade.
CREATE FUNCTION public.client_save_allocation_rule_with_shares(
  p_rule jsonb,
  p_shares jsonb,
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
  IF jsonb_typeof(p_rule) <> 'object' THEN
    RAISE EXCEPTION 'Invalid allocation rule payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_rule->>'portfolio_id')::uuid;
  IF v_portfolio_id IS NULL OR NOT public.has_portfolio_role(
    v_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Allocation rule save is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.save_allocation_rule_with_shares(
    p_rule, p_shares, p_expected_updated_at
  );
END;
$$;

REVOKE INSERT, UPDATE ON public.allocation_rules FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.allocation_rule_unit_shares
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_allocation_rule_with_shares(jsonb, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_save_allocation_rule_with_shares(jsonb, jsonb, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_save_allocation_rule_with_shares(jsonb, jsonb, timestamptz)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
