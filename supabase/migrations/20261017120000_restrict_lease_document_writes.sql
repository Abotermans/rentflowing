-- Match lease document mutations to the operational data writer roles.
DROP POLICY IF EXISTS "Members can insert lease documents" ON public.lease_documents;
DROP POLICY IF EXISTS "Editors can insert lease documents" ON public.lease_documents;
CREATE POLICY "Editors can insert lease documents"
  ON public.lease_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[])
    AND EXISTS (SELECT 1 FROM public.leases l WHERE l.id = lease_id AND l.portfolio_id = portfolio_id)
  );

DROP POLICY IF EXISTS "Members can update lease documents" ON public.lease_documents;
DROP POLICY IF EXISTS "Editors can update lease documents" ON public.lease_documents;
CREATE POLICY "Editors can update lease documents"
  ON public.lease_documents FOR UPDATE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]))
  WITH CHECK (
    public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[])
    AND EXISTS (SELECT 1 FROM public.leases l WHERE l.id = lease_id AND l.portfolio_id = portfolio_id)
  );

DROP POLICY IF EXISTS "Members can delete lease documents" ON public.lease_documents;
DROP POLICY IF EXISTS "Editors can delete lease documents" ON public.lease_documents;
CREATE POLICY "Editors can delete lease documents"
  ON public.lease_documents FOR DELETE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]));

DROP POLICY IF EXISTS "Members can upload lease-documents files" ON storage.objects;
DROP POLICY IF EXISTS "Editors can upload lease-documents files" ON storage.objects;
CREATE POLICY "Editors can upload lease-documents files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lease-documents'
    AND public.has_portfolio_role(
      NULLIF((storage.foldername(name))[1], '')::uuid,
      auth.uid(),
      ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
    )
  );

DROP POLICY IF EXISTS "Members can delete lease-documents files" ON storage.objects;
DROP POLICY IF EXISTS "Editors can delete lease-documents files" ON storage.objects;
CREATE POLICY "Editors can delete lease-documents files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lease-documents'
    AND public.has_portfolio_role(
      NULLIF((storage.foldername(name))[1], '')::uuid,
      auth.uid(),
      ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
    )
  );
