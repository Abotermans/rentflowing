-- Read-only preflight for historical rows checked by data-dependent migrations.
-- A zero means the named migration condition currently passes, not that the
-- entire migration chain or production release is safe to run.
SELECT 'amendment_missing_unit_ref' AS check_name, count(*)::bigint AS affected
FROM public.lease_amendment_changes c
WHERE c.field_name IN ('unitAssignments', 'unitEndDate', 'unitRentShare', 'unitChargesShare')
  AND (jsonb_typeof(c.metadata) IS DISTINCT FROM 'object'
    OR nullif(c.metadata->>'unitId', '') IS NULL)
UNION ALL
SELECT 'amendment_ambiguous_or_wrong_scope', count(*)
FROM public.lease_amendment_changes c
JOIN public.lease_amendments am ON am.id = c.amendment_id
JOIN public.leases l ON l.id = am.lease_id
CROSS JOIN LATERAL (
  SELECT count(*) AS matches
  FROM public.units u
  WHERE u.portfolio_id = c.portfolio_id
    AND u.property_id = l.property_id
    AND (u.id::text = c.metadata->>'unitId' OR u.legacy_id = c.metadata->>'unitId')
) candidate
WHERE c.metadata ? 'unitId'
  AND (c.portfolio_id IS DISTINCT FROM am.portfolio_id
    OR am.portfolio_id IS DISTINCT FROM l.portfolio_id
    OR candidate.matches <> 1)
UNION ALL
SELECT 'amendment_legacy_refs_to_normalize', count(*)
FROM public.lease_amendment_changes c
JOIN public.lease_amendments am ON am.id = c.amendment_id
JOIN public.leases l ON l.id = am.lease_id
JOIN public.units u ON u.portfolio_id = c.portfolio_id
  AND u.property_id = l.property_id
  AND u.legacy_id = c.metadata->>'unitId'
WHERE c.metadata->>'unitId' IS DISTINCT FROM u.id::text
UNION ALL
SELECT 'invalid_lease_due_day', count(*)
FROM public.leases
WHERE due_day_of_month IS NOT NULL AND NOT (due_day_of_month BETWEEN 1 AND 31)
UNION ALL
SELECT 'invalid_lease_rent_formula', count(*)
FROM public.leases
WHERE rent_formula IS NOT NULL AND rent_formula < 1
UNION ALL
SELECT 'invalid_lease_monthly_amount', count(*)
FROM public.leases
WHERE (monthly_rent IS NOT NULL AND NOT (monthly_rent >= 0 AND monthly_rent < 'Infinity'::numeric))
  OR (monthly_charges IS NOT NULL AND NOT (monthly_charges >= 0 AND monthly_charges < 'Infinity'::numeric))
UNION ALL
SELECT 'invalid_lease_date_window', count(*)
FROM public.leases
WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND end_date < start_date
UNION ALL
SELECT 'invalid_lease_tenant_ids', count(*)
FROM public.leases
WHERE jsonb_typeof(tenant_ids) IS DISTINCT FROM 'array'
UNION ALL
SELECT 'cross_portfolio_lease_tenant_ids', count(*)
FROM public.leases l
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(l.tenant_ids) = 'array' THEN l.tenant_ids ELSE '[]'::jsonb END
) linked(id)
LEFT JOIN public.tenants t ON t.id::text = linked.id
WHERE t.portfolio_id IS DISTINCT FROM l.portfolio_id
UNION ALL
SELECT 'cross_portfolio_lease_property', count(*)
FROM public.leases l
LEFT JOIN public.properties p ON p.id = l.property_id
WHERE l.property_id IS NOT NULL AND p.portfolio_id IS DISTINCT FROM l.portfolio_id
UNION ALL
SELECT 'cross_portfolio_billing_tenant', count(*)
FROM public.leases l
LEFT JOIN public.tenants t ON t.id = l.billing_tenant_id
WHERE l.billing_tenant_id IS NOT NULL AND t.portfolio_id IS DISTINCT FROM l.portfolio_id
UNION ALL
SELECT 'cross_property_assignment', count(*)
FROM public.lease_unit_assignments a
JOIN public.leases l ON l.id = a.lease_id
JOIN public.units u ON u.id = a.unit_id
WHERE a.portfolio_id IS DISTINCT FROM l.portfolio_id
  OR a.portfolio_id IS DISTINCT FROM u.portfolio_id
  OR u.property_id IS DISTINCT FROM l.property_id
UNION ALL
SELECT 'overlapping_charges_reconciliation', count(*)
FROM public.charges_reconciliations a
JOIN public.charges_reconciliations b ON b.lease_id = a.lease_id AND b.id > a.id
WHERE a.period_start <= b.period_end AND b.period_start <= a.period_end
UNION ALL
SELECT 'duplicate_document_storage_path', count(*)
FROM (
  SELECT storage_path FROM public.lease_documents GROUP BY storage_path HAVING count(*) > 1
) duplicated
UNION ALL
SELECT 'duplicate_guarantee', count(*)
FROM (SELECT lease_id FROM public.guarantees GROUP BY lease_id HAVING count(*) > 1) duplicated
UNION ALL
SELECT 'cost_unit_property', count(*)
FROM public.cost_entries e
LEFT JOIN public.units u ON u.id = e.unit_id AND u.property_id = e.property_id
WHERE e.unit_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'cost_rule_property', count(*)
FROM public.cost_entries e
LEFT JOIN public.allocation_rules r
  ON r.id = e.allocation_rule_id AND r.property_id = e.property_id
WHERE e.allocation_rule_id IS NOT NULL AND r.id IS NULL
UNION ALL
SELECT 'allocation_entry_property', count(*)
FROM public.cost_allocation_results a
LEFT JOIN public.cost_entries e
  ON e.id = a.cost_entry_id AND e.property_id = a.property_id
WHERE e.id IS NULL
UNION ALL
SELECT 'allocation_unit_property', count(*)
FROM public.cost_allocation_results a
LEFT JOIN public.units u ON u.id = a.unit_id AND u.property_id = a.property_id
WHERE u.id IS NULL
UNION ALL
SELECT 'rule_share_cross_property', count(*)
FROM public.allocation_rule_unit_shares s
JOIN public.allocation_rules r ON r.id = s.allocation_rule_id
JOIN public.units u ON u.id = s.unit_id
WHERE r.property_id IS DISTINCT FROM u.property_id
UNION ALL
SELECT 'cost_both_scopes', count(*)
FROM public.cost_entries
WHERE unit_id IS NOT NULL AND allocation_rule_id IS NOT NULL
UNION ALL
SELECT 'allocation_without_property_rule', count(*)
FROM public.cost_allocation_results a
JOIN public.cost_entries e ON e.id = a.cost_entry_id
WHERE e.unit_id IS NOT NULL OR e.allocation_rule_id IS NULL
ORDER BY check_name;
