-- The application displays and edits one deposit/guarantee per lease.
-- Fail without changing data if historical duplicates need reconciliation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.guarantees GROUP BY lease_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate guarantees must be reconciled before the one-per-lease constraint can be applied';
  END IF;
END $$;

CREATE UNIQUE INDEX guarantees_one_per_lease_idx
  ON public.guarantees (lease_id);
