-- Read-only release audit. Run against the target database and investigate
-- every nonzero count before accepting real payment data.
SELECT 'financial_audit_schema_missing' AS check_name,
  (2 - count(*))::bigint AS affected
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'properties'
  AND column_name IN ('time_zone', 'is_partially_owned')

UNION ALL
SELECT 'receivable_arithmetic', count(*)
FROM public.receivable_items
WHERE abs(expected_amount - allocated_amount - outstanding_amount) > 0.01

UNION ALL
SELECT 'duplicate_lease_schedule_rows', coalesce(sum(surplus), 0)::bigint
FROM (
  SELECT count(*) - 1 AS surplus
  FROM public.receivable_items
  WHERE origin = 'lease-schedule' AND lease_id IS NOT NULL
  GROUP BY portfolio_id, lease_id, item_type, due_date, period_month
  HAVING count(*) > 1
) AS duplicates

UNION ALL
SELECT 'retimed_cycle_collisions', count(*)
FROM (
  SELECT 1
  FROM public.receivable_items
  WHERE origin = 'lease-schedule' AND lease_id IS NOT NULL
    AND cycle_end_date IS NOT NULL
  GROUP BY portfolio_id, lease_id, item_type, period_month, cycle_end_date
  HAVING count(DISTINCT due_date) > 1
) AS retimed

UNION ALL
SELECT 'same_bill_schedule_collisions', count(*)
FROM (
  SELECT 1
  FROM public.receivable_items r
  WHERE r.origin = 'lease-schedule' AND r.lease_id IS NOT NULL
  GROUP BY r.portfolio_id, r.lease_id, r.item_type, r.due_date, r.period_month
  HAVING count(*) > 1 AND count(DISTINCT (
    r.tenant_id, r.property_id, r.currency_code, r.expected_amount,
    r.cycle_index, r.cycle_end_date, r.label, r.notes, r.priority
  )) = 1
) AS same_bill

UNION ALL
SELECT 'different_bill_schedule_collisions', count(*)
FROM (
  SELECT 1
  FROM public.receivable_items r
  WHERE r.origin = 'lease-schedule' AND r.lease_id IS NOT NULL
  GROUP BY r.portfolio_id, r.lease_id, r.item_type, r.due_date, r.period_month
  HAVING count(*) > 1 AND count(DISTINCT (
    r.tenant_id, r.property_id, r.currency_code, r.expected_amount,
    r.cycle_index, r.cycle_end_date, r.label, r.notes, r.priority
  )) > 1
) AS different_bill

UNION ALL
SELECT 'cross_currency_schedule_slots', count(*)
FROM (
  SELECT 1
  FROM public.receivable_items
  WHERE origin = 'lease-schedule' AND lease_id IS NOT NULL
  GROUP BY portfolio_id, lease_id, item_type, due_date, period_month
  HAVING count(DISTINCT currency_code) > 1
) AS mixed_slots

UNION ALL
SELECT 'lease_schedule_missing_cycle_metadata', count(*)
FROM public.receivable_items
WHERE origin = 'lease-schedule'
  AND item_type IN ('rent', 'charges')
  AND status NOT IN ('cancelled', 'written-off')
  AND (period_month IS NULL OR cycle_end_date IS NULL)

UNION ALL
SELECT 'lease_schedule_without_plausible_assignment', count(*)
FROM public.receivable_items r
WHERE r.origin = 'lease-schedule'
  AND r.item_type IN ('rent', 'charges')
  AND r.lease_id IS NOT NULL AND r.unit_id IS NOT NULL
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

UNION ALL
SELECT 'allocated_schedule_without_plausible_assignment', count(*)
FROM public.receivable_items r
WHERE r.origin = 'lease-schedule'
  AND r.item_type IN ('rent', 'charges')
  AND r.lease_id IS NOT NULL AND r.unit_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.receipt_allocations allocation
    WHERE allocation.receivable_item_id = r.id
  )
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

UNION ALL
SELECT 'lease_assignment_missing_pricing', count(*)
FROM public.lease_unit_assignments a
JOIN public.leases l ON l.id = a.lease_id
WHERE l.lifecycle_stage NOT IN ('draft', 'pending-signature')
  AND (a.rent_share IS NULL OR a.charges_share IS NULL)

