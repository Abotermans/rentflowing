CREATE TABLE public.lease_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  reason text,
  notes text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lease_status_changes_lease_idx ON public.lease_status_changes(lease_id, changed_at DESC);
CREATE INDEX lease_status_changes_portfolio_idx ON public.lease_status_changes(portfolio_id);

GRANT SELECT, INSERT ON public.lease_status_changes TO authenticated;
GRANT ALL ON public.lease_status_changes TO service_role;

ALTER TABLE public.lease_status_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lease_status_changes_select" ON public.lease_status_changes
  FOR SELECT TO authenticated
  USING (public.is_portfolio_member(portfolio_id, auth.uid()));

CREATE POLICY "lease_status_changes_insert" ON public.lease_status_changes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));

-- Backfill: one entry per existing lease using its current lifecycle_stage
INSERT INTO public.lease_status_changes (lease_id, portfolio_id, from_stage, to_stage, reason, changed_at)
SELECT id, portfolio_id, NULL, lifecycle_stage, 'backfill', COALESCE(updated_at, created_at, now())
FROM public.leases;