-- Reconciliation amounts and their adjustment receivable are one transaction.
-- Direct table writes could otherwise forge the delta or orphan the bill.
REVOKE INSERT, UPDATE ON public.charges_reconciliations
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
