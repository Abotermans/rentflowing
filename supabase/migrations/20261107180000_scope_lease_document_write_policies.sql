-- Qualify the outer row in the correlated lease lookup. An unqualified
-- portfolio_id inside the subquery resolves to leases.portfolio_id itself.
DROP POLICY IF EXISTS "Editors can insert lease documents" ON public.lease_documents;
CREATE POLICY "Editors can insert lease documents"
  ON public.lease_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_portfolio_role(
      lease_documents.portfolio_id, auth.uid(),
      ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
    )
    AND EXISTS (
      SELECT 1 FROM public.leases AS lease
      WHERE lease.id = lease_documents.lease_id
        AND lease.portfolio_id = lease_documents.portfolio_id
    )
  );

DROP POLICY IF EXISTS "Editors can update lease documents" ON public.lease_documents;
CREATE POLICY "Editors can update lease documents"
  ON public.lease_documents FOR UPDATE TO authenticated
  USING (public.has_portfolio_role(
    lease_documents.portfolio_id, auth.uid(),
    ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ))
  WITH CHECK (
    public.has_portfolio_role(
      lease_documents.portfolio_id, auth.uid(),
      ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
    )
    AND EXISTS (
      SELECT 1 FROM public.leases AS lease
      WHERE lease.id = lease_documents.lease_id
        AND lease.portfolio_id = lease_documents.portfolio_id
    )
  );
