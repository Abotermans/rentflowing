-- Read-only detail for repeated lease billing slots in the financial audit.
-- Legacy rows may split one bill across units, so a repeated slot alone does
-- not prove overbilling. Compare the slot total with the contractual cycle,
-- including any amendments or indexation, before repairing anything.
WITH duplicate_slots AS (
  SELECT portfolio_id, lease_id, item_type, due_date, period_month,
    count(*) AS billing_slot_rows,
    count(DISTINCT unit_id) AS billing_slot_units,
    count(DISTINCT currency_code) AS billing_slot_currencies,
    sum(expected_amount) AS billing_slot_expected,
    sum(allocated_amount) AS billing_slot_allocated,
    sum(outstanding_amount) AS billing_slot_outstanding
  FROM public.receivable_items
  WHERE origin = 'lease-schedule' AND lease_id IS NOT NULL
  GROUP BY portfolio_id, lease_id, item_type, due_date, period_month
  HAVING count(*) > 1
)
SELECT l.lease_reference, p.name AS property_name, u.unit_code,
  r.id AS receivable_id, r.item_type, r.period_month, r.due_date,
  r.currency_code, r.status, r.expected_amount, r.allocated_amount,
  r.outstanding_amount, r.cycle_end_date, r.updated_at,
  d.billing_slot_rows, d.billing_slot_units, d.billing_slot_currencies,
  d.billing_slot_expected, d.billing_slot_allocated,
  d.billing_slot_outstanding,
  (SELECT count(*) FROM public.receipt_allocations a
   WHERE a.receivable_item_id = r.id) AS receipt_allocation_count
FROM duplicate_slots d
JOIN public.receivable_items r ON r.portfolio_id = d.portfolio_id
  AND r.lease_id = d.lease_id
  AND r.item_type = d.item_type
  AND r.due_date = d.due_date
  AND r.period_month IS NOT DISTINCT FROM d.period_month
  AND r.origin = 'lease-schedule'
JOIN public.leases l ON l.id = d.lease_id
LEFT JOIN public.properties p ON p.id = l.property_id
LEFT JOIN public.units u ON u.id = r.unit_id
ORDER BY l.lease_reference, r.due_date, r.item_type, r.period_month,
  r.created_at, r.id;
