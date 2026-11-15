-- Read-only preflight for the three confirmed Demo tenant status mismatches.
-- Every affected count must be zero immediately before a separately approved repair.
WITH expected(id, old_status, new_status, expected_updated_at) AS (
  VALUES
    ('0349ad9c-7c63-44c3-a92c-96816f390d88'::uuid, 'applicant', 'active',
      '2026-01-15 00:00:00+00'::timestamptz),
    ('8f09fdd0-87b0-4291-8fd8-f8ed4d9913fc'::uuid, 'active', 'applicant',
      '2026-06-16 11:18:35.416687+00'::timestamptz),
    ('cb7892a0-d718-4154-bfb7-a3a0aceed577'::uuid, 'former', 'applicant',
      '2025-12-31 00:00:00+00'::timestamptz)
), derived AS (
  SELECT t.id, t.status, CASE
    WHEN bool_or(l.lifecycle_stage = 'active') THEN 'active'
    WHEN bool_or(l.lifecycle_stage IN ('draft', 'pending-signature', 'signed')) THEN 'applicant'
    WHEN count(l.id) > 0 THEN 'former'
    ELSE NULL
  END AS expected_status
  FROM public.tenants t
  LEFT JOIN public.leases l ON l.portfolio_id = t.portfolio_id
    AND (l.tenant_ids ? t.id::text OR l.billing_tenant_id = t.id)
  GROUP BY t.id, t.status
)
SELECT 'tenant_identity_and_versions' AS check_name,
  (3 - count(*))::bigint AS affected
FROM expected e JOIN public.tenants t ON t.id = e.id
WHERE t.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
  AND t.status = e.old_status AND t.updated_at = e.expected_updated_at
UNION ALL
SELECT 'derived_target_statuses', (3 - count(*))::bigint
FROM expected e JOIN derived d ON d.id = e.id
WHERE d.expected_status = e.new_status
UNION ALL
SELECT 'unexpected_tenant_status_mismatches', count(*)
FROM derived d
WHERE d.expected_status IS NOT NULL AND d.status IS DISTINCT FROM d.expected_status
  AND NOT EXISTS (SELECT 1 FROM expected e WHERE e.id = d.id);
