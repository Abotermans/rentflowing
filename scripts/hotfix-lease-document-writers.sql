-- Manual policy-only hotfix for the currently observed Lovable schema.
-- Do not run without separate approval and a fresh read-only policy preflight.
-- The later 20261017120000 migration replaces these same policy names.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regprocedure('public.has_portfolio_role(uuid,uuid,public.portfolio_role[])') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'lease_documents' AND c.relrowsecurity
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage' AND c.relname = 'objects' AND c.relrowsecurity
    )
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'lease_documents'
        AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')) <> 3
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'lease_documents'
        AND roles = ARRAY['authenticated']::name[]
        AND ((policyname = 'Members can insert lease documents' AND cmd = 'INSERT'
              AND with_check LIKE '%is_portfolio_member%')
          OR (policyname = 'Members can update lease documents' AND cmd = 'UPDATE'
              AND qual LIKE '%is_portfolio_member%' AND with_check LIKE '%is_portfolio_member%')
          OR (policyname = 'Members can delete lease documents' AND cmd = 'DELETE'
              AND qual LIKE '%is_portfolio_member%'))) <> 3
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')) <> 2
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND roles = ARRAY['authenticated']::name[]
        AND ((policyname = 'Members can upload lease-documents files' AND cmd = 'INSERT'
              AND with_check LIKE '%lease-documents%' AND with_check LIKE '%is_portfolio_member%')
          OR (policyname = 'Members can delete lease-documents files' AND cmd = 'DELETE'
              AND qual LIKE '%lease-documents%' AND qual LIKE '%is_portfolio_member%'))) <> 2
  THEN
    RAISE EXCEPTION 'Lease-document policies or role helper changed; hotfix aborted';
  END IF;
END;
$$;

DROP POLICY "Members can insert lease documents" ON public.lease_documents;
DROP POLICY "Members can update lease documents" ON public.lease_documents;
DROP POLICY "Members can delete lease documents" ON public.lease_documents;
DROP POLICY "Members can upload lease-documents files" ON storage.objects;
DROP POLICY "Members can delete lease-documents files" ON storage.objects;

CREATE POLICY "Editors can insert lease documents"
  ON public.lease_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[])
    AND EXISTS (SELECT 1 FROM public.leases l WHERE l.id = lease_id AND l.portfolio_id = portfolio_id)
  );
CREATE POLICY "Editors can update lease documents"
  ON public.lease_documents FOR UPDATE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]))
  WITH CHECK (
    public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[])
    AND EXISTS (SELECT 1 FROM public.leases l WHERE l.id = lease_id AND l.portfolio_id = portfolio_id)
  );
CREATE POLICY "Editors can delete lease documents"
  ON public.lease_documents FOR DELETE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]));
CREATE POLICY "Editors can upload lease-documents files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lease-documents'
    AND public.has_portfolio_role(
      NULLIF((storage.foldername(name))[1], '')::uuid,
      auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
    )
  );
CREATE POLICY "Editors can delete lease-documents files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lease-documents'
    AND public.has_portfolio_role(
      NULLIF((storage.foldername(name))[1], '')::uuid,
      auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
    )
  );

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'lease_documents'
        AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')) <> 3
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'lease_documents'
        AND policyname LIKE 'Editors can % lease documents'
        AND COALESCE(qual, '') || COALESCE(with_check, '') LIKE '%has_portfolio_role%') <> 3
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')) <> 2
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname LIKE 'Editors can % lease-documents files'
        AND COALESCE(qual, '') || COALESCE(with_check, '') LIKE '%has_portfolio_role%') <> 2
  THEN
    RAISE EXCEPTION 'Lease-document hotfix postcondition failed; policies rolled back';
  END IF;
END;
$$;

COMMIT;
