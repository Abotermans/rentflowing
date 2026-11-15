ALTER TABLE public.cost_entries
  ADD COLUMN IF NOT EXISTS recoverable_percentage numeric(5,2);

-- Preserve the historical 50/50 interpretation of existing partial entries.
UPDATE public.cost_entries
SET recoverable_percentage = 50
WHERE recovery_type = 'partially-recoverable'
  AND recoverable_percentage IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cost_entries'::regclass
      AND conname = 'cost_entries_recoverable_percentage_check'
  ) THEN
    ALTER TABLE public.cost_entries
      ADD CONSTRAINT cost_entries_recoverable_percentage_check
      CHECK (
        (recovery_type = 'partially-recoverable'
          AND recoverable_percentage IS NOT NULL
          AND recoverable_percentage > 0
          AND recoverable_percentage < 100)
        OR
        (recovery_type <> 'partially-recoverable'
          AND recoverable_percentage IS NULL)
      );
  END IF;
END $$;
