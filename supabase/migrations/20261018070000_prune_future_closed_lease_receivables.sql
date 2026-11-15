CREATE OR REPLACE FUNCTION public.prune_future_closed_lease_receivables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.lifecycle_stage NOT IN ('ended', 'terminated') OR NEW.end_date IS NULL
     OR (OLD.lifecycle_stage IS NOT DISTINCT FROM NEW.lifecycle_stage
         AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date) THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.receivable_items AS item
  WHERE item.portfolio_id = NEW.portfolio_id
    AND item.lease_id = NEW.id
    AND item.origin = 'lease-schedule'
    AND item.status IN ('open', 'overdue')
    AND item.allocated_amount = 0
    AND item.due_date > NEW.end_date
    AND NOT EXISTS (
      SELECT 1 FROM public.receipt_allocations AS allocation
      WHERE allocation.receivable_item_id = item.id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prune_future_closed_lease_receivables ON public.leases;
CREATE TRIGGER prune_future_closed_lease_receivables
  AFTER UPDATE OF lifecycle_stage, end_date ON public.leases
  FOR EACH ROW EXECUTE FUNCTION public.prune_future_closed_lease_receivables();
