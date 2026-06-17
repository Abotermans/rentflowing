DROP POLICY IF EXISTS "Portfolios: members can read" ON public.portfolios;

CREATE POLICY "Portfolios: members and creators can read"
ON public.portfolios
FOR SELECT
TO authenticated
USING (
  public.is_portfolio_member(id, auth.uid())
  OR created_by = auth.uid()
);