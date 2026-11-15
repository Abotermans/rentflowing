-- Receipt, receivable balances, and their new allocation rows commit together.
CREATE OR REPLACE FUNCTION public.save_receipt_allocations(
  p_receipt jsonb,
  p_receivables jsonb,
  p_allocations jsonb,
  p_expected_receipt_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_receipt public.cash_receipts%ROWTYPE;
  v_prior_receipt public.cash_receipts%ROWTYPE;
  v_item public.receivable_items%ROWTYPE;
  v_saved_item public.receivable_items%ROWTYPE;
  v_receipt_id uuid;
  v_portfolio_id uuid;
  v_item_id uuid;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_allocation_ids uuid[] := ARRAY[]::uuid[];
  v_payload jsonb;
  v_total numeric(14,2) := 0;
  v_delta numeric(14,2);
  v_distinct_count integer;
BEGIN
  IF jsonb_typeof(p_receipt) <> 'object'
    OR jsonb_typeof(p_receivables) <> 'array'
    OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Receipt, receivables, and allocations have invalid shapes' USING ERRCODE = '22023';
  END IF;
  v_receipt_id := (p_receipt->>'id')::uuid;
  v_portfolio_id := (p_receipt->>'portfolio_id')::uuid;
  IF v_receipt_id IS NULL OR v_portfolio_id IS NULL THEN
    RAISE EXCEPTION 'Receipt id and portfolio are required' USING ERRCODE = '22023';
  END IF;

  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_allocations) AS row(value) LOOP
    IF jsonb_typeof(v_payload) <> 'object'
      OR (v_payload->>'cash_receipt_id')::uuid IS DISTINCT FROM v_receipt_id
      OR (v_payload->>'id')::uuid IS NULL
      OR (v_payload->>'receivable_item_id')::uuid IS NULL
      OR (v_payload->>'allocated_amount')::numeric IS NULL
      OR (v_payload->>'allocated_amount')::numeric <= 0 THEN
      RAISE EXCEPTION 'Receipt allocation has an invalid target or amount' USING ERRCODE = '22023';
    END IF;
    v_total := round(v_total + (v_payload->>'allocated_amount')::numeric, 2);
    v_allocation_ids := array_append(v_allocation_ids, (v_payload->>'id')::uuid);
  END LOOP;
  IF jsonb_array_length(p_allocations) <>
    (SELECT count(DISTINCT id) FROM unnest(v_allocation_ids) AS allocation(id)) THEN
    RAISE EXCEPTION 'Receipt allocation ids must be unique' USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT (value->>'receivable_item_id')::uuid) INTO v_distinct_count
  FROM jsonb_array_elements(p_allocations) AS row(value);
  IF jsonb_array_length(p_receivables) <> v_distinct_count
    OR (SELECT count(DISTINCT (value->>'id')::uuid)
        FROM jsonb_array_elements(p_receivables) AS row(value)) <> jsonb_array_length(p_receivables) THEN
    RAISE EXCEPTION 'Every allocated receivable must have exactly one balance update' USING ERRCODE = '22023';
  END IF;

  IF p_expected_receipt_updated_at IS NULL THEN
    SELECT * INTO v_receipt FROM jsonb_populate_record(
      NULL::public.cash_receipts,
      p_receipt || jsonb_build_object('created_at', clock_timestamp(), 'updated_at', clock_timestamp())
    );
    IF v_receipt.amount_received IS NULL OR v_receipt.amount_received <= 0
      OR v_receipt.unmatched_amount IS NULL
      OR v_receipt.unmatched_amount <> round(v_receipt.amount_received - v_total, 2) THEN
      RAISE EXCEPTION 'Receipt amount and allocated balance do not reconcile' USING ERRCODE = '22023';
    END IF;
    v_receipt.status := CASE
      WHEN v_receipt.unmatched_amount = 0 THEN 'matched'
      WHEN v_receipt.unmatched_amount < v_receipt.amount_received THEN 'partially-matched'
      ELSE 'unmatched' END;
    INSERT INTO public.cash_receipts SELECT (v_receipt).* RETURNING * INTO v_receipt;
  ELSE
    SELECT * INTO v_prior_receipt FROM public.cash_receipts
    WHERE id = v_receipt_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receipt was not found or is not accessible' USING ERRCODE = 'P0002';
    END IF;
    IF v_prior_receipt.updated_at IS DISTINCT FROM p_expected_receipt_updated_at THEN
      RAISE EXCEPTION 'Receipt changed since it was opened. Reload and try again.' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_receipt FROM jsonb_populate_record(v_prior_receipt, p_receipt);
    IF v_receipt.id IS DISTINCT FROM v_prior_receipt.id
      OR v_receipt.portfolio_id IS DISTINCT FROM v_prior_receipt.portfolio_id
      OR v_receipt.amount_received IS DISTINCT FROM v_prior_receipt.amount_received
      OR v_receipt.currency_code IS DISTINCT FROM v_prior_receipt.currency_code
      OR v_receipt.lease_id IS DISTINCT FROM v_prior_receipt.lease_id
      OR v_receipt.tenant_id IS DISTINCT FROM v_prior_receipt.tenant_id
      OR v_receipt.property_id IS DISTINCT FROM v_prior_receipt.property_id
      OR v_prior_receipt.status IN ('reversed', 'refunded', 'exception')
      OR v_receipt.unmatched_amount IS NULL
      OR v_receipt.unmatched_amount <> round(v_prior_receipt.unmatched_amount - v_total, 2) THEN
      RAISE EXCEPTION 'Receipt allocation conflicts with its saved balance or scope' USING ERRCODE = '22023';
    END IF;
    v_receipt.status := CASE
      WHEN v_receipt.unmatched_amount = 0 THEN 'matched'
      WHEN v_receipt.unmatched_amount < v_receipt.amount_received THEN 'partially-matched'
      ELSE 'unmatched' END;
    UPDATE public.cash_receipts SET
      unmatched_amount = v_receipt.unmatched_amount,
      status = v_receipt.status
    WHERE id = v_receipt_id AND portfolio_id = v_portfolio_id
    RETURNING * INTO v_receipt;
  END IF;

  IF v_receipt.unmatched_amount < 0 OR v_receipt.unmatched_amount > v_receipt.amount_received THEN
    RAISE EXCEPTION 'Receipt allocation exceeds its available amount' USING ERRCODE = '22023';
  END IF;

  FOR v_payload IN
    SELECT value FROM jsonb_array_elements(p_receivables) AS row(value)
    ORDER BY value->>'id'
  LOOP
    v_item_id := (v_payload->>'id')::uuid;
    SELECT * INTO v_item FROM public.receivable_items
    WHERE id = v_item_id AND portfolio_id = v_portfolio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receivable was not found or is not accessible' USING ERRCODE = 'P0002';
    END IF;
    IF v_item.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'Receivable changed since it was opened. Reload and try again.' USING ERRCODE = '40001';
    END IF;
    SELECT coalesce(sum((value->>'allocated_amount')::numeric), 0) INTO v_delta
    FROM jsonb_array_elements(p_allocations) AS row(value)
    WHERE (value->>'receivable_item_id')::uuid = v_item_id;
    IF v_delta <= 0 OR v_item.outstanding_amount < v_delta
      OR v_item.status IN ('cancelled', 'disputed', 'written-off')
      OR v_item.currency_code IS DISTINCT FROM v_receipt.currency_code
      OR (v_receipt.lease_id IS NOT NULL AND v_item.lease_id IS DISTINCT FROM v_receipt.lease_id)
      OR (v_receipt.lease_id IS NULL AND v_receipt.tenant_id IS NOT NULL
          AND v_item.tenant_id IS DISTINCT FROM v_receipt.tenant_id)
      OR (v_receipt.lease_id IS NULL AND v_receipt.tenant_id IS NULL
          AND (v_receipt.property_id IS NULL OR v_item.property_id IS DISTINCT FROM v_receipt.property_id))
      OR round(v_item.allocated_amount + v_delta, 2) IS DISTINCT FROM (v_payload->>'allocated_amount')::numeric
      OR round(v_item.outstanding_amount - v_delta, 2) IS DISTINCT FROM (v_payload->>'outstanding_amount')::numeric
      OR (v_item.outstanding_amount = v_delta AND v_payload->>'status' IS DISTINCT FROM 'paid')
      OR (v_item.outstanding_amount > v_delta AND v_payload->>'status' NOT IN ('open', 'overdue', 'partially-paid'))
      OR (v_payload->>'status') IS NULL THEN
      RAISE EXCEPTION 'Receivable allocation conflicts with its saved balance, currency, or scope' USING ERRCODE = '22023';
    END IF;
    UPDATE public.receivable_items SET
      allocated_amount = round(v_item.allocated_amount + v_delta, 2),
      outstanding_amount = round(v_item.outstanding_amount - v_delta, 2),
      status = v_payload->>'status'
    WHERE id = v_item_id AND portfolio_id = v_portfolio_id
    RETURNING * INTO v_saved_item;
    v_item_ids := array_append(v_item_ids, v_saved_item.id);
  END LOOP;

  INSERT INTO public.receipt_allocations
  SELECT (jsonb_populate_record(
    NULL::public.receipt_allocations,
    item.value || jsonb_build_object(
      'portfolio_id', v_portfolio_id,
      'created_at', clock_timestamp(),
      'updated_at', clock_timestamp()
    )
  )).*
  FROM jsonb_array_elements(p_allocations) AS item(value);

  RETURN jsonb_build_object(
    'receipt', to_jsonb(v_receipt),
    'receivables', coalesce((
      SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.receivable_items AS item WHERE item.id = ANY(v_item_ids)
    ), '[]'::jsonb),
    'allocations', coalesce((
      SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
      FROM public.receipt_allocations AS item WHERE item.id = ANY(v_allocation_ids)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
