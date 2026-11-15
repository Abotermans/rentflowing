-- Delete only reviewed, untouched duplicate lease bills. The slot lock is
-- shared with the insertion guard; row locks also serialize payment updates.
CREATE FUNCTION public.delete_duplicate_lease_receivables(
  p_portfolio_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_id uuid;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_prior public.receivable_items%ROWTYPE;
  v_target public.receivable_items%ROWTYPE;
  v_deleted integer := 0;
BEGIN
  IF p_portfolio_id IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 1000 THEN
    RAISE EXCEPTION 'Provide 1 to 1000 receivables for duplicate cleanup' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(
    p_portfolio_id, auth.uid(), ARRAY['owner', 'admin']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Duplicate cleanup is not permitted' USING ERRCODE = '42501';
  END IF;

  FOR v_payload IN SELECT value FROM jsonb_array_elements(p_items) AS item(value)
    ORDER BY value->>'id'
  LOOP
    IF jsonb_typeof(v_payload) <> 'object'
      OR v_payload->>'id' IS NULL
      OR v_payload->>'expected_updated_at' IS NULL THEN
      RAISE EXCEPTION 'Duplicate cleanup requires row ids and versions' USING ERRCODE = '22023';
    END IF;
    v_id := (v_payload->>'id')::uuid;
    IF v_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'Duplicate cleanup contains the same row twice' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);

    SELECT * INTO v_prior FROM public.receivable_items
    WHERE id = v_id AND portfolio_id = p_portfolio_id;
    IF NOT FOUND OR v_prior.origin IS DISTINCT FROM 'lease-schedule'
      OR v_prior.lease_id IS NULL THEN
      RAISE EXCEPTION 'Reviewed lease-schedule receivable was not found' USING ERRCODE = 'P0002';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(
      v_prior.portfolio_id::text || ':' || v_prior.lease_id::text || ':' ||
      v_prior.item_type || ':' || coalesce(v_prior.period_month, '') || ':' || v_prior.due_date::text
    ));

    SELECT * INTO v_target FROM public.receivable_items
    WHERE id = v_id AND portfolio_id = p_portfolio_id FOR UPDATE;
    IF NOT FOUND OR v_target.updated_at IS DISTINCT FROM (v_payload->>'expected_updated_at')::timestamptz
      OR v_target.lease_id IS DISTINCT FROM v_prior.lease_id
      OR v_target.item_type IS DISTINCT FROM v_prior.item_type
      OR v_target.period_month IS DISTINCT FROM v_prior.period_month
      OR v_target.due_date IS DISTINCT FROM v_prior.due_date THEN
      RAISE EXCEPTION 'A receivable changed since review. Reload and try again.' USING ERRCODE = '40001';
    END IF;

    PERFORM 1 FROM public.receivable_items AS locked
    WHERE locked.portfolio_id = p_portfolio_id
      AND locked.lease_id = v_target.lease_id
      AND locked.item_type = v_target.item_type
      AND locked.origin = 'lease-schedule'
      AND locked.period_month IS NOT DISTINCT FROM v_target.period_month
      AND locked.due_date = v_target.due_date
    ORDER BY locked.id FOR UPDATE;

    IF v_target.status NOT IN ('open', 'overdue')
      OR v_target.allocated_amount IS DISTINCT FROM 0
      OR v_target.outstanding_amount IS DISTINCT FROM v_target.expected_amount
      OR EXISTS (SELECT 1 FROM public.receipt_allocations
        WHERE receivable_item_id = v_target.id) THEN
      RAISE EXCEPTION 'A reviewed receivable is paid, allocated, or no longer open' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.receivable_items AS peer
      WHERE peer.id <> v_target.id AND peer.portfolio_id = p_portfolio_id
        AND peer.lease_id = v_target.lease_id
        AND peer.item_type = v_target.item_type
        AND peer.origin = 'lease-schedule'
        AND peer.period_month IS NOT DISTINCT FROM v_target.period_month
        AND peer.due_date = v_target.due_date
        AND peer.tenant_id IS NOT DISTINCT FROM v_target.tenant_id
        AND peer.property_id IS NOT DISTINCT FROM v_target.property_id
        -- unit_id is an attribution anchor, not part of the lease billing slot.
        AND peer.currency_code IS NOT DISTINCT FROM v_target.currency_code
        AND peer.expected_amount IS NOT DISTINCT FROM v_target.expected_amount
        AND peer.cycle_index IS NOT DISTINCT FROM v_target.cycle_index
        AND peer.cycle_end_date IS NOT DISTINCT FROM v_target.cycle_end_date
        AND peer.label IS NOT DISTINCT FROM v_target.label
        AND peer.notes IS NOT DISTINCT FROM v_target.notes
        AND peer.priority IS NOT DISTINCT FROM v_target.priority
    ) THEN
      RAISE EXCEPTION 'No matching duplicate remains for a reviewed receivable' USING ERRCODE = '40001';
    END IF;

    DELETE FROM public.receivable_items
    WHERE id = v_target.id AND portfolio_id = p_portfolio_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Duplicate cleanup did not remove the reviewed row' USING ERRCODE = '40001';
    END IF;
    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_duplicate_lease_receivables(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_duplicate_lease_receivables(uuid, jsonb)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
