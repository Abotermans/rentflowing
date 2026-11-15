-- Reconciliation windows are inclusive. Overlapping windows would count the
-- same provisions and recoverable costs more than once.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.charges_reconciliations a
    JOIN public.charges_reconciliations b
      ON b.lease_id = a.lease_id AND b.id > a.id
    WHERE a.period_start <= b.period_end
      AND b.period_start <= a.period_end
  ) THEN
    RAISE EXCEPTION 'Existing charges reconciliations overlap; resolve them before applying this migration'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION public.guard_charges_reconciliation_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.period_start IS NULL OR NEW.period_end IS NULL OR NEW.period_start > NEW.period_end THEN
    RAISE EXCEPTION 'Invalid charges reconciliation period' USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent writes for this lease before checking its periods.
  PERFORM 1 FROM public.leases
  WHERE id = NEW.lease_id AND portfolio_id = NEW.portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found or is not accessible' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.charges_reconciliations existing
    WHERE existing.lease_id = NEW.lease_id
      AND existing.portfolio_id = NEW.portfolio_id
      AND existing.id <> NEW.id
      AND existing.period_start <= NEW.period_end
      AND existing.period_end >= NEW.period_start
  ) THEN
    RAISE EXCEPTION 'This lease period overlaps an existing charges reconciliation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_charges_reconciliation_period() FROM PUBLIC;

CREATE TRIGGER guard_charges_reconciliation_period
  BEFORE INSERT OR UPDATE OF portfolio_id, lease_id, period_start, period_end
  ON public.charges_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.guard_charges_reconciliation_period();
