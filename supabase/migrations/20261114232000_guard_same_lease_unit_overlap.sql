-- A unit may change assignments within one lease, but its windows may not
-- overlap. End/start on the same calendar date is the existing valid boundary.
CREATE FUNCTION public.guard_same_lease_unit_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lease_unit_assignments
    WHERE id = NEW.id AND lease_id = NEW.lease_id AND unit_id = NEW.unit_id
  ) THEN
    RETURN NULL;
  END IF;

  -- Serialize concurrent inserts for the same unit before checking final rows.
  PERFORM 1 FROM public.units WHERE id = NEW.unit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment unit is unavailable for overlap validation'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    JOIN public.lease_unit_assignments b ON b.lease_id = a.lease_id
      AND b.unit_id = a.unit_id AND b.id > a.id
    WHERE a.lease_id = NEW.lease_id AND a.unit_id = NEW.unit_id
      AND a.start_date < coalesce(b.end_date, 'infinity'::date)
      AND b.start_date < coalesce(a.end_date, 'infinity'::date)
  ) THEN
    RAISE EXCEPTION 'Lease has overlapping assignments for the same unit'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_same_lease_unit_overlap() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER guard_same_lease_unit_overlap_on_assignment
AFTER INSERT OR UPDATE OF lease_id, unit_id, start_date, end_date
ON public.lease_unit_assignments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.guard_same_lease_unit_overlap();
