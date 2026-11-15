-- Open-ended leases are permitted by the lease form and receivable scheduler.
ALTER TABLE public.leases
  ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE public.leases
  ADD CONSTRAINT leases_end_date_after_start_check
  CHECK (end_date IS NULL OR end_date >= start_date);
