-- Read-only preflight for applied unit add/remove amendments. Run before and
-- after legacy unit-reference normalization and investigate every result.
WITH applied_unit_changes AS (
  SELECT l.lease_reference, am.amendment_number, am.effective_date,
    c.change_type, c.metadata->>'unitId' AS recorded_unit_id,
    resolved.unit_id, resolved.unit_code, resolved.matches,
    am.lease_id
  FROM public.lease_amendment_changes c
  JOIN public.lease_amendments am ON am.id = c.amendment_id
  JOIN public.leases l ON l.id = am.lease_id
  CROSS JOIN LATERAL (
    SELECT min(u.id::text) AS unit_id, min(u.unit_code) AS unit_code,
      count(*) AS matches
    FROM public.units u
    WHERE u.portfolio_id = am.portfolio_id
      AND u.property_id = l.property_id
      AND (u.id::text = c.metadata->>'unitId'
        OR u.legacy_id = c.metadata->>'unitId')
  ) resolved
  WHERE am.status IN ('active', 'ended')
    AND c.field_name = 'unitAssignments'
    AND c.change_type IN ('add', 'remove')
)
SELECT lease_reference, amendment_number, effective_date, change_type,
  recorded_unit_id, unit_code,
  coalesce(assignments.windows, 'none') AS assignment_windows,
  assignments.next_other_lease_start,
  receivables.schedule_rows_after,
  receivables.first_due_after,
  receivables.last_due_after,
  receivables.allocated_after,
  receivables.outstanding_after,
  CASE
    WHEN matches <> 1 THEN 'unresolved_unit_reference'
    WHEN change_type = 'add' AND NOT EXISTS (
      SELECT 1 FROM public.lease_unit_assignments a
      WHERE a.lease_id = changes.lease_id
        AND a.unit_id::text = changes.unit_id
        AND a.start_date = changes.effective_date
        AND (a.end_date IS NULL OR a.end_date >= changes.effective_date)
    ) THEN 'missing_added_assignment'
    WHEN change_type = 'remove' AND EXISTS (
      SELECT 1 FROM public.lease_unit_assignments a
      WHERE a.lease_id = changes.lease_id
        AND a.unit_id::text = changes.unit_id
        AND a.start_date <= changes.effective_date
        AND (a.end_date IS NULL OR a.end_date >= changes.effective_date)
    ) THEN 'removed_unit_still_assigned'
  END AS issue
FROM applied_unit_changes changes
LEFT JOIN LATERAL (
  SELECT
    (SELECT string_agg(a.start_date::text || ' to ' || coalesce(a.end_date::text, 'open'),
      '; ' ORDER BY a.start_date)
     FROM public.lease_unit_assignments a
     WHERE a.lease_id = changes.lease_id AND a.unit_id::text = changes.unit_id) AS windows,
    (SELECT min(a.start_date)
     FROM public.lease_unit_assignments a
     WHERE a.lease_id <> changes.lease_id
       AND a.unit_id::text = changes.unit_id
       AND a.start_date >= changes.effective_date) AS next_other_lease_start
) assignments ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS schedule_rows_after,
    min(r.due_date) AS first_due_after,
    max(r.due_date) AS last_due_after,
    coalesce(sum(r.allocated_amount), 0) AS allocated_after,
    coalesce(sum(r.outstanding_amount), 0) AS outstanding_after
  FROM public.receivable_items r
  WHERE r.lease_id = changes.lease_id
    AND r.unit_id::text = changes.unit_id
    AND r.origin = 'lease-schedule'
    AND r.status <> 'cancelled'
    AND r.due_date >= changes.effective_date
) receivables ON true
WHERE matches <> 1
  OR (change_type = 'add' AND NOT EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    WHERE a.lease_id = changes.lease_id
      AND a.unit_id::text = changes.unit_id
      AND a.start_date = changes.effective_date
      AND (a.end_date IS NULL OR a.end_date >= changes.effective_date)
  ))
  OR (change_type = 'remove' AND EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    WHERE a.lease_id = changes.lease_id
      AND a.unit_id::text = changes.unit_id
      AND a.start_date <= changes.effective_date
      AND (a.end_date IS NULL OR a.end_date >= changes.effective_date)
  ))
ORDER BY lease_reference, amendment_number;
