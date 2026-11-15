-- A lease-wide bill must be attributed to a main rentable unit. Keep legacy
-- payment/status updates possible without rewriting historical anchors.
CREATE OR REPLACE FUNCTION public.guard_new_lease_schedule_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_month_start date;
  v_cycle_end date;
  v_property_currency text;
BEGIN
  IF NEW.origin <> 'lease-schedule' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.origin IS NOT DISTINCT FROM OLD.origin
    AND NEW.lease_id IS NOT DISTINCT FROM OLD.lease_id
    AND NEW.property_id IS NOT DISTINCT FROM OLD.property_id
    AND NEW.portfolio_id IS NOT DISTINCT FROM OLD.portfolio_id
    AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id
    AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
    AND NEW.cycle_end_date IS NOT DISTINCT FROM OLD.cycle_end_date
    AND NEW.currency_code IS NOT DISTINCT FROM OLD.currency_code THEN
    RETURN NEW;
  END IF;
  IF NEW.lease_id IS NULL OR NEW.unit_id IS NULL OR NEW.due_date IS NULL THEN
    RAISE EXCEPTION 'Scheduled receivable requires a lease, unit, and due date'
      USING ERRCODE = '23514';
  END IF;

  SELECT currency_code INTO v_property_currency
  FROM public.properties
  WHERE id = NEW.property_id AND portfolio_id = NEW.portfolio_id
  FOR SHARE;
  IF NOT FOUND OR NEW.currency_code IS DISTINCT FROM v_property_currency THEN
    RAISE EXCEPTION 'Scheduled receivable currency must match its property currency'
      USING ERRCODE = '23514';
  END IF;

  v_month_start := date_trunc('month', NEW.due_date)::date;
  v_cycle_end := coalesce(NEW.cycle_end_date,
    (date_trunc('month', NEW.due_date) + interval '1 month - 1 day')::date);
  IF v_cycle_end < v_month_start THEN
    RAISE EXCEPTION 'Scheduled receivable cycle ends before its due month'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.lease_unit_assignments AS assignment
  WHERE assignment.lease_id = NEW.lease_id
    AND assignment.unit_id = NEW.unit_id
    AND assignment.portfolio_id = NEW.portfolio_id
    AND assignment.start_date <= v_cycle_end
    AND (assignment.end_date IS NULL OR assignment.end_date >= v_month_start)
  LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scheduled receivable unit has no matching lease assignment during its billing period'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.units AS unit
  WHERE unit.id = NEW.unit_id
    AND unit.property_id = NEW.property_id
    AND unit.portfolio_id = NEW.portfolio_id
    AND unit.unit_type NOT IN ('parking', 'storage')
  LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scheduled receivable must be attributed to a main unit'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
