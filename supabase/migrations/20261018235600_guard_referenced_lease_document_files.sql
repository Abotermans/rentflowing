-- A document's file must remain available until its metadata is deleted.
CREATE INDEX IF NOT EXISTS lease_documents_storage_path_idx
  ON public.lease_documents(storage_path);

CREATE FUNCTION public.can_delete_lease_document_file(p_storage_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.has_portfolio_role(
    NULLIF((storage.foldername(p_storage_path))[1], '')::uuid,
    auth.uid(),
    ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) AND NOT EXISTS (
    SELECT 1 FROM public.lease_documents d
    WHERE d.storage_path = p_storage_path
  );
$$;

REVOKE ALL ON FUNCTION public.can_delete_lease_document_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_lease_document_file(text) TO authenticated;

DROP POLICY IF EXISTS "Editors can delete lease-documents files" ON storage.objects;
CREATE POLICY "Editors can delete lease-documents files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lease-documents'
    AND public.can_delete_lease_document_file(name)
  );
