-- New assignments need explicit per-unit pricing. Preserve legacy null shares
-- on unrelated updates so old leases can be repaired one field at a time.
CREATE FUNCTION public.guard_new_assignment_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.rent_share IS DISTINCT FROM OLD.rent_share THEN
    IF NEW.rent_share IS NULL OR NEW.rent_share < 0
      OR NEW.rent_share::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Unit rent share must be a finite, non-negative amount'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.charges_share IS DISTINCT FROM OLD.charges_share THEN
    IF NEW.charges_share IS NULL OR NEW.charges_share < 0
      OR NEW.charges_share::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Unit charges share must be a finite, non-negative amount'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_new_assignment_pricing()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_new_assignment_pricing
BEFORE INSERT OR UPDATE ON public.lease_unit_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_new_assignment_pricing();
