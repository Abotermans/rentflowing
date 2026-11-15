-- Read-only detail for non_draft_lease_without_main_assignment.
-- No repair is inferred: contractual documents and historical billing must
-- establish whether a main assignment is missing or the lease is invalid.
SELECT l.id AS lease_id, l.lease_reference, l.lifecycle_stage,
  l.start_date, l.end_date, l.move_out_actual_date,
  l.monthly_rent, l.monthly_charges,
  count(a.id) AS assignment_count,
  coalesce(sum(a.rent_share), 0) AS recorded_unit_rent,
  coalesce(sum(a.charges_share), 0) AS recorded_unit_charges,
  string_agg(u.unit_code || ' (' || u.unit_type || ')', ', ' ORDER BY u.unit_code) AS recorded_units
FROM public.leases l
LEFT JOIN public.lease_unit_assignments a ON a.lease_id = l.id
LEFT JOIN public.units u ON u.id = a.unit_id
WHERE l.lifecycle_stage NOT IN ('draft', 'pending-signature')
GROUP BY l.id
HAVING count(a.id) FILTER (WHERE u.unit_type NOT IN ('parking', 'storage')) = 0
ORDER BY l.lease_reference;
