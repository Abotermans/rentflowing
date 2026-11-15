-- Read-only guard for the three proposed single-unit pricing corrections.
-- Every count must be zero immediately before a separately approved write.
WITH expected(lease_id, lease_reference, assignment_id, unit_id, currency_code,
  monthly_rent, monthly_charges, lease_start_date) AS (
  VALUES
    ('7ebedef0-89d3-46eb-a1f9-5833a4e023d4'::uuid, 'BAIL-AMS-003',
     'cc57bf2f-34da-4484-acfc-ec7a9f024b41'::uuid,
     'c2577669-d780-4b0a-9f92-12102705a98a'::uuid, 'EUR',
     2600::numeric, 320::numeric, '2024-04-01'::date),
    ('813ae43e-bec1-4206-b299-f73e1d5bf2ad'::uuid, 'BAIL-LON-001',
     'd0f7cbd6-0e2d-4ced-b419-a26b706dc4de'::uuid,
     'd157fcfa-e740-4f7b-8b9b-5ab3ea3a4976'::uuid, 'GBP',
     1800::numeric, 120::numeric, '2024-10-01'::date),
    ('17111997-78c5-45ac-a207-91e1ed96c4c3'::uuid, 'BAIL-LON-002',
     '91afded5-fa59-4215-8123-d07ad485b4bd'::uuid,
     '5561bdcc-9aa3-4a49-b8b3-33d66a4a83e3'::uuid, 'GBP',
     2200::numeric, 140::numeric, '2025-02-01'::date)
), target AS (
  SELECT l.* FROM public.leases l
  WHERE l.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
    AND (l.id IN (SELECT lease_id FROM expected)
      OR l.lease_reference IN (SELECT lease_reference FROM expected))
)
SELECT 'lease_identity_and_terms' AS check_name, count(*) AS affected
FROM expected e LEFT JOIN target l ON l.id = e.lease_id
LEFT JOIN public.properties p ON p.id = l.property_id
WHERE l.id IS NULL OR l.lease_reference IS DISTINCT FROM e.lease_reference
  OR l.lifecycle_stage IS DISTINCT FROM 'active'
  OR l.start_date IS DISTINCT FROM e.lease_start_date
  OR l.monthly_rent IS DISTINCT FROM e.monthly_rent
  OR l.monthly_charges IS DISTINCT FROM e.monthly_charges
  OR p.currency_code IS DISTINCT FROM e.currency_code
UNION ALL
SELECT 'unexpected_lease_reference', count(*) FROM target l
LEFT JOIN expected e ON e.lease_id = l.id WHERE e.lease_id IS NULL
UNION ALL
SELECT 'assignment_identity_and_null_shares', count(*) FROM expected e
LEFT JOIN public.lease_unit_assignments a ON a.id = e.assignment_id
WHERE a.id IS NULL OR a.lease_id IS DISTINCT FROM e.lease_id
  OR a.portfolio_id IS DISTINCT FROM 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
  OR a.unit_id IS DISTINCT FROM e.unit_id
  OR a.start_date IS DISTINCT FROM e.lease_start_date
  OR a.end_date IS NOT NULL OR a.rent_share IS NOT NULL
  OR a.charges_share IS NOT NULL
UNION ALL
SELECT 'extra_assignments', count(*) FROM public.lease_unit_assignments a
JOIN expected e ON e.lease_id = a.lease_id WHERE a.id <> e.assignment_id
UNION ALL
SELECT 'unit_price_basis', count(*) FROM expected e
LEFT JOIN public.units u ON u.id = e.unit_id
WHERE u.id IS NULL
  OR u.portfolio_id IS DISTINCT FROM 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
  OR u.property_id IS DISTINCT FROM (SELECT l.property_id FROM target l WHERE l.id = e.lease_id)
  OR u.base_rent IS DISTINCT FROM e.monthly_rent
  OR u.base_charges IS DISTINCT FROM e.monthly_charges
UNION ALL
SELECT 'amendment_price_or_unit_changes', count(*)
FROM public.lease_amendments am
JOIN expected e ON e.lease_id = am.lease_id
JOIN public.lease_amendment_changes c ON c.amendment_id = am.id
WHERE c.field_name IS DISTINCT FROM 'leaseEndDate';
