ALTER TABLE public.cost_categories
  ADD COLUMN IF NOT EXISTS recognition_mode_default text NOT NULL DEFAULT 'immediate';

ALTER TABLE public.cost_categories
  DROP CONSTRAINT IF EXISTS cost_categories_recognition_mode_default_check;

ALTER TABLE public.cost_categories
  ADD CONSTRAINT cost_categories_recognition_mode_default_check
  CHECK (recognition_mode_default IN ('immediate', 'amortized'));

ALTER TABLE public.cost_entries
  ADD COLUMN IF NOT EXISTS recognition_mode text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS amortization_start_date date,
  ADD COLUMN IF NOT EXISTS amortization_end_date date;

ALTER TABLE public.cost_entries
  DROP CONSTRAINT IF EXISTS cost_entries_recognition_mode_check;

ALTER TABLE public.cost_entries
  ADD CONSTRAINT cost_entries_recognition_mode_check
  CHECK (recognition_mode IN ('immediate', 'amortized'));

ALTER TABLE public.cost_entries
  DROP CONSTRAINT IF EXISTS cost_entries_amortization_dates_check;

ALTER TABLE public.cost_entries
  ADD CONSTRAINT cost_entries_amortization_dates_check
  CHECK (
    recognition_mode <> 'amortized'
    OR (
      amortization_start_date IS NOT NULL
      AND amortization_end_date IS NOT NULL
      AND amortization_end_date >= amortization_start_date
    )
  );
