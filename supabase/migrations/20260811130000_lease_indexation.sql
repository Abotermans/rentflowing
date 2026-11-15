ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS indexation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS indexation_frequency text NOT NULL DEFAULT 'yearly',
  ADD COLUMN IF NOT EXISTS indexation_base_date date,
  ADD COLUMN IF NOT EXISTS indexation_base_index numeric(14,4),
  ADD COLUMN IF NOT EXISTS indexation_current_index numeric(14,4),
  ADD COLUMN IF NOT EXISTS indexation_cap_percent numeric(7,4),
  ADD COLUMN IF NOT EXISTS indexation_rounding_mode text NOT NULL DEFAULT 'nearest-cent',
  ADD COLUMN IF NOT EXISTS indexation_notes text NOT NULL DEFAULT '';

ALTER TABLE public.leases
  DROP CONSTRAINT IF EXISTS leases_indexation_frequency_check,
  ADD CONSTRAINT leases_indexation_frequency_check
    CHECK (indexation_frequency IN ('yearly')),
  DROP CONSTRAINT IF EXISTS leases_indexation_rounding_mode_check,
  ADD CONSTRAINT leases_indexation_rounding_mode_check
    CHECK (indexation_rounding_mode IN ('nearest-cent', 'nearest-euro', 'none')),
  DROP CONSTRAINT IF EXISTS leases_indexation_values_check,
  ADD CONSTRAINT leases_indexation_values_check
    CHECK (
      (indexation_base_index IS NULL OR indexation_base_index > 0)
      AND (indexation_current_index IS NULL OR indexation_current_index > 0)
      AND (indexation_cap_percent IS NULL OR indexation_cap_percent >= 0)
    );
