-- Keep historical exceptions visible for explicit repair while preventing
-- new receivables from carrying an unexplained balance difference.
ALTER TABLE public.receivable_items
  ADD CONSTRAINT receivable_items_amounts_reconcile
  CHECK (abs(expected_amount - allocated_amount - outstanding_amount) <= 0.01)
  NOT VALID;
