-- Read-only release audit. A lease-schedule receivable contains the full lease
-- amount but currently has only one unit_id, so the unit return can be wrong.
-- Review every listed lease before treating unit-level profitability as final.
WITH multiunit_leases AS (
  SELECT lease_id, count(DISTINCT unit_id) AS unit_count
  FROM public.lease_unit_assignments
  GROUP BY lease_id
  HAVING count(DISTINCT unit_id) > 1
), current_assignment_shares AS (
  SELECT a.lease_id,
    sum(a.rent_share) AS current_rent_shares,
    sum(a.charges_share) AS current_charges_shares
  FROM public.lease_unit_assignments a
  WHERE a.start_date <= current_date
    AND (a.end_date IS NULL OR a.end_date >= current_date)
  GROUP BY a.lease_id
), schedule_summary AS (
  SELECT r.lease_id,
    count(*) AS schedule_rows,
    count(DISTINCT r.unit_id) AS attributed_unit_count,
    count(*) FILTER (WHERE r.allocated_amount > 0 OR r.status = 'paid') AS protected_rows,
    sum(r.expected_amount) FILTER (WHERE r.item_type = 'rent') AS billed_rent,
    sum(r.expected_amount) FILTER (WHERE r.item_type = 'charges') AS billed_charges
  FROM public.receivable_items r
  WHERE r.origin = 'lease-schedule'
    AND r.status <> 'cancelled'
  GROUP BY r.lease_id
)
SELECT l.lease_reference, l.lifecycle_stage, m.unit_count,
  l.monthly_rent, s.current_rent_shares,
  l.monthly_charges, s.current_charges_shares,
  coalesce(r.schedule_rows, 0) AS schedule_rows,
  coalesce(r.attributed_unit_count, 0) AS attributed_unit_count,
  coalesce(r.protected_rows, 0) AS protected_rows,
  coalesce(r.billed_rent, 0) AS billed_rent,
  coalesce(r.billed_charges, 0) AS billed_charges
FROM multiunit_leases m
JOIN public.leases l ON l.id = m.lease_id
LEFT JOIN current_assignment_shares s ON s.lease_id = m.lease_id
LEFT JOIN schedule_summary r ON r.lease_id = m.lease_id
ORDER BY l.lease_reference;

-- Which units were used as anchors for each whole-lease row? Compare the
-- anchored amount with the unit's assignment share; they are not equivalent.
SELECT l.lease_reference, u.unit_code, u.unit_type,
  r.item_type, r.currency_code, r.status,
  count(*) AS schedule_rows,
  sum(r.expected_amount) AS total_expected,
  sum(r.allocated_amount) AS total_allocated
FROM public.receivable_items r
JOIN public.leases l ON l.id = r.lease_id
LEFT JOIN public.units u ON u.id = r.unit_id
WHERE r.origin = 'lease-schedule'
  AND r.lease_id IN (
    SELECT lease_id FROM public.lease_unit_assignments
    GROUP BY lease_id HAVING count(DISTINCT unit_id) > 1
  )
GROUP BY l.lease_reference, u.unit_code, u.unit_type,
  r.item_type, r.currency_code, r.status
ORDER BY l.lease_reference, u.unit_code, r.item_type, r.status;
