
-- 1. Table
CREATE TABLE public.lease_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
  amendment_id uuid NULL REFERENCES public.lease_amendments(id) ON DELETE SET NULL,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_date date NOT NULL,
  notes text NULL,
  storage_path text NOT NULL,
  mime_type text NULL,
  size_bytes bigint NULL,
  original_filename text NOT NULL,
  uploaded_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lease_documents_lease_id_idx ON public.lease_documents(lease_id);
CREATE INDEX lease_documents_amendment_id_idx ON public.lease_documents(amendment_id);
CREATE INDEX lease_documents_portfolio_id_idx ON public.lease_documents(portfolio_id);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_documents TO authenticated;
GRANT ALL ON public.lease_documents TO service_role;

-- 3. RLS
ALTER TABLE public.lease_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view lease documents"
  ON public.lease_documents FOR SELECT TO authenticated
  USING (public.is_portfolio_member(portfolio_id, auth.uid()));

CREATE POLICY "Members can insert lease documents"
  ON public.lease_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_portfolio_member(portfolio_id, auth.uid()));

CREATE POLICY "Members can update lease documents"
  ON public.lease_documents FOR UPDATE TO authenticated
  USING (public.is_portfolio_member(portfolio_id, auth.uid()))
  WITH CHECK (public.is_portfolio_member(portfolio_id, auth.uid()));

CREATE POLICY "Members can delete lease documents"
  ON public.lease_documents FOR DELETE TO authenticated
  USING (public.is_portfolio_member(portfolio_id, auth.uid()));

-- 4. updated_at trigger
CREATE TRIGGER lease_documents_touch_updated_at
  BEFORE UPDATE ON public.lease_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Storage policies on lease-documents bucket
-- Path layout: {portfolio_id}/{lease_id}/{document_id}/{filename}
CREATE POLICY "Members can read lease-documents files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'lease-documents'
    AND public.is_portfolio_member(
      NULLIF((storage.foldername(name))[1], '')::uuid,
      auth.uid()
    )
  );

CREATE POLICY "Members can upload lease-documents files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lease-documents'
    AND public.is_portfolio_member(
      NULLIF((storage.foldername(name))[1], '')::uuid,
      auth.uid()
    )
  );

CREATE POLICY "Members can delete lease-documents files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lease-documents'
    AND public.is_portfolio_member(
      NULLIF((storage.foldername(name))[1], '')::uuid,
      auth.uid()
    )
  );
