-- Preserve raw input precision so constraints can reject fractions of a cent
-- before PostgreSQL rounds values to the former numeric(12,2) typmod.
ALTER TABLE public.guarantees
  ALTER COLUMN expected_amount TYPE numeric,
  ALTER COLUMN received_amount TYPE numeric,
  ALTER COLUMN retention_amount TYPE numeric;

-- NOT VALID keeps historical rows readable while enforcing the contract on
-- every new or updated guarantee. The target-data audit identifies old drift.
ALTER TABLE public.guarantees
  ADD CONSTRAINT guarantees_amounts_valid
  CHECK (
    expected_amount BETWEEN 0 AND 9999999999.99
    AND received_amount BETWEEN 0 AND 9999999999.99
    AND expected_amount * 100 = trunc(expected_amount * 100)
    AND received_amount * 100 = trunc(received_amount * 100)
    AND (
      retention_amount IS NULL
      OR (
        retention_amount BETWEEN 0 AND received_amount
        AND retention_amount * 100 = trunc(retention_amount * 100)
        AND (retention_amount = 0 OR release_date IS NOT NULL)
      )
    )
    AND (received_date IS NULL OR release_date IS NULL OR release_date >= received_date)
  ) NOT VALID;

ALTER TABLE public.guarantees
  ADD CONSTRAINT guarantees_status_consistent
  CHECK (status = CASE
    WHEN release_date IS NOT NULL THEN
      CASE WHEN coalesce(retention_amount, 0) > 0 THEN 'partially-retained' ELSE 'released' END
    WHEN received_amount <= 0 THEN 'pending'
    WHEN received_amount < expected_amount THEN 'incomplete'
    ELSE 'active'
  END) NOT VALID;
