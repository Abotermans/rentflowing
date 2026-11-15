-- Read-only detail for property_cost_overallocated in audit-financial-consistency.sql.
-- These rows need a review of ownership shares and stored unit allocations.
SELECT c.id AS cost_entry_id, p.name AS property_name, c.label AS cost_label,
  c.currency_code, c.amount AS invoice_amount,
  round(c.amount * CASE WHEN p.is_partially_owned
    THEN least(1, greatest(0, owned.shares / greatest(p.millieme_base, 1)))
    ELSE 1 END, 2) AS owner_managed_amount,
  allocated.amount AS allocated_amount
FROM public.cost_entries c
JOIN public.properties p ON p.id = c.property_id
CROSS JOIN LATERAL (
  SELECT coalesce(sum(CASE WHEN jsonb_typeof(u.millieme_shares->'general') = 'number'
    THEN (u.millieme_shares->>'general')::numeric ELSE 0 END), 0) AS shares
  FROM public.units u WHERE u.property_id = p.id
) owned
CROSS JOIN LATERAL (
  SELECT count(*) AS rows, coalesce(sum(a.allocated_amount), 0) AS amount
  FROM public.cost_allocation_results a WHERE a.cost_entry_id = c.id
) allocated
WHERE c.status = 'active' AND c.unit_id IS NULL AND allocated.rows > 0
  AND allocated.amount > round(c.amount * CASE WHEN p.is_partially_owned
    THEN least(1, greatest(0, owned.shares / greatest(p.millieme_base, 1)))
    ELSE 1 END, 2) + 0.01
ORDER BY p.name, c.label, c.id;
