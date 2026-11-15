-- Manual referenced-file guard for the observed Lovable schema.
-- Do not run without separate write approval and a fresh read-only preflight.
-- Apply only after hotfix-lease-document-writers.sql; the later
-- 20261018235600 migration installs the same guard during normal migration.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regprocedure('public.can_delete_lease_document_file(text)') IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lease_documents'
        AND column_name = 'storage_path')
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'Editors can delete lease-documents files'
        AND cmd = 'DELETE' AND roles = ARRAY['authenticated']::name[]
        AND qual LIKE '%has_portfolio_role%') <> 1
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')) <> 2
  THEN
    RAISE EXCEPTION 'Lease-document writer hotfix is missing or changed; file guard aborted';
  END IF;
END;
$$;

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

DROP POLICY "Editors can delete lease-documents files" ON storage.objects;
CREATE POLICY "Editors can delete lease-documents files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lease-documents'
    AND public.can_delete_lease_document_file(name)
  );

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'Editors can delete lease-documents files'
        AND cmd = 'DELETE' AND qual LIKE '%can_delete_lease_document_file%') <> 1
    OR to_regprocedure('public.can_delete_lease_document_file(text)') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'lease_documents'
        AND indexname = 'lease_documents_storage_path_idx')
  THEN
    RAISE EXCEPTION 'Lease-document file guard postcondition failed; rolled back';
  END IF;
END;
$$;
COMMIT;
