-- A charges reconciliation and its adjustment receivable must commit together.
CREATE OR REPLACE FUNCTION public.create_charges_reconciliation(
  p_reconciliation jsonb,
  p_receivable jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_reconciliation public.charges_reconciliations%ROWTYPE;
  v_receivable public.receivable_items%ROWTYPE;
  v_portfolio_id uuid;
  v_lease_id uuid;
  v_property_id uuid;
  v_tenant_id uuid;
  v_delta numeric;
  v_resolution text;
  v_amount numeric;
BEGIN
  IF jsonb_typeof(p_reconciliation) <> 'object'
    OR (p_receivable IS NOT NULL AND jsonb_typeof(p_receivable) <> 'object') THEN
    RAISE EXCEPTION 'Invalid reconciliation payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_reconciliation->>'portfolio_id')::uuid;
  v_lease_id := (p_reconciliation->>'lease_id')::uuid;
  v_delta := (p_reconciliation->>'delta')::numeric;
  v_resolution := p_reconciliation->>'resolution';
  IF v_portfolio_id IS NULL OR v_lease_id IS NULL
    OR (p_reconciliation->>'id')::uuid IS NULL
    OR (p_reconciliation->>'period_start')::date IS NULL
    OR (p_reconciliation->>'period_end')::date IS NULL
    OR (p_reconciliation->>'period_start')::date > (p_reconciliation->>'period_end')::date
    OR v_delta IS NULL OR v_resolution IS NULL
    OR v_resolution NOT IN ('owe', 'refund', 'carry-forward', 'none')
    OR v_delta IS DISTINCT FROM round(
      (p_reconciliation->>'provisions_collected')::numeric -
      (p_reconciliation->>'actual_recoverable')::numeric, 2
    ) THEN
    RAISE EXCEPTION 'Invalid reconciliation fields' USING ERRCODE = '22023';
  END IF;
  SELECT property_id, billing_tenant_id INTO v_property_id, v_tenant_id
  FROM public.leases WHERE id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.charges_reconciliations
    WHERE lease_id = v_lease_id AND portfolio_id = v_portfolio_id
      AND period_start = (p_reconciliation->>'period_start')::date
      AND period_end = (p_reconciliation->>'period_end')::date
  ) THEN
    RAISE EXCEPTION 'This lease period has already been reconciled' USING ERRCODE = '23505';
  END IF;
  IF (v_resolution = 'none') IS DISTINCT FROM (p_receivable IS NULL)
    OR (p_reconciliation->>'receivable_item_id')::uuid IS DISTINCT FROM (p_receivable->>'id')::uuid THEN
    RAISE EXCEPTION 'Resolution and adjustment receivable do not match' USING ERRCODE = '22023';
  END IF;
  IF v_resolution = 'owe' AND v_delta > -0.01
    OR v_resolution IN ('refund', 'carry-forward') AND v_delta < 0.01 THEN
    RAISE EXCEPTION 'Resolution does not match the reconciliation balance' USING ERRCODE = '22023';
  END IF;
  IF p_receivable IS NOT NULL THEN
    v_amount := (p_receivable->>'expected_amount')::numeric;
    IF (p_receivable->>'portfolio_id')::uuid IS DISTINCT FROM v_portfolio_id
      OR (p_receivable->>'lease_id')::uuid IS DISTINCT FROM v_lease_id
      OR (p_receivable->>'property_id')::uuid IS DISTINCT FROM v_property_id
      OR (p_receivable->>'tenant_id')::uuid IS DISTINCT FROM v_tenant_id
      OR p_receivable->>'item_type' IS DISTINCT FROM 'charges-adjustment'
      OR p_receivable->>'origin' IS DISTINCT FROM 'adjustment'
      OR p_receivable->>'status' IS DISTINCT FROM 'open'
      OR (p_receivable->>'allocated_amount')::numeric IS DISTINCT FROM 0
      OR (p_receivable->>'outstanding_amount')::numeric IS DISTINCT FROM v_amount
      OR v_amount IS DISTINCT FROM -v_delta THEN
      RAISE EXCEPTION 'Adjustment receivable does not match the reconciliation' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_receivable FROM jsonb_populate_record(
      NULL::public.receivable_items,
      p_receivable || jsonb_build_object('created_at', clock_timestamp(), 'updated_at', clock_timestamp())
    );
    INSERT INTO public.receivable_items SELECT (v_receivable).* RETURNING * INTO v_receivable;
  END IF;
  SELECT * INTO v_reconciliation FROM jsonb_populate_record(
    NULL::public.charges_reconciliations,
    p_reconciliation || jsonb_build_object('created_at', clock_timestamp(), 'updated_at', clock_timestamp())
  );
  INSERT INTO public.charges_reconciliations SELECT (v_reconciliation).* RETURNING * INTO v_reconciliation;
  RETURN jsonb_build_object('reconciliation', to_jsonb(v_reconciliation), 'receivable', to_jsonb(v_receivable));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_charges_reconciliation(
  p_id uuid,
  p_portfolio_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_reconciliation public.charges_reconciliations%ROWTYPE;
  v_receivable public.receivable_items%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_reconciliation FROM public.charges_reconciliations
  WHERE id = p_id AND portfolio_id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;
  IF v_reconciliation.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Reconciliation changed since it was opened. Reload and try again.' USING ERRCODE = '40001';
  END IF;
  IF v_reconciliation.receivable_item_id IS NOT NULL THEN
    SELECT * INTO v_receivable FROM public.receivable_items
    WHERE id = v_reconciliation.receivable_item_id
      AND portfolio_id = p_portfolio_id AND lease_id = v_reconciliation.lease_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked adjustment receivable was not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_receivable.allocated_amount <> 0 OR v_receivable.status = 'paid'
      OR EXISTS (SELECT 1 FROM public.receipt_allocations
        WHERE receivable_item_id = v_receivable.id) THEN
      RAISE EXCEPTION 'reconciliation.deleteAllocated' USING ERRCODE = '23514';
    END IF;
  END IF;
  DELETE FROM public.charges_reconciliations WHERE id = p_id AND portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Reconciliation could not be deleted' USING ERRCODE = '42501';
  END IF;
  IF v_reconciliation.receivable_item_id IS NOT NULL THEN
    DELETE FROM public.receivable_items
    WHERE id = v_receivable.id AND portfolio_id = p_portfolio_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Adjustment receivable could not be deleted' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN jsonb_build_object('reconciliation_id', p_id, 'receivable_id', v_reconciliation.receivable_item_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_charges_reconciliation(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_charges_reconciliation(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_charges_reconciliation(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_charges_reconciliation(uuid, uuid, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
