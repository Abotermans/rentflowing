ALTER TABLE public.portfolios
ADD COLUMN IF NOT EXISTS show_occupancy_operations boolean NOT NULL DEFAULT false;