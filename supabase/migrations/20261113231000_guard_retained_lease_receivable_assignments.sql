-- Protect issued rent/charges when an assignment is shortened or removed.
-- Defer the check so an atomic edit can replace the assignment or remove an
-- unpaid future receivable before the transaction commits. Existing orphaned
-- rows are not revisited unless their former covering assignment is changed.
CREATE FUNCTION public.guard_retained_lease_receivable_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_due_date date;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.portfolio_id IS NOT DISTINCT FROM NEW.portfolio_id
    AND OLD.lease_id IS NOT DISTINCT FROM NEW.lease_id
    AND OLD.unit_id IS NOT DISTINCT FROM NEW.unit_id
    AND OLD.start_date IS NOT DISTINCT FROM NEW.start_date
    AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date THEN
    RETURN NEW;
  END IF;

  SELECT r.due_date INTO v_due_date
  FROM public.receivable_items AS r
  WHERE r.portfolio_id = OLD.portfolio_id
    AND r.lease_id = OLD.lease_id
    AND r.unit_id = OLD.unit_id
    AND r.origin = 'lease-schedule'
    AND r.item_type IN ('rent', 'charges')
    AND r.status <> 'cancelled'
    AND OLD.start_date <= coalesce(r.cycle_end_date,
      (date_trunc('month', r.due_date) + interval '1 month - 1 day')::date)
    AND (OLD.end_date IS NULL OR OLD.end_date >= date_trunc('month', r.due_date)::date)
    AND NOT EXISTS (
      SELECT 1 FROM public.lease_unit_assignments AS assignment
      WHERE assignment.portfolio_id = r.portfolio_id
        AND assignment.lease_id = r.lease_id
        AND assignment.unit_id = r.unit_id
        AND assignment.start_date <= coalesce(r.cycle_end_date,
          (date_trunc('month', r.due_date) + interval '1 month - 1 day')::date)
        AND (assignment.end_date IS NULL
          OR assignment.end_date >= date_trunc('month', r.due_date)::date)
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Lease assignment cannot be detached from existing rent/charges receivable due %. Keep its billing period covered or review the receivable first.',
      v_due_date USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_retained_lease_receivable_assignment()
  FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER guard_retained_lease_receivable_assignment
AFTER UPDATE OR DELETE ON public.lease_unit_assignments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.guard_retained_lease_receivable_assignment();
