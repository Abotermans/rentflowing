-- Read-only detail for the currency counts in audit-financial-consistency.sql.
-- A foreign-currency receipt can be legitimate; investigate before changing it.
SELECT 'receivable' AS source, r.id, p.name AS property_name,
  l.lease_reference, r.due_date AS event_date, r.item_type AS detail,
  r.currency_code, p.currency_code AS property_currency,
  r.expected_amount AS amount, r.allocated_amount AS applied_amount,
  r.outstanding_amount AS remaining_amount, r.status
FROM public.receivable_items r
JOIN public.properties p ON p.id = r.property_id
LEFT JOIN public.leases l ON l.id = r.lease_id
WHERE r.status <> 'cancelled' AND r.currency_code IS DISTINCT FROM p.currency_code

UNION ALL
SELECT 'receipt', r.id, p.name, l.lease_reference, r.payment_date,
  r.reference, r.currency_code, p.currency_code,
  r.amount_received, r.amount_received - r.unmatched_amount,
  r.unmatched_amount, r.status
FROM public.cash_receipts r
JOIN public.properties p ON p.id = r.property_id
LEFT JOIN public.leases l ON l.id = r.lease_id
WHERE r.status NOT IN ('refunded', 'reversed')
  AND r.currency_code IS DISTINCT FROM p.currency_code

UNION ALL
SELECT 'cost', c.id, p.name, NULL::text, c.start_date, c.label,
  c.currency_code, p.currency_code, c.amount,
  NULL::numeric, NULL::numeric, c.status
FROM public.cost_entries c
JOIN public.properties p ON p.id = c.property_id
WHERE c.status = 'active' AND c.currency_code IS DISTINCT FROM p.currency_code
ORDER BY property_name, event_date, source, id;
