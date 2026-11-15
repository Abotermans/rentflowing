-- Read-only preflight for the confirmed Demo test leases HUB, REZ, and REZ2.
-- All checks must return zero immediately before a separately approved deletion.
WITH expected(id, lease_reference, lifecycle_stage) AS (
  VALUES
    ('dfcc2668-1b94-4493-8d9e-41ea74bb05a3'::uuid, 'HUB', 'active'),
    ('6ad937b7-7ba9-4b28-920b-a8826f15a668'::uuid, 'REZ', 'signed'),
    ('ae014aa1-50c0-4ece-aee4-86faa617d9b3'::uuid, 'REZ2', 'signed')
), target AS (
  SELECT l.* FROM public.leases l
  WHERE l.portfolio_id = 'd26a0ef7-d0ee-41ba-8da7-51af3f0369b7'::uuid
    AND (l.id IN (SELECT id FROM expected)
      OR l.lease_reference IN (SELECT lease_reference FROM expected))
), missing_or_changed AS (
  SELECT e.id FROM expected e LEFT JOIN target t ON t.id = e.id
  WHERE t.id IS NULL OR t.lease_reference IS DISTINCT FROM e.lease_reference
    OR t.lifecycle_stage IS DISTINCT FROM e.lifecycle_stage
), unexpected AS (
  SELECT t.id FROM target t LEFT JOIN expected e ON e.id = t.id
  WHERE e.id IS NULL
)
SELECT 'missing_or_changed_lease' AS check_name, count(*) AS affected FROM missing_or_changed
UNION ALL SELECT 'unexpected_reference', count(*) FROM unexpected
UNION ALL SELECT 'assignments', count(*) FROM public.lease_unit_assignments x JOIN target t ON t.id = x.lease_id
UNION ALL SELECT 'receivables', count(*) FROM public.receivable_items x JOIN target t ON t.id = x.lease_id
UNION ALL SELECT 'receipts', count(*) FROM public.cash_receipts x JOIN target t ON t.id = x.lease_id
UNION ALL SELECT 'guarantees', count(*) FROM public.guarantees x JOIN target t ON t.id = x.lease_id
UNION ALL SELECT 'amendments', count(*) FROM public.lease_amendments x JOIN target t ON t.id = x.lease_id
UNION ALL SELECT 'documents', count(*) FROM public.lease_documents x JOIN target t ON t.id = x.lease_id
UNION ALL SELECT 'reconciliations', count(*) FROM public.charges_reconciliations x JOIN target t ON t.id = x.lease_id
UNION ALL SELECT 'status_changes', count(*) FROM public.lease_status_changes x JOIN target t ON t.id = x.lease_id;
