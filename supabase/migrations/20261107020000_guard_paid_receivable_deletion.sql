-- Existing lease and reconciliation RPCs delete unpaid receivables as their
-- calling role. Guard protected financial rows without breaking those paths.
CREATE FUNCTION public.guard_paid_receivable_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only a real portfolio cascade may remove protected ledger rows.
  IF pg_trigger_depth() > 1 AND NOT EXISTS (
    SELECT 1 FROM public.portfolios WHERE id = OLD.portfolio_id
  ) THEN
    RETURN OLD;
  END IF;
  IF OLD.status IN ('paid', 'partially-paid')
    OR OLD.allocated_amount <> 0
    OR EXISTS (SELECT 1 FROM public.receipt_allocations
      WHERE receivable_item_id = OLD.id) THEN
    RAISE EXCEPTION 'Paid or receipt-linked receivables cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_paid_receivable_deletion()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_paid_receivable_deletion
  BEFORE DELETE ON public.receivable_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_paid_receivable_deletion();
