-- Read-only detail for duplicate_lease_guarantees in audit-financial-consistency.sql.
SELECT g.portfolio_id, g.lease_id, l.lease_reference,
  count(*)::integer AS guarantee_count,
  jsonb_agg(jsonb_build_object(
    'id', g.id,
    'type', g.type,
    'status', g.status,
    'expectedAmount', g.expected_amount,
    'receivedAmount', g.received_amount,
    'retentionAmount', g.retention_amount,
    'receivedDate', g.received_date,
    'releaseDate', g.release_date,
    'createdAt', g.created_at
  ) ORDER BY g.created_at, g.id) AS guarantees
FROM public.guarantees g
JOIN public.leases l ON l.id = g.lease_id
GROUP BY g.portfolio_id, g.lease_id, l.lease_reference
HAVING count(*) > 1
ORDER BY g.portfolio_id, l.lease_reference;
