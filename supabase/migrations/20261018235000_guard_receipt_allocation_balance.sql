-- Deferred checks allow the receipt, receivable and allocation RPC to update
-- its related rows in one transaction while rejecting a mismatched final state.
CREATE FUNCTION public.check_cash_receipt_allocation_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_id uuid;
  v_new_id uuid;
  v_id uuid;
  v_receipt public.cash_receipts%ROWTYPE;
  v_allocated numeric(14,2);
BEGIN
  IF TG_TABLE_NAME = 'cash_receipts' THEN
    IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
    v_new_id := NEW.id;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old_id := OLD.cash_receipt_id; END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new_id := NEW.cash_receipt_id; END IF;
  END IF;

  FOR v_id IN SELECT DISTINCT id FROM unnest(ARRAY[v_old_id, v_new_id]) AS receipt_ids(id)
              WHERE id IS NOT NULL ORDER BY id LOOP
    SELECT * INTO v_receipt FROM public.cash_receipts WHERE id = v_id FOR UPDATE;
    IF FOUND AND TG_TABLE_NAME = 'receipt_allocations'
      AND TG_OP IN ('INSERT', 'UPDATE') AND v_id = v_new_id
      AND v_receipt.status IN ('refunded', 'reversed', 'exception') THEN
      RAISE EXCEPTION 'Terminal or exceptional cash receipt % cannot receive a new allocation', v_id
        USING ERRCODE = '23514';
    END IF;
    IF NOT FOUND OR v_receipt.amount_received <= 0
      OR v_receipt.status IN ('refunded', 'reversed') THEN
      CONTINUE;
    END IF;
    SELECT coalesce(sum(allocated_amount), 0) INTO v_allocated
    FROM public.receipt_allocations WHERE cash_receipt_id = v_id;
    IF v_allocated IS DISTINCT FROM round(v_receipt.amount_received - v_receipt.unmatched_amount, 2) THEN
      RAISE EXCEPTION 'Cash receipt % allocation balance does not match its saved unmatched amount', v_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_cash_receipt_allocation_balance()
  FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER cash_receipt_allocation_balance
AFTER INSERT OR UPDATE ON public.cash_receipts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_cash_receipt_allocation_balance();

CREATE CONSTRAINT TRIGGER receipt_allocation_balance
AFTER INSERT OR UPDATE OR DELETE ON public.receipt_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_cash_receipt_allocation_balance();

-- The application has no direct receipt/allocated-row deletion or allocation
-- editing path. Keep those operations service-only so a browser cannot erase
-- a matched payment by cascading away its allocation rows.
REVOKE DELETE ON public.cash_receipts FROM authenticated;
REVOKE UPDATE, DELETE ON public.receipt_allocations FROM authenticated;

-- Only the scoped wrapper may write payment rows as a browser user. The
-- original transaction remains invoker-rights for its trusted caller.
CREATE FUNCTION public.client_save_receipt_allocations(
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
  RETURN public.save_receipt_allocations(
    p_receipt, p_receivables, p_allocations, p_expected_receipt_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.client_save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_receipt_allocations(jsonb, jsonb, jsonb, timestamptz)
  TO service_role;
REVOKE INSERT, UPDATE ON public.cash_receipts FROM authenticated;
REVOKE INSERT ON public.receipt_allocations FROM authenticated;
NOTIFY pgrst, 'reload schema';
