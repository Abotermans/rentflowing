-- Cost entries and their per-unit results must be saved together. Deleting an
-- entry remains a direct, scoped operation; its results cascade with it.
CREATE FUNCTION public.client_save_cost_entry_with_allocations(
  p_entry jsonb,
  p_allocations jsonb,
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
  IF jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'Invalid cost entry payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_entry->>'portfolio_id')::uuid;
  IF v_portfolio_id IS NULL OR NOT public.has_portfolio_role(
    v_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Cost entry save is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.save_cost_entry_with_allocations(
    p_entry, p_allocations, p_expected_updated_at
  );
END;
$$;

REVOKE INSERT, UPDATE ON public.cost_entries FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cost_allocation_results
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_cost_entry_with_allocations(jsonb, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_save_cost_entry_with_allocations(jsonb, jsonb, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_save_cost_entry_with_allocations(jsonb, jsonb, timestamptz)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
