-- Lease-level billing totals are the schedule source, while assignment shares
-- drive per-unit returns and indexation. They must agree at the current term.
CREATE FUNCTION public.guard_lease_assignment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lease_ids uuid[];
  v_lease_id uuid;
  v_lease public.leases%ROWTYPE;
  v_business_today date;
  v_anchor date;
  v_as_of date;
  v_count bigint;
  v_invalid bigint;
  v_rent numeric;
  v_charges numeric;
BEGIN
  IF TG_TABLE_NAME = 'leases' THEN
    v_lease_ids := ARRAY[NEW.id];
  ELSIF TG_OP = 'INSERT' THEN
    v_lease_ids := ARRAY[NEW.lease_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_lease_ids := ARRAY[OLD.lease_id];
  ELSE
    v_lease_ids := ARRAY[OLD.lease_id, NEW.lease_id];
  END IF;

  FOREACH v_lease_id IN ARRAY v_lease_ids LOOP
    SELECT * INTO v_lease FROM public.leases WHERE id = v_lease_id;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    IF v_lease.lifecycle_stage IN ('ended', 'terminated') THEN
      CONTINUE;
    END IF;
    SELECT (now() AT TIME ZONE p.time_zone)::date INTO v_business_today
    FROM public.properties p WHERE p.id = v_lease.property_id
      AND p.portfolio_id = v_lease.portfolio_id;

    v_anchor := CASE WHEN v_lease.lifecycle_stage = 'draft' THEN v_lease.start_date
      ELSE greatest(v_lease.start_date, least(
        v_business_today,
        coalesce(v_lease.end_date, v_business_today),
        coalesce(v_lease.move_out_actual_date, v_business_today)
      )) END;
    FOR v_as_of IN
      SELECT v_anchor
      UNION SELECT start_date FROM public.lease_unit_assignments
        WHERE lease_id = v_lease.id AND portfolio_id = v_lease.portfolio_id
          AND start_date > v_anchor
      UNION SELECT end_date + 1 FROM public.lease_unit_assignments
        WHERE lease_id = v_lease.id AND portfolio_id = v_lease.portfolio_id
          AND end_date IS NOT NULL AND end_date >= v_anchor
      ORDER BY 1
    LOOP
      IF (v_lease.end_date IS NOT NULL AND v_as_of > v_lease.end_date)
        OR (v_lease.move_out_actual_date IS NOT NULL
          AND v_as_of > v_lease.move_out_actual_date) THEN
        CONTINUE;
      END IF;
      SELECT count(*), count(*) FILTER (
          WHERE rent_share IS NULL OR charges_share IS NULL
            OR rent_share < 0 OR charges_share < 0
        ), coalesce(sum(rent_share), 0), coalesce(sum(charges_share), 0)
        INTO v_count, v_invalid, v_rent, v_charges
      FROM public.lease_unit_assignments
      WHERE lease_id = v_lease.id AND portfolio_id = v_lease.portfolio_id
        AND start_date <= v_as_of
        AND (end_date IS NULL OR end_date >= v_as_of);

      IF v_invalid > 0 OR (
        v_count > 0 AND (
          round(v_rent, 2) IS DISTINCT FROM round(v_lease.monthly_rent, 2)
          OR round(v_charges, 2) IS DISTINCT FROM round(v_lease.monthly_charges, 2)
        )
      ) OR (v_count = 0 AND (v_lease.monthly_rent <> 0 OR v_lease.monthly_charges <> 0)) THEN
        RAISE EXCEPTION
          'Lease % monthly totals do not match unit shares on %: rent % vs %, charges % vs %',
          v_lease.lease_reference, v_as_of,
          v_lease.monthly_rent, v_rent, v_lease.monthly_charges, v_charges
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lease_assignment_totals() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER guard_lease_assignment_totals_on_lease
AFTER UPDATE ON public.leases
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD.monthly_rent IS DISTINCT FROM NEW.monthly_rent
  OR OLD.monthly_charges IS DISTINCT FROM NEW.monthly_charges
  OR OLD.lifecycle_stage IS DISTINCT FROM NEW.lifecycle_stage
  OR OLD.portfolio_id IS DISTINCT FROM NEW.portfolio_id
  OR OLD.property_id IS DISTINCT FROM NEW.property_id
  OR OLD.start_date IS DISTINCT FROM NEW.start_date
  OR OLD.end_date IS DISTINCT FROM NEW.end_date
  OR OLD.move_out_actual_date IS DISTINCT FROM NEW.move_out_actual_date)
EXECUTE FUNCTION public.guard_lease_assignment_totals();

CREATE CONSTRAINT TRIGGER guard_lease_assignment_totals_on_assignment
AFTER INSERT OR UPDATE OR DELETE ON public.lease_unit_assignments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.guard_lease_assignment_totals();
