-- NOT VALID preserves historical bank imports for explicit review while
-- preventing new direct table writes from bypassing basic receipt invariants.
ALTER TABLE public.cash_receipts
  ADD CONSTRAINT cash_receipts_nonterminal_amount_positive
  CHECK (status IN ('refunded', 'reversed') OR amount_received > 0) NOT VALID;

ALTER TABLE public.cash_receipts
  ADD CONSTRAINT cash_receipts_positive_balance_range
  CHECK (amount_received <= 0 OR unmatched_amount BETWEEN 0 AND amount_received) NOT VALID;

ALTER TABLE public.receipt_allocations
  ADD CONSTRAINT receipt_allocations_amount_positive
  CHECK (allocated_amount > 0) NOT VALID;
