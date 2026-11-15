ALTER TABLE public.portfolios
  ADD COLUMN receivable_lead_days integer NOT NULL DEFAULT 15
  CONSTRAINT portfolios_receivable_lead_days_range
    CHECK (receivable_lead_days BETWEEN 0 AND 120);
