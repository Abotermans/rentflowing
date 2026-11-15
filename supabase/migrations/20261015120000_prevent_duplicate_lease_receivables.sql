-- Existing duplicates are reviewed in the application before cleanup. This
-- trigger prevents new lease-schedule duplicates even while old rows remain.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_lease_receivable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin <> 'lease-schedule' OR NEW.lease_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(
    NEW.portfolio_id::text || ':' || NEW.lease_id::text || ':' ||
    coalesce(NEW.unit_id::text, '') || ':' || NEW.item_type || ':' ||
    coalesce(NEW.period_month, '') || ':' || NEW.due_date::text
  ));

  IF EXISTS (
    SELECT 1 FROM public.receivable_items existing
    WHERE existing.id <> NEW.id
      AND existing.portfolio_id = NEW.portfolio_id
      AND existing.lease_id = NEW.lease_id
      AND existing.unit_id IS NOT DISTINCT FROM NEW.unit_id
      AND existing.item_type = NEW.item_type
      AND existing.origin = 'lease-schedule'
      AND existing.due_date = NEW.due_date
      AND existing.period_month IS NOT DISTINCT FROM NEW.period_month
  ) THEN
    RAISE EXCEPTION 'Duplicate lease-schedule receivable for lease %, due %', NEW.lease_id, NEW.due_date
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_lease_receivable ON public.receivable_items;
CREATE TRIGGER prevent_duplicate_lease_receivable
  BEFORE INSERT OR UPDATE OF lease_id, unit_id, item_type, origin, period_month, due_date, cycle_index, cycle_end_date
  ON public.receivable_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_lease_receivable();
