-- Run read-only on restored staging before enabling the file-cleanup worker.
SELECT d.id AS document_id, d.portfolio_id, d.lease_id, d.storage_path,
  path.expected_prefix
FROM public.lease_documents AS d
CROSS JOIN LATERAL (
  SELECT d.portfolio_id::text || '/' || d.lease_id::text || '/' || d.id::text || '/' AS expected_prefix
) AS path
CROSS JOIN LATERAL (
  SELECT substr(d.storage_path, length(path.expected_prefix) + 1) AS filename
) AS file
WHERE NOT starts_with(d.storage_path, path.expected_prefix)
  OR file.filename IN ('', '.', '..')
  OR position('/' in file.filename) > 0
  OR position(chr(92) in file.filename) > 0
  OR position('%' in file.filename) > 0
  OR file.filename ~ '[[:cntrl:]]'
ORDER BY d.portfolio_id, d.lease_id, d.id;

-- The queue table exists only after the deletion-outbox migration.
SELECT q.id AS queue_id, q.portfolio_id, q.lease_id, q.document_id,
  q.storage_path, q.attempts, q.last_error
FROM public.lease_document_file_deletions AS q
CROSS JOIN LATERAL (
  SELECT q.portfolio_id::text || '/' || q.lease_id::text || '/' || q.document_id::text || '/' AS expected_prefix
) AS path
CROSS JOIN LATERAL (
  SELECT substr(q.storage_path, length(path.expected_prefix) + 1) AS filename
) AS file
WHERE NOT starts_with(q.storage_path, path.expected_prefix)
  OR file.filename IN ('', '.', '..')
  OR position('/' in file.filename) > 0
  OR position(chr(92) in file.filename) > 0
  OR position('%' in file.filename) > 0
  OR file.filename ~ '[[:cntrl:]]'
ORDER BY q.created_at, q.id;
