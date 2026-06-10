
ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS charges_billing_mode TEXT NOT NULL DEFAULT 'provision-reconciled';

CREATE TABLE IF NOT EXISTS public.charges_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  provisions_collected NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_recoverable NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta NUMERIC(14,2) NOT NULL DEFAULT 0,
  resolution TEXT NOT NULL,
  receivable_item_id UUID REFERENCES public.receivable_items(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS charges_reconciliations_portfolio_idx ON public.charges_reconciliations(portfolio_id);
CREATE INDEX IF NOT EXISTS charges_reconciliations_lease_idx ON public.charges_reconciliations(lease_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges_reconciliations TO authenticated;
GRANT ALL ON public.charges_reconciliations TO service_role;

ALTER TABLE public.charges_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_select ON public.charges_reconciliations FOR SELECT
  USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY cr_insert ON public.charges_reconciliations FOR INSERT
  WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));
CREATE POLICY cr_update ON public.charges_reconciliations FOR UPDATE
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));
CREATE POLICY cr_delete ON public.charges_reconciliations FOR DELETE
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));

CREATE TRIGGER charges_reconciliations_touch_updated_at
  BEFORE UPDATE ON public.charges_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
