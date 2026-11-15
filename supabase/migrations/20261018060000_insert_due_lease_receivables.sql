CREATE OR REPLACE FUNCTION public.insert_due_lease_receivables(
  p_portfolio_id uuid,
  p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb;
  v_inserted integer := 0;
  v_lease_id uuid;
  v_unit_id uuid;
  v_item_type text;
  v_period_month text;
  v_due_date date;
BEGIN
  IF p_portfolio_id IS NULL OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'A portfolio and an array of at most 500 receivables are required'
      USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF v_row->>'portfolio_id' IS DISTINCT FROM p_portfolio_id::text
       OR v_row->>'origin' IS DISTINCT FROM 'lease-schedule'
       OR v_row->>'status' NOT IN ('open', 'overdue')
       OR (v_row->>'allocated_amount')::numeric IS DISTINCT FROM 0
       OR (v_row->>'expected_amount')::numeric <= 0
       OR (v_row->>'outstanding_amount')::numeric IS DISTINCT FROM (v_row->>'expected_amount')::numeric THEN
      RAISE EXCEPTION 'Invalid scheduled receivable payload'
        USING ERRCODE = '22023';
    END IF;
    v_lease_id := (v_row->>'lease_id')::uuid;
    v_unit_id := (v_row->>'unit_id')::uuid;
    v_item_type := v_row->>'item_type';
    v_period_month := v_row->>'period_month';
    v_due_date := (v_row->>'due_date')::date;
    IF v_lease_id IS NULL OR v_unit_id IS NULL OR v_item_type NOT IN ('rent', 'charges')
       OR v_period_month IS NULL OR v_due_date IS NULL THEN
      RAISE EXCEPTION 'Scheduled receivable identity is incomplete'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.receivable_items AS existing
      WHERE existing.portfolio_id = p_portfolio_id
        AND existing.lease_id = v_lease_id
        AND existing.unit_id = v_unit_id
        AND existing.item_type = v_item_type
        AND existing.origin = 'lease-schedule'
        AND existing.period_month = v_period_month
        AND existing.due_date = v_due_date
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.receivable_items (
        id, portfolio_id, lease_id, tenant_id, property_id, unit_id,
        item_type, label, period_month, due_date, currency_code,
        expected_amount, allocated_amount, outstanding_amount, status,
        priority, origin, notes, cycle_index, cycle_end_date
      ) VALUES (
        (v_row->>'id')::uuid, p_portfolio_id, v_lease_id,
        (v_row->>'tenant_id')::uuid, (v_row->>'property_id')::uuid, v_unit_id,
        v_item_type, v_row->>'label', v_period_month, v_due_date,
        v_row->>'currency_code', (v_row->>'expected_amount')::numeric, 0,
        (v_row->>'outstanding_amount')::numeric, v_row->>'status',
        (v_row->>'priority')::integer, 'lease-schedule', coalesce(v_row->>'notes', ''),
        (v_row->>'cycle_index')::integer, (v_row->>'cycle_end_date')::date
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.receivable_items AS existing
        WHERE existing.portfolio_id = p_portfolio_id
          AND existing.lease_id = v_lease_id
          AND existing.unit_id = v_unit_id
          AND existing.item_type = v_item_type
          AND existing.origin = 'lease-schedule'
          AND existing.period_month = v_period_month
          AND existing.due_date = v_due_date
      ) THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_due_lease_receivables(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_due_lease_receivables(uuid, jsonb)
  TO service_role;
