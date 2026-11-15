-- Read-only detail for rent/charges lease_schedule_without_plausible_assignment.
-- Use the entire due month when cycle_end_date is absent, so a mid-month
-- assignment does not become a false positive solely because billing is early.
SELECT r.id, l.lease_reference, u.unit_code, r.item_type, r.period_month,
  r.due_date, r.cycle_end_date, r.currency_code, r.expected_amount,
  r.allocated_amount, r.status
FROM public.receivable_items r
JOIN public.leases l ON l.id = r.lease_id
JOIN public.units u ON u.id = r.unit_id
WHERE r.origin = 'lease-schedule'
  AND r.item_type IN ('rent', 'charges')
  AND NOT EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    WHERE a.lease_id = r.lease_id AND a.unit_id = r.unit_id
      AND a.start_date <= coalesce(
        r.cycle_end_date,
        (date_trunc('month', r.due_date) + interval '1 month - 1 day')::date
      )
      AND (a.end_date IS NULL
        OR a.end_date >= date_trunc('month', r.due_date)::date)
  )
ORDER BY l.lease_reference, u.unit_code, r.due_date, r.item_type, r.id;
