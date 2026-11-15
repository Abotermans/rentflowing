-- Check the final assignment graph after a lifecycle transition. A deferred
-- trigger lets an atomic edit add the main unit in the same transaction.
CREATE FUNCTION public.guard_lease_stage_main_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_stage text;
  v_as_of date;
BEGIN
  SELECT l.lifecycle_stage,
    CASE WHEN l.lifecycle_stage = 'active'
      THEN greatest(l.start_date, (now() AT TIME ZONE p.time_zone)::date)
      ELSE l.start_date END
    INTO v_stage, v_as_of
  FROM public.leases l
  JOIN public.properties p ON p.id = l.property_id AND p.portfolio_id = l.portfolio_id
  WHERE l.id = NEW.id AND l.portfolio_id = NEW.portfolio_id;

  IF v_stage IS DISTINCT FROM NEW.lifecycle_stage
    OR v_stage NOT IN ('pending-signature', 'signed', 'active') THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    JOIN public.units u ON u.id = a.unit_id
      AND u.portfolio_id = a.portfolio_id
    WHERE a.lease_id = NEW.id AND a.portfolio_id = NEW.portfolio_id
      AND u.property_id = NEW.property_id
      AND u.unit_type NOT IN ('parking', 'storage')
      AND a.start_date <= v_as_of
      AND (a.end_date IS NULL OR a.end_date >= v_as_of)
  ) THEN
    RAISE EXCEPTION 'Lease needs a main residential or commercial unit before this status change'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lease_stage_main_unit() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER guard_lease_stage_main_unit
AFTER UPDATE ON public.leases
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD.lifecycle_stage IS DISTINCT FROM NEW.lifecycle_stage
  AND NEW.lifecycle_stage IN ('pending-signature', 'signed', 'active'))
EXECUTE FUNCTION public.guard_lease_stage_main_unit();

-- A lease can keep its stage while an assignment edit removes or shortens
-- its last main-unit window. Check that final graph too.
CREATE FUNCTION public.guard_retained_lease_main_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_stage text;
  v_property_id uuid;
  v_as_of date;
BEGIN
  SELECT l.lifecycle_stage, l.property_id,
    CASE WHEN l.lifecycle_stage = 'active'
      THEN greatest(l.start_date, (now() AT TIME ZONE p.time_zone)::date)
      ELSE l.start_date END
    INTO v_stage, v_property_id, v_as_of
  FROM public.leases l
  JOIN public.properties p ON p.id = l.property_id AND p.portfolio_id = l.portfolio_id
  WHERE l.id = OLD.lease_id AND l.portfolio_id = OLD.portfolio_id;

  IF v_stage IS NULL OR v_stage NOT IN ('pending-signature', 'signed', 'active') THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    JOIN public.units u ON u.id = a.unit_id
      AND u.portfolio_id = a.portfolio_id
    WHERE a.lease_id = OLD.lease_id AND a.portfolio_id = OLD.portfolio_id
      AND u.property_id = v_property_id
      AND u.unit_type NOT IN ('parking', 'storage')
      AND a.start_date <= v_as_of
      AND (a.end_date IS NULL OR a.end_date >= v_as_of)
  ) THEN
    RAISE EXCEPTION 'Lease needs a main residential or commercial unit before this status change'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_retained_lease_main_unit() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER guard_retained_lease_main_unit
AFTER UPDATE OR DELETE ON public.lease_unit_assignments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.guard_retained_lease_main_unit();
