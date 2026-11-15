-- Keep property-linked lease history coherent even when a client writes a
-- table directly instead of using the lease edit RPC.
CREATE FUNCTION public.guard_lease_property_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'leases' THEN
    IF NEW.property_id IS DISTINCT FROM OLD.property_id THEN
      RAISE EXCEPTION 'A lease cannot be moved to another property after creation'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'units' THEN
    IF NEW.property_id IS DISTINCT FROM OLD.property_id
      AND EXISTS (SELECT 1 FROM public.lease_unit_assignments
        WHERE unit_id = OLD.id) THEN
      RAISE EXCEPTION 'An assigned unit cannot be moved to another property'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'lease_unit_assignments' THEN
    PERFORM 1 FROM public.units WHERE id = NEW.unit_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lease assignment unit was not found'
        USING ERRCODE = '23503';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.leases AS lease
      JOIN public.units AS unit ON unit.id = NEW.unit_id
      WHERE lease.id = NEW.lease_id
        AND lease.portfolio_id = NEW.portfolio_id
        AND unit.portfolio_id = NEW.portfolio_id
        AND unit.property_id = lease.property_id
    ) THEN
      RAISE EXCEPTION 'Lease assignment unit must belong to the lease property'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lease_property_links() FROM PUBLIC;

DO $$
BEGIN
  LOCK TABLE public.leases, public.units, public.lease_unit_assignments
    IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM public.lease_unit_assignments AS assignment
    JOIN public.leases AS lease ON lease.id = assignment.lease_id
    JOIN public.units AS unit ON unit.id = assignment.unit_id
    WHERE assignment.portfolio_id IS DISTINCT FROM lease.portfolio_id
      OR assignment.portfolio_id IS DISTINCT FROM unit.portfolio_id
      OR unit.property_id IS DISTINCT FROM lease.property_id
  ) THEN
    RAISE EXCEPTION 'Existing lease assignments cross a property or portfolio. Repair them before installing property guards.'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TRIGGER guard_lease_property_update
  BEFORE UPDATE OF property_id ON public.leases
  FOR EACH ROW EXECUTE FUNCTION public.guard_lease_property_links();

CREATE TRIGGER guard_assigned_unit_property_update
  BEFORE UPDATE OF property_id ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.guard_lease_property_links();

CREATE TRIGGER guard_lease_assignment_property
  BEFORE INSERT OR UPDATE OF portfolio_id, lease_id, unit_id
  ON public.lease_unit_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_lease_property_links();
