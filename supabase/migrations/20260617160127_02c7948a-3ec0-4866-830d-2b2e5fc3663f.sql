ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS millieme_shares jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS millieme_base integer NOT NULL DEFAULT 1000;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS millieme_base integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS millieme_keys text[] NOT NULL DEFAULT ARRAY['general']::text[];

ALTER TABLE public.allocation_rules
  ADD COLUMN IF NOT EXISTS share_key text;