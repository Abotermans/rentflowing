ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS is_partially_owned boolean NOT NULL DEFAULT false;

ALTER TABLE public.allocation_rules
  ADD COLUMN IF NOT EXISTS millieme_allocation_mode text NOT NULL DEFAULT 'normalized';

ALTER TABLE public.allocation_rules
  DROP CONSTRAINT IF EXISTS allocation_rules_millieme_allocation_mode_check;

ALTER TABLE public.allocation_rules
  ADD CONSTRAINT allocation_rules_millieme_allocation_mode_check
  CHECK (millieme_allocation_mode IN ('normalized', 'absolute'));
