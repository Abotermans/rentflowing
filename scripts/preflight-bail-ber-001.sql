-- Read-only preflight for the BAIL-BER-001 billing repair described in RELEASE.md.
-- Every affected count must be zero immediately before any approved repair.
WITH target AS (
  SELECT * FROM public.leases
  WHERE id = '52694c9c-1ec2-4581-b289-5bfcd618326f'::uuid
    AND portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
    AND lease_reference = 'BAIL-BER-001'
), schedule AS (
  SELECT r.* FROM public.receivable_items r
  WHERE r.lease_id = '52694c9c-1ec2-4581-b289-5bfcd618326f'::uuid
), expected_slots AS (
  SELECT due_date::date, item_type,
    CASE WHEN due_date < '2026-08-01'::date THEN 2 ELSE 1 END AS expected_rows
  FROM generate_series('2025-04-01'::date, '2026-11-01'::date, interval '1 month') AS due_date
  CROSS JOIN (VALUES ('rent'), ('charges')) AS types(item_type)
), slots AS (
  SELECT due_date, item_type, count(*) AS row_count,
    count(*) FILTER (WHERE unit_id = '7effa754-d886-46a9-a601-df68fe7b65bc'::uuid) AS main_rows,
    count(*) FILTER (WHERE unit_id = 'fa7daf21-cb8b-48a6-9c6a-132eefcf4b08'::uuid) AS storage_rows,
    count(DISTINCT (tenant_id, property_id, currency_code, expected_amount,
      cycle_index, cycle_end_date, label, notes, priority)) AS bill_variants
  FROM schedule
  GROUP BY due_date, item_type
)
SELECT 'lease_identity_and_terms' AS check_name,
  CASE WHEN (SELECT count(*) FROM target
    WHERE property_id = '222d1577-6e88-4606-8b32-97ff5794a222'::uuid
      AND billing_tenant_id = '4c4ca095-b6c4-4bc8-af5f-f895c56b9c4b'::uuid
      AND lifecycle_stage = 'active' AND start_date = '2025-04-01'
      AND end_date = '2028-03-31' AND due_day_of_month = 1
      AND rent_formula = 1 AND monthly_rent = 910 AND monthly_charges = 250) = 1
    THEN 0 ELSE 1 END::bigint AS affected
UNION ALL
SELECT 'assignment_shape', CASE WHEN (
  SELECT count(*) FROM public.lease_unit_assignments a
  WHERE a.lease_id = '52694c9c-1ec2-4581-b289-5bfcd618326f'::uuid
    AND a.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
    AND a.start_date = '2025-04-01' AND a.end_date = '2028-03-31'
    AND ((a.unit_id = '7effa754-d886-46a9-a601-df68fe7b65bc'::uuid
          AND a.rent_share = 850 AND a.charges_share = 190)
      OR (a.unit_id = 'fa7daf21-cb8b-48a6-9c6a-132eefcf4b08'::uuid
          AND a.rent_share = 60 AND a.charges_share = 0))
) = 2 AND (
  SELECT count(*) FROM public.lease_unit_assignments
  WHERE lease_id = '52694c9c-1ec2-4581-b289-5bfcd618326f'::uuid
) = 2 THEN 0 ELSE 1 END::bigint
UNION ALL
SELECT 'schedule_row_count', abs((SELECT count(*) FROM schedule) - 72)
UNION ALL
SELECT 'missing_or_changed_slots', count(*)
FROM expected_slots e LEFT JOIN slots s USING (due_date, item_type)
WHERE s.row_count IS DISTINCT FROM e.expected_rows
  OR s.main_rows IS DISTINCT FROM CASE WHEN e.expected_rows = 2 THEN 1 ELSE 0 END
  OR s.storage_rows IS DISTINCT FROM 1 OR s.bill_variants IS DISTINCT FROM 1
UNION ALL
SELECT 'unexpected_slots', count(*)
FROM slots s LEFT JOIN expected_slots e USING (due_date, item_type)
WHERE e.due_date IS NULL
UNION ALL
SELECT 'schedule_row_shape', count(*)
FROM schedule r
WHERE r.portfolio_id IS DISTINCT FROM 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
  OR r.property_id IS DISTINCT FROM '222d1577-6e88-4606-8b32-97ff5794a222'::uuid
  OR r.tenant_id IS DISTINCT FROM '4c4ca095-b6c4-4bc8-af5f-f895c56b9c4b'::uuid
  OR r.origin IS DISTINCT FROM 'lease-schedule'
  OR r.currency_code IS DISTINCT FROM 'EUR'
  OR r.status NOT IN ('open', 'overdue')
  OR r.allocated_amount IS DISTINCT FROM 0
  OR r.outstanding_amount IS DISTINCT FROM r.expected_amount
  OR r.expected_amount IS DISTINCT FROM CASE r.item_type
      WHEN 'rent' THEN 910::numeric WHEN 'charges' THEN 250::numeric END
  OR r.period_month IS DISTINCT FROM to_char(r.due_date, 'YYYY-MM')
  OR r.cycle_index IS DISTINCT FROM ((extract(year FROM age(r.due_date, '2025-04-01'::date))::integer * 12)
    + extract(month FROM age(r.due_date, '2025-04-01'::date))::integer + 1)
  OR r.cycle_end_date IS DISTINCT FROM (date_trunc('month', r.due_date)
    + interval '1 month - 1 day')::date
  OR r.label IS DISTINCT FROM CASE r.item_type
      WHEN 'rent' THEN 'Monthly Rent' WHEN 'charges' THEN 'Monthly Charges' END
  OR r.notes IS DISTINCT FROM ''
  OR r.priority IS DISTINCT FROM CASE r.item_type
      WHEN 'rent' THEN 10 WHEN 'charges' THEN 20 END
UNION ALL
SELECT 'receipt_allocations', count(*) FROM public.receipt_allocations a
JOIN schedule r ON r.id = a.receivable_item_id
UNION ALL
SELECT 'cash_receipts', count(*) FROM public.cash_receipts
WHERE lease_id = '52694c9c-1ec2-4581-b289-5bfcd618326f'::uuid
UNION ALL
SELECT 'charges_reconciliations', count(*) FROM public.charges_reconciliations
WHERE lease_id = '52694c9c-1ec2-4581-b289-5bfcd618326f'::uuid
  OR receivable_item_id IN (SELECT id FROM schedule)
UNION ALL
SELECT 'amendments', count(*) FROM public.lease_amendments
WHERE lease_id = '52694c9c-1ec2-4581-b289-5bfcd618326f'::uuid;
