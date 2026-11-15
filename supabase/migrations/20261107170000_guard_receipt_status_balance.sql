-- Keep the visible matching status consistent with the saved unapplied balance.
-- NOT VALID avoids rewriting historical imports; new writes still have to pass.
ALTER TABLE public.cash_receipts
  ADD CONSTRAINT cash_receipts_status_balance_consistent
  CHECK (
    amount_received <= 0
    OR status NOT IN ('unmatched', 'partially-matched', 'matched')
    OR (status = 'unmatched' AND unmatched_amount = amount_received)
    OR (status = 'partially-matched' AND unmatched_amount > 0
      AND unmatched_amount < amount_received)
    OR (status = 'matched' AND unmatched_amount = 0)
  ) NOT VALID;
