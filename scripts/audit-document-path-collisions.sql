-- Read-only preflight before enforcing one Storage object per document.
SELECT d.storage_path, count(*)::int AS document_count,
  array_agg(d.id ORDER BY d.id) AS document_ids,
  array_agg(d.lease_id ORDER BY d.id) AS lease_ids
FROM public.lease_documents AS d
GROUP BY d.storage_path
HAVING count(*) > 1
ORDER BY d.storage_path;
