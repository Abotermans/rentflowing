-- Read-only detail for tenant_status_lease_mismatch in audit-financial-consistency.sql.
SELECT t.portfolio_id, t.id AS tenant_id, t.status AS stored_status,
  linked.expected_status, linked.leases
FROM public.tenants t
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN bool_or(l.lifecycle_stage = 'active') THEN 'active'
    WHEN bool_or(l.lifecycle_stage IN ('draft', 'pending-signature', 'signed')) THEN 'applicant'
    WHEN count(*) > 0 THEN 'former'
    ELSE NULL
  END AS expected_status,
  coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'reference', l.lease_reference, 'stage', l.lifecycle_stage
  ) ORDER BY l.lease_reference) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS leases
  FROM public.leases l
  WHERE l.portfolio_id = t.portfolio_id
    AND (l.tenant_ids ? t.id::text OR l.billing_tenant_id = t.id)
) linked
WHERE linked.expected_status IS NOT NULL
  AND t.status IS DISTINCT FROM linked.expected_status
ORDER BY t.portfolio_id, t.id;
