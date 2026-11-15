-- Receivable removals must use scoped transactions or the lease-closure trigger.
-- The original invoker functions run under these role-checked wrappers so
-- revoking direct table DELETE does not interrupt legitimate workflows.
CREATE FUNCTION public.client_save_lease_with_assignments(
  p_lease jsonb,
  p_tenants jsonb,
  p_expected_updated_at timestamptz,
  p_expected_assignments jsonb,
  p_assignments jsonb,
  p_schedule_from date,
  p_expected_receivables jsonb,
  p_removed_receivables jsonb,
  p_new_receivables jsonb
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
    RAISE EXCEPTION 'Lease edit is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.save_lease_with_assignments(
    p_lease, p_tenants, p_expected_updated_at, p_expected_assignments,
    p_assignments, p_schedule_from, p_expected_receivables,
    p_removed_receivables, p_new_receivables
  );
END;
$$;

CREATE FUNCTION public.client_delete_charges_reconciliation(
  p_id uuid,
  p_portfolio_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_id IS NULL OR p_portfolio_id IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Reconciliation, portfolio and version are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(
    p_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Reconciliation deletion is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN public.delete_charges_reconciliation(p_id, p_portfolio_id, p_expected_updated_at);
END;
$$;

-- A lease UPDATE already passed its own RLS/role checks before this trigger
-- removes only unpaid future schedule rows. Its existing payment guard remains.
ALTER FUNCTION public.prune_future_closed_lease_receivables() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.prune_future_closed_lease_receivables()
  FROM PUBLIC, anon, authenticated;

REVOKE DELETE ON public.receivable_items FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON public.charges_reconciliations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_lease_with_assignments(
  jsonb, jsonb, timestamptz, jsonb, jsonb, date, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_charges_reconciliation(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_save_lease_with_assignments(
  jsonb, jsonb, timestamptz, jsonb, jsonb, date, jsonb, jsonb, jsonb
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_delete_charges_reconciliation(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_save_lease_with_assignments(
  jsonb, jsonb, timestamptz, jsonb, jsonb, date, jsonb, jsonb, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_delete_charges_reconciliation(
  uuid, uuid, timestamptz
) TO authenticated;

NOTIFY pgrst, 'reload schema';
