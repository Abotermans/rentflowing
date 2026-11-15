-- Read-only release audit. Run when document uploads are otherwise quiet.
SELECT 'documents_missing_file' AS check_name, count(*)::bigint AS affected
FROM public.lease_documents d
LEFT JOIN storage.objects o
  ON o.bucket_id = 'lease-documents' AND o.name = d.storage_path
WHERE o.id IS NULL

UNION ALL
SELECT 'unreferenced_stored_files', count(*)::bigint
FROM storage.objects o
LEFT JOIN public.lease_documents d ON d.storage_path = o.name
LEFT JOIN public.lease_document_file_deletions q ON q.storage_path = o.name
WHERE o.bucket_id = 'lease-documents' AND d.id IS NULL AND q.id IS NULL
  AND o.created_at < now() - interval '1 hour'

UNION ALL
SELECT 'queued_files_still_referenced', count(*)::bigint
FROM public.lease_document_file_deletions q
JOIN public.lease_documents d ON d.storage_path = q.storage_path

UNION ALL
SELECT 'shared_document_file_paths', coalesce(sum(surplus), 0)::bigint
FROM (
  SELECT count(*) - 1 AS surplus
  FROM public.lease_documents
  GROUP BY storage_path
  HAVING count(*) > 1
) collisions;
