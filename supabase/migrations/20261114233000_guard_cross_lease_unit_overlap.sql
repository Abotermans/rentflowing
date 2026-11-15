-- An open assignment cannot reserve a unit after the containing lease ends
-- or after actual move-out. Touching end/start dates remain valid boundaries.
CREATE FUNCTION public.check_unit_cross_lease_overlap(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment unit is unavailable for overlap validation'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    JOIN public.leases la ON la.id = a.lease_id
    JOIN public.lease_unit_assignments b ON b.unit_id = a.unit_id
      AND b.lease_id <> a.lease_id AND b.id > a.id
    JOIN public.leases lb ON lb.id = b.lease_id
    CROSS JOIN LATERAL (
      SELECT greatest(a.start_date, la.start_date) AS first_start,
        least(a.end_date, la.end_date, la.move_out_actual_date) AS first_end,
        greatest(b.start_date, lb.start_date) AS second_start,
        least(b.end_date, lb.end_date, lb.move_out_actual_date) AS second_end
    ) AS bounds
    WHERE a.unit_id = p_unit_id
      AND la.lifecycle_stage NOT IN ('ended', 'terminated')
      AND lb.lifecycle_stage NOT IN ('ended', 'terminated')
      AND bounds.first_start < coalesce(bounds.first_end, 'infinity'::date)
      AND bounds.second_start < coalesce(bounds.second_end, 'infinity'::date)
      AND bounds.first_start < coalesce(bounds.second_end, 'infinity'::date)
      AND bounds.second_start < coalesce(bounds.first_end, 'infinity'::date)
  ) THEN
    RAISE EXCEPTION 'Unit assignments overlap across leases'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_unit_cross_lease_overlap(uuid) FROM PUBLIC;

CREATE FUNCTION public.guard_cross_lease_unit_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_unit_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'lease_unit_assignments' THEN
    IF EXISTS (SELECT 1 FROM public.lease_unit_assignments WHERE id = NEW.id) THEN
      PERFORM public.check_unit_cross_lease_overlap(NEW.unit_id);
    END IF;
  ELSE
    FOR v_unit_id IN
      SELECT DISTINCT unit_id FROM public.lease_unit_assignments
      WHERE lease_id = NEW.id ORDER BY unit_id
    LOOP
      PERFORM public.check_unit_cross_lease_overlap(v_unit_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_cross_lease_unit_overlap() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER guard_cross_lease_overlap_on_assignment
AFTER INSERT OR UPDATE ON public.lease_unit_assignments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.guard_cross_lease_unit_overlap();

CREATE CONSTRAINT TRIGGER guard_cross_lease_overlap_on_lease
AFTER UPDATE ON public.leases
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD.lifecycle_stage IS DISTINCT FROM NEW.lifecycle_stage
  OR OLD.start_date IS DISTINCT FROM NEW.start_date
  OR OLD.end_date IS DISTINCT FROM NEW.end_date
  OR OLD.move_out_actual_date IS DISTINCT FROM NEW.move_out_actual_date)
EXECUTE FUNCTION public.guard_cross_lease_unit_overlap();
