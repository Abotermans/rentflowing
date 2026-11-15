-- Delete only an unencumbered lease, then reconcile its tenants atomically.
CREATE OR REPLACE FUNCTION public.delete_lease_atomically(
  p_lease_id uuid,
  p_portfolio_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_tenant_id uuid;
  v_tenant_ids uuid[] := ARRAY[]::uuid[];
  v_tenant_status text;
BEGIN
  IF p_lease_id IS NULL OR p_portfolio_id IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Lease id, portfolio and version are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(
    p_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Lease deletion is not permitted' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_lease FROM public.leases
  WHERE id = p_lease_id AND portfolio_id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;
  IF v_lease.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Lease changed since it was opened. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  IF v_lease.notice_given OR v_lease.move_in_actual_date IS NOT NULL
    OR v_lease.move_out_actual_date IS NOT NULL THEN
    RAISE EXCEPTION 'A lease with notice or completed occupancy cannot be deleted; end it instead'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.receivable_items
      WHERE lease_id = p_lease_id AND portfolio_id = p_portfolio_id)
    OR EXISTS (SELECT 1 FROM public.cash_receipts
      WHERE lease_id = p_lease_id AND portfolio_id = p_portfolio_id)
    OR EXISTS (SELECT 1 FROM public.guarantees
      WHERE lease_id = p_lease_id AND portfolio_id = p_portfolio_id)
    OR EXISTS (SELECT 1 FROM public.charges_reconciliations
      WHERE lease_id = p_lease_id AND portfolio_id = p_portfolio_id) THEN
    RAISE EXCEPTION 'A lease with financial records cannot be deleted; end it instead'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lease_documents
      WHERE lease_id = p_lease_id AND portfolio_id = p_portfolio_id) THEN
    RAISE EXCEPTION 'Remove the lease documents before deleting this lease'
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(array_agg(DISTINCT member.id::uuid), ARRAY[]::uuid[])
    INTO v_tenant_ids
  FROM jsonb_array_elements_text(coalesce(v_lease.tenant_ids, '[]'::jsonb)) AS member(id);
  FOREACH v_tenant_id IN ARRAY v_tenant_ids LOOP
    PERFORM 1 FROM public.tenants
    WHERE id = v_tenant_id AND portfolio_id = p_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked tenant was not found or is not accessible' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;
  DELETE FROM public.leases
  WHERE id = p_lease_id AND portfolio_id = p_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease deletion was denied' USING ERRCODE = '42501';
  END IF;

  FOREACH v_tenant_id IN ARRAY v_tenant_ids LOOP
    SELECT CASE
      WHEN bool_or(linked.lifecycle_stage = 'active') THEN 'active'
      WHEN bool_or(linked.lifecycle_stage IN ('draft', 'pending-signature', 'signed')) THEN 'applicant'
      WHEN count(*) > 0 THEN 'former'
      ELSE 'applicant'
    END INTO v_tenant_status
    FROM public.leases AS linked
    WHERE linked.portfolio_id = p_portfolio_id
      AND linked.tenant_ids @> jsonb_build_array(v_tenant_id::text);
    UPDATE public.tenants SET status = v_tenant_status
    WHERE id = v_tenant_id AND portfolio_id = p_portfolio_id
      AND status IS DISTINCT FROM v_tenant_status;
  END LOOP;

  RETURN jsonb_build_object(
    'lease_id', p_lease_id,
    'tenants', coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.tenants AS item WHERE item.id = ANY(v_tenant_ids)
        AND item.portfolio_id = p_portfolio_id), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_lease_atomically(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_lease_atomically(uuid, uuid, timestamptz) TO authenticated;
REVOKE DELETE ON public.leases FROM authenticated;
NOTIFY pgrst, 'reload schema';
