-- Read-only audit: lease-schedule rows anchored to ancillary units.
-- Zero candidates means no main unit assignment overlaps the billing month;
-- two or more candidates require contractual review before reassignment.
WITH ancillary_anchors AS (
  SELECT r.id, r.lease_id, r.period_month, r.status, u.unit_type
  FROM public.receivable_items AS r
  JOIN public.units AS u ON u.id = r.unit_id
  WHERE r.origin = 'lease-schedule'
    AND u.unit_type IN ('parking', 'storage')
), candidates AS (
  SELECT r.id, count(DISTINCT assignment.unit_id)::integer AS main_units
  FROM ancillary_anchors AS r
  JOIN public.lease_unit_assignments AS assignment
    ON assignment.lease_id = r.lease_id
    AND assignment.start_date < (r.period_month || '-01')::date + interval '1 month'
    AND (assignment.end_date IS NULL OR assignment.end_date >= (r.period_month || '-01')::date)
  JOIN public.units AS unit ON unit.id = assignment.unit_id
    AND unit.unit_type NOT IN ('parking', 'storage')
  GROUP BY r.id
)
SELECT lease.lease_reference, anchor.unit_type, anchor.status,
  coalesce(candidate.main_units, 0) AS candidate_main_units,
  count(*)::integer AS receivable_count,
  min(anchor.period_month) AS first_period,
  max(anchor.period_month) AS last_period
FROM ancillary_anchors AS anchor
JOIN public.leases AS lease ON lease.id = anchor.lease_id
LEFT JOIN candidates AS candidate ON candidate.id = anchor.id
GROUP BY lease.lease_reference, anchor.unit_type, anchor.status,
  coalesce(candidate.main_units, 0)
ORDER BY receivable_count DESC, lease.lease_reference;