UNION ALL
SELECT 'overlapping_same_lease_unit_assignments', count(*)
FROM public.lease_unit_assignments a
JOIN public.lease_unit_assignments b ON b.lease_id = a.lease_id
  AND b.unit_id = a.unit_id AND b.id > a.id
WHERE a.start_date < coalesce(b.end_date, 'infinity'::date)
  AND b.start_date < coalesce(a.end_date, 'infinity'::date)

UNION ALL
SELECT 'overlapping_cross_lease_unit_assignments', count(*)
FROM public.lease_unit_assignments a
JOIN public.leases la ON la.id = a.lease_id
JOIN public.lease_unit_assignments b ON b.unit_id = a.unit_id
  AND b.lease_id <> a.lease_id AND b.id > a.id
JOIN public.leases lb ON lb.id = b.lease_id
CROSS JOIN LATERAL (
  SELECT greatest(a.start_date, la.start_date) AS first_start,
    least(a.end_date, la.end_date, la.move_out_actual_date) AS first_end,
    greatest(b.start_date, lb.start_date) AS second_start,
    least(b.end_date, lb.end_date, lb.move_out_actual_date) AS second_end
) AS bounds
WHERE la.lifecycle_stage NOT IN ('ended', 'terminated')
  AND lb.lifecycle_stage NOT IN ('ended', 'terminated')
  AND bounds.first_start < coalesce(bounds.first_end, 'infinity'::date)
  AND bounds.second_start < coalesce(bounds.second_end, 'infinity'::date)
  AND bounds.first_start < coalesce(bounds.second_end, 'infinity'::date)
  AND bounds.second_start < coalesce(bounds.first_end, 'infinity'::date)

UNION ALL
SELECT 'active_lease_share_total_mismatch', count(*)
FROM (
  SELECT l.id
  FROM public.leases l
  JOIN public.properties p ON p.id = l.property_id
  JOIN public.lease_unit_assignments a ON a.lease_id = l.id
    AND a.start_date <= (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date
    AND (a.end_date IS NULL OR a.end_date >= (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date)
  WHERE l.lifecycle_stage = 'active'
    AND l.start_date <= (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date
    AND (l.end_date IS NULL OR l.end_date >= (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date)
  GROUP BY l.id
  HAVING count(*) FILTER (WHERE a.rent_share IS NULL OR a.charges_share IS NULL) = 0
    AND (abs(sum(a.rent_share) - max(l.monthly_rent)) > 0.01
      OR abs(sum(a.charges_share) - max(l.monthly_charges)) > 0.01)
) AS mismatched_leases

UNION ALL
SELECT 'open_lease_window_share_total_mismatch', count(DISTINCT lease_id)
FROM (
  SELECT l.id AS lease_id, dates.as_of,
    count(a.lease_id) AS unit_count,
    count(a.lease_id) FILTER (
      WHERE a.rent_share IS NULL OR a.charges_share IS NULL
        OR a.rent_share < 0 OR a.charges_share < 0
    ) AS invalid_share_count,
    coalesce(sum(a.rent_share), 0) AS rent_sum,
    coalesce(sum(a.charges_share), 0) AS charges_sum,
    l.monthly_rent, l.monthly_charges
  FROM public.leases l
  JOIN public.properties p ON p.id = l.property_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN l.lifecycle_stage = 'draft' THEN l.start_date
      ELSE greatest(l.start_date, least(
        (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date,
        coalesce(l.end_date, (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date),
        coalesce(l.move_out_actual_date,
          (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date)
      )) END AS anchor
  ) AS current_term
  CROSS JOIN LATERAL (
    SELECT current_term.anchor AS as_of
    UNION SELECT future.start_date FROM public.lease_unit_assignments future
      WHERE future.lease_id = l.id AND future.portfolio_id = l.portfolio_id
        AND future.start_date > current_term.anchor
    UNION SELECT future.end_date + 1 FROM public.lease_unit_assignments future
      WHERE future.lease_id = l.id AND future.portfolio_id = l.portfolio_id
        AND future.end_date IS NOT NULL AND future.end_date >= current_term.anchor
  ) AS dates
  LEFT JOIN public.lease_unit_assignments a ON a.lease_id = l.id
    AND a.portfolio_id = l.portfolio_id AND a.start_date <= dates.as_of
    AND (a.end_date IS NULL OR a.end_date >= dates.as_of)
  WHERE l.lifecycle_stage NOT IN ('ended', 'terminated')
    AND (l.end_date IS NULL OR dates.as_of <= l.end_date)
    AND (l.move_out_actual_date IS NULL OR dates.as_of <= l.move_out_actual_date)
  GROUP BY l.id, dates.as_of
  HAVING count(a.lease_id) FILTER (
      WHERE a.rent_share IS NULL OR a.charges_share IS NULL
        OR a.rent_share < 0 OR a.charges_share < 0
    ) > 0
    OR (count(a.lease_id) > 0 AND (
      round(coalesce(sum(a.rent_share), 0), 2) IS DISTINCT FROM round(l.monthly_rent, 2)
      OR round(coalesce(sum(a.charges_share), 0), 2) IS DISTINCT FROM round(l.monthly_charges, 2)
    ))
    OR (count(a.lease_id) = 0 AND (l.monthly_rent <> 0 OR l.monthly_charges <> 0))
) AS window_mismatches

UNION ALL
SELECT 'receivable_property_currency_mismatch', count(*)
FROM public.receivable_items r
JOIN public.properties p ON p.id = r.property_id
WHERE r.status <> 'cancelled' AND r.currency_code IS DISTINCT FROM p.currency_code

UNION ALL
SELECT 'receipt_property_currency_mismatch', count(*)
FROM public.cash_receipts r
JOIN public.properties p ON p.id = r.property_id
WHERE r.status NOT IN ('refunded', 'reversed')
  AND r.currency_code IS DISTINCT FROM p.currency_code

UNION ALL
SELECT 'cash_receipt_scope_mismatch', count(*)
FROM public.cash_receipts r
LEFT JOIN public.leases l ON l.id = r.lease_id
LEFT JOIN public.units u ON u.id = r.unit_id
WHERE (r.lease_id IS NOT NULL AND (
    l.id IS NULL OR l.portfolio_id IS DISTINCT FROM r.portfolio_id
    OR (r.property_id IS NOT NULL AND r.property_id IS DISTINCT FROM l.property_id)
    OR (r.tenant_id IS NOT NULL AND NOT (
      coalesce(l.tenant_ids ? r.tenant_id::text, false)
      OR coalesce(l.billing_tenant_id = r.tenant_id, false)
      OR EXISTS (
        SELECT 1 FROM public.lease_amendments am
        JOIN public.lease_amendment_changes change ON change.amendment_id = am.id
        WHERE am.lease_id = r.lease_id
          AND am.status IN ('active', 'ended', 'terminated')
          AND (
            (change.field_name = 'tenantIds' AND (
              coalesce(change.old_value ? r.tenant_id::text, false)
              OR coalesce(change.new_value ? r.tenant_id::text, false)
            ))
            OR (change.field_name = 'billingTenantId' AND (
              change.old_value #>> '{}' = r.tenant_id::text
              OR change.new_value #>> '{}' = r.tenant_id::text
            ))
          )
      )
    ))
  ))
  OR (r.unit_id IS NOT NULL AND (
    u.id IS NULL OR u.portfolio_id IS DISTINCT FROM r.portfolio_id
    OR coalesce(l.property_id, r.property_id) IS NULL
    OR u.property_id IS DISTINCT FROM coalesce(l.property_id, r.property_id)
  ))

UNION ALL
SELECT 'receipt_allocation_property_mismatch', count(*)
FROM public.receipt_allocations a
JOIN public.cash_receipts r ON r.id = a.cash_receipt_id
JOIN public.receivable_items i ON i.id = a.receivable_item_id
WHERE r.property_id IS NOT NULL
  AND r.property_id IS DISTINCT FROM i.property_id

UNION ALL
SELECT 'active_cost_property_currency_mismatch', count(*)
FROM public.cost_entries c
JOIN public.properties p ON p.id = c.property_id
WHERE c.status = 'active' AND c.currency_code IS DISTINCT FROM p.currency_code

UNION ALL
SELECT 'property_cost_overallocated', count(*)
FROM public.cost_entries c
JOIN public.properties p ON p.id = c.property_id
CROSS JOIN LATERAL (
  SELECT coalesce(sum(CASE WHEN jsonb_typeof(u.millieme_shares->'general') = 'number'
    THEN (u.millieme_shares->>'general')::numeric ELSE 0 END), 0) AS shares
  FROM public.units u WHERE u.property_id = p.id
) owned
CROSS JOIN LATERAL (
  SELECT count(*) AS rows, coalesce(sum(a.allocated_amount), 0) AS amount
  FROM public.cost_allocation_results a WHERE a.cost_entry_id = c.id
) allocated
WHERE c.status = 'active' AND c.unit_id IS NULL AND allocated.rows > 0
  AND allocated.amount > round(c.amount * CASE WHEN coalesce((to_jsonb(p)->>'is_partially_owned')::boolean, false)
    THEN least(1, greatest(0, owned.shares / greatest(p.millieme_base, 1)))
    ELSE 1 END, 2) + 0.01

UNION ALL
SELECT 'nonpositive_receipt_without_terminal_status', count(*)
FROM public.cash_receipts
WHERE amount_received <= 0 AND status NOT IN ('refunded', 'reversed')

UNION ALL
SELECT 'positive_receipt_unmatched_out_of_range', count(*)
FROM public.cash_receipts
WHERE amount_received > 0
  AND (unmatched_amount < 0 OR unmatched_amount > amount_received)

UNION ALL
SELECT 'nonpositive_allocation', count(*)
FROM public.receipt_allocations
WHERE allocated_amount <= 0

UNION ALL
SELECT 'allocation_currency_mismatch', count(*)
FROM public.receipt_allocations a
JOIN public.cash_receipts r ON r.id = a.cash_receipt_id
JOIN public.receivable_items i ON i.id = a.receivable_item_id
WHERE r.currency_code IS DISTINCT FROM i.currency_code

UNION ALL
SELECT 'positive_receipt_allocation_drift', count(*)
FROM public.cash_receipts r
WHERE r.amount_received > 0
  AND r.status NOT IN ('refunded', 'reversed')
  AND abs(
    r.amount_received - r.unmatched_amount - coalesce((
      SELECT sum(a.allocated_amount)
      FROM public.receipt_allocations a
      WHERE a.cash_receipt_id = r.id
    ), 0)
  ) > 0.01

UNION ALL
SELECT 'receivable_allocation_exceeds_paid', count(*)
FROM public.receivable_items r
JOIN (
  SELECT receivable_item_id, sum(allocated_amount) AS linked_amount
  FROM public.receipt_allocations
  GROUP BY receivable_item_id
) linked ON linked.receivable_item_id = r.id
WHERE linked.linked_amount > r.allocated_amount + 0.01

UNION ALL
SELECT 'positive_receipt_status_mismatch', count(*)
FROM public.cash_receipts r
WHERE r.amount_received > 0
  AND r.status IN ('unmatched', 'partially-matched', 'matched')
  AND (
    (r.status = 'unmatched' AND r.unmatched_amount <> r.amount_received)
    OR (r.status = 'partially-matched' AND (r.unmatched_amount <= 0
      OR r.unmatched_amount >= r.amount_received))
    OR (r.status = 'matched' AND r.unmatched_amount <> 0)
  )

UNION ALL
SELECT 'non_draft_lease_without_unit', count(*)
FROM public.leases l
WHERE l.lifecycle_stage NOT IN ('draft', 'pending-signature')
  AND NOT EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a WHERE a.lease_id = l.id
  )

UNION ALL
SELECT 'non_draft_lease_without_main_assignment', count(*)
FROM public.leases l
WHERE l.lifecycle_stage NOT IN ('draft', 'pending-signature')
  AND NOT EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    JOIN public.units u ON u.id = a.unit_id
    WHERE a.lease_id = l.id AND u.unit_type NOT IN ('parking', 'storage')
  )

UNION ALL
SELECT 'lease_without_status_history', count(*)
FROM public.leases l
WHERE NOT EXISTS (
  SELECT 1 FROM public.lease_status_changes h WHERE h.lease_id = l.id
)

UNION ALL
SELECT 'lease_signed_after_end_date', count(*)
FROM public.leases
WHERE signed_date IS NOT NULL AND end_date IS NOT NULL
  AND signed_date > end_date

UNION ALL
SELECT 'overlapping_charges_reconciliations', count(*)
FROM public.charges_reconciliations a
JOIN public.charges_reconciliations b
  ON b.lease_id = a.lease_id AND b.id > a.id
WHERE a.period_start <= b.period_end
  AND b.period_start <= a.period_end

UNION ALL
SELECT 'lease_assignment_property_mismatch', count(*)
FROM public.lease_unit_assignments a
JOIN public.leases l ON l.id = a.lease_id
JOIN public.units u ON u.id = a.unit_id
WHERE a.portfolio_id IS DISTINCT FROM l.portfolio_id
  OR a.portfolio_id IS DISTINCT FROM u.portfolio_id
  OR u.property_id IS DISTINCT FROM l.property_id

UNION ALL
SELECT 'amendment_unit_reference_mismatch', count(*)
FROM public.lease_amendment_changes c
JOIN public.lease_amendments am ON am.id = c.amendment_id
JOIN public.leases l ON l.id = am.lease_id
LEFT JOIN LATERAL (
  SELECT count(*) AS matches FROM public.units u
  WHERE u.portfolio_id = c.portfolio_id AND u.property_id = l.property_id
    AND (u.id::text = c.metadata->>'unitId' OR u.legacy_id = c.metadata->>'unitId')
) unit_ref ON true
WHERE c.field_name IN ('unitAssignments', 'unitEndDate', 'unitRentShare', 'unitChargesShare')
  AND (c.portfolio_id IS DISTINCT FROM am.portfolio_id
    OR am.portfolio_id IS DISTINCT FROM l.portfolio_id
    OR unit_ref.matches <> 1)

UNION ALL
SELECT 'legacy_amendment_unit_reference_pending', count(DISTINCT c.id)
FROM public.lease_amendment_changes c
JOIN public.lease_amendments am ON am.id = c.amendment_id
JOIN public.leases l ON l.id = am.lease_id
JOIN public.units u ON u.portfolio_id = c.portfolio_id
  AND u.property_id = l.property_id
  AND u.legacy_id = c.metadata->>'unitId'
  AND u.id::text IS DISTINCT FROM c.metadata->>'unitId'
WHERE c.field_name IN ('unitAssignments', 'unitEndDate', 'unitRentShare', 'unitChargesShare')

UNION ALL
SELECT 'unit_millieme_key_over_base', count(*)
FROM (
  SELECT p.id, shares.key
  FROM public.properties p
  JOIN public.units u ON u.property_id = p.id
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(u.millieme_shares) = 'object'
      THEN u.millieme_shares ELSE '{}'::jsonb END
  ) AS shares(key, value)
  GROUP BY p.id, p.millieme_base, shares.key
  HAVING sum(CASE WHEN jsonb_typeof(shares.value) = 'number'
    THEN (shares.value #>> '{}')::numeric ELSE 0 END) > p.millieme_base
) AS over_base

UNION ALL
SELECT 'invalid_unit_millieme_root', count(*)
FROM public.units
WHERE jsonb_typeof(millieme_shares) <> 'object'

UNION ALL
SELECT 'invalid_unit_millieme_share', count(*)
FROM public.units u
CROSS JOIN LATERAL jsonb_each(
  CASE WHEN jsonb_typeof(u.millieme_shares) = 'object'
    THEN u.millieme_shares ELSE '{}'::jsonb END
) AS shares(key, value)
WHERE CASE WHEN jsonb_typeof(shares.value) = 'number'
  THEN (shares.value #>> '{}')::numeric < 0 ELSE true END

UNION ALL
SELECT 'lease_receivable_property_mismatch', count(*)
FROM public.receivable_items r
JOIN public.leases l ON l.id = r.lease_id
LEFT JOIN public.units u ON u.id = r.unit_id
WHERE r.portfolio_id IS DISTINCT FROM l.portfolio_id
  OR r.property_id IS DISTINCT FROM l.property_id
  OR (r.unit_id IS NOT NULL AND (
    u.portfolio_id IS DISTINCT FROM l.portfolio_id
    OR u.property_id IS DISTINCT FROM l.property_id
  ))

UNION ALL
SELECT 'active_lease_without_current_unit', count(*)
FROM public.leases l
JOIN public.properties p ON p.id = l.property_id
WHERE l.lifecycle_stage = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.lease_unit_assignments a
    WHERE a.lease_id = l.id
      AND a.start_date <= (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date
      AND (a.end_date IS NULL OR a.end_date >= (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date)
  )

UNION ALL
SELECT 'open_schedule_after_lease_end', count(*)
FROM public.receivable_items r
JOIN public.leases l ON l.id = r.lease_id
WHERE l.lifecycle_stage IN ('ended', 'terminated')
  AND l.end_date IS NOT NULL
  AND r.origin = 'lease-schedule'
  AND r.status IN ('open', 'overdue')
  AND r.allocated_amount = 0
  AND (r.due_date > l.end_date OR r.cycle_end_date > l.end_date)

UNION ALL
SELECT 'open_schedule_after_actual_move_out', count(*)
FROM public.receivable_items r
JOIN public.leases l ON l.id = r.lease_id
WHERE l.move_out_actual_date IS NOT NULL
  AND r.origin = 'lease-schedule'
  AND r.status IN ('open', 'overdue')
  AND r.allocated_amount = 0
  AND (r.due_date > l.move_out_actual_date
    OR r.cycle_end_date > l.move_out_actual_date)

UNION ALL
SELECT 'paid_schedule_after_actual_move_out', count(*)
FROM public.receivable_items r
JOIN public.leases l ON l.id = r.lease_id
WHERE l.move_out_actual_date IS NOT NULL
  AND r.origin = 'lease-schedule'
  AND (r.status = 'paid' OR r.allocated_amount > 0)
  AND (r.due_date > l.move_out_actual_date
    OR r.cycle_end_date > l.move_out_actual_date)

UNION ALL
SELECT 'active_lease_past_actual_move_out', count(*)
FROM public.leases l
JOIN public.properties p ON p.id = l.property_id
WHERE l.lifecycle_stage = 'active'
  AND l.move_out_actual_date IS NOT NULL
  AND l.move_out_actual_date <
    (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date

UNION ALL
SELECT 'stored_lease_stage_behind_dates', count(*)
FROM public.leases l
JOIN public.properties p ON p.id = l.property_id
WHERE (l.lifecycle_stage = 'signed'
       AND l.start_date <= (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date)
   OR (l.lifecycle_stage = 'active'
       AND l.end_date < (now() AT TIME ZONE coalesce(to_jsonb(p)->>'time_zone', 'UTC'))::date)

UNION ALL
SELECT 'tenant_status_lease_mismatch', count(*)
FROM public.tenants t
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN bool_or(l.lifecycle_stage = 'active') THEN 'active'
    WHEN bool_or(l.lifecycle_stage IN ('draft', 'pending-signature', 'signed')) THEN 'applicant'
    WHEN count(*) > 0 THEN 'former'
    ELSE NULL
  END AS expected_status
  FROM public.leases l
  WHERE l.portfolio_id = t.portfolio_id
    AND (l.tenant_ids ? t.id::text OR l.billing_tenant_id = t.id)
) derived
WHERE derived.expected_status IS NOT NULL
  AND t.status IS DISTINCT FROM derived.expected_status

UNION ALL
SELECT 'guarantee_amount_mismatch', count(*)
FROM public.guarantees
WHERE expected_amount < 0 OR expected_amount > 9999999999.99
  OR received_amount < 0 OR received_amount > 9999999999.99
  OR expected_amount * 100 <> trunc(expected_amount * 100)
  OR received_amount * 100 <> trunc(received_amount * 100)
  OR (retention_amount IS NOT NULL AND (
    retention_amount < 0 OR retention_amount > received_amount
    OR retention_amount * 100 <> trunc(retention_amount * 100)
    OR (retention_amount > 0 AND release_date IS NULL)
  ))
  OR (received_date IS NOT NULL AND release_date IS NOT NULL AND release_date < received_date)

UNION ALL
SELECT 'guarantee_status_mismatch', count(*)
FROM public.guarantees
WHERE status IS DISTINCT FROM CASE
  WHEN release_date IS NOT NULL THEN
    CASE WHEN coalesce(retention_amount, 0) > 0 THEN 'partially-retained' ELSE 'released' END
  WHEN received_amount <= 0 THEN 'pending'
  WHEN received_amount < expected_amount THEN 'incomplete'
  ELSE 'active'
END

UNION ALL
SELECT 'duplicate_lease_guarantees', coalesce(sum(surplus), 0)::bigint
FROM (
  SELECT count(*) - 1 AS surplus
  FROM public.guarantees
  GROUP BY lease_id
  HAVING count(*) > 1
) duplicates

UNION ALL
SELECT 'default_portfolio_inaccessible', count(*)
FROM public.profiles AS p
WHERE p.default_portfolio_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.portfolio_members AS m
    WHERE m.user_id = p.id AND m.portfolio_id = p.default_portfolio_id
  );
