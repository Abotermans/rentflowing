CREATE OR REPLACE FUNCTION public.advance_due_lease_lifecycle(p_business_date date)
RETURNS TABLE (leases_advanced integer, tenants_updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_next_stage text;
  v_tenant_ids uuid[] := ARRAY[]::uuid[];
  v_lease_count integer := 0;
  v_tenant_count integer := 0;
BEGIN
  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'Business date is required' USING ERRCODE = '22004';
  END IF;

  FOR v_lease IN
    SELECT l.*
    FROM public.leases AS l
    WHERE (l.lifecycle_stage = 'signed' AND l.start_date <= p_business_date)
       OR (l.lifecycle_stage = 'active' AND l.end_date < p_business_date)
    ORDER BY l.id
    FOR UPDATE SKIP LOCKED
  LOOP
    v_next_stage := CASE
      WHEN v_lease.end_date < p_business_date THEN 'ended'
      ELSE 'active'
    END;

    UPDATE public.leases
    SET lifecycle_stage = v_next_stage,
        end_reason = CASE
          WHEN v_next_stage = 'ended' THEN coalesce(end_reason, 'natural-expiry')
          ELSE end_reason
        END
    WHERE id = v_lease.id;

    INSERT INTO public.lease_status_changes
      (lease_id, portfolio_id, from_stage, to_stage, reason)
    VALUES
      (v_lease.id, v_lease.portfolio_id, v_lease.lifecycle_stage,
       v_next_stage, 'scheduled-date-transition');

    IF v_next_stage = 'ended' THEN
      UPDATE public.lease_amendments
      SET status = 'ended'
      WHERE lease_id = v_lease.id AND status = 'active';
    END IF;

    SELECT coalesce(array_agg(DISTINCT linked.id::uuid), ARRAY[]::uuid[])
    INTO v_tenant_ids
    FROM (
      SELECT jsonb_array_elements_text(v_lease.tenant_ids) AS id
      UNION ALL
      SELECT v_lease.billing_tenant_id::text
      WHERE v_lease.billing_tenant_id IS NOT NULL
    ) AS linked;
    v_tenant_ids := array_remove(v_tenant_ids, NULL);

    UPDATE public.tenants AS t
    SET status = next_status.status
    FROM (
      SELECT candidate.id,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM public.leases AS other
            WHERE other.portfolio_id = candidate.portfolio_id
              AND (other.tenant_ids ? candidate.id::text
                   OR other.billing_tenant_id = candidate.id)
              AND other.lifecycle_stage = 'active'
          ) THEN 'active'
          WHEN EXISTS (
            SELECT 1 FROM public.leases AS other
            WHERE other.portfolio_id = candidate.portfolio_id
              AND (other.tenant_ids ? candidate.id::text
                   OR other.billing_tenant_id = candidate.id)
              AND other.lifecycle_stage IN ('draft', 'pending-signature', 'signed')
          ) THEN 'applicant'
          ELSE 'former'
        END AS status
      FROM public.tenants AS candidate
      WHERE candidate.id = ANY(v_tenant_ids)
        AND candidate.portfolio_id = v_lease.portfolio_id
    ) AS next_status
    WHERE t.id = next_status.id
      AND t.status IS DISTINCT FROM next_status.status;
    GET DIAGNOSTICS v_tenant_count = ROW_COUNT;
    tenants_updated := coalesce(tenants_updated, 0) + v_tenant_count;
    v_lease_count := v_lease_count + 1;
  END LOOP;

  leases_advanced := v_lease_count;
  tenants_updated := coalesce(tenants_updated, 0);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_due_lease_lifecycle(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_due_lease_lifecycle(date)
  TO service_role;
