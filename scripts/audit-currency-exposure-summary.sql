-- Read-only currency exposure for properties with at least one mismatch.
-- Amounts are recorded face values, not converted or owner-share adjusted.
WITH affected_properties AS (
  SELECT r.property_id FROM public.receivable_items r
  JOIN public.properties p ON p.id = r.property_id
  WHERE r.status <> 'cancelled' AND r.currency_code IS DISTINCT FROM p.currency_code
  UNION
  SELECT r.property_id FROM public.cash_receipts r
  JOIN public.properties p ON p.id = r.property_id
  WHERE r.status NOT IN ('refunded', 'reversed')
    AND r.currency_code IS DISTINCT FROM p.currency_code
  UNION
  SELECT c.property_id FROM public.cost_entries c
  JOIN public.properties p ON p.id = c.property_id
  WHERE c.status = 'active' AND c.currency_code IS DISTINCT FROM p.currency_code
), recorded AS (
  SELECT p.name AS property_name, p.currency_code AS property_currency,
    'receivable'::text AS source, r.currency_code AS record_currency,
    r.status::text AS status, r.expected_amount AS recorded_amount,
    r.allocated_amount AS applied_amount
  FROM public.receivable_items r
  JOIN public.properties p ON p.id = r.property_id
  JOIN affected_properties affected ON affected.property_id = p.id
  WHERE r.status <> 'cancelled'

  UNION ALL
  SELECT p.name, p.currency_code, 'receipt', r.currency_code,
    r.status, r.amount_received, r.amount_received - r.unmatched_amount
  FROM public.cash_receipts r
  JOIN public.properties p ON p.id = r.property_id
  JOIN affected_properties affected ON affected.property_id = p.id
  WHERE r.status NOT IN ('refunded', 'reversed')

  UNION ALL
  SELECT p.name, p.currency_code, 'cost', c.currency_code,
    c.status, c.amount, NULL::numeric
  FROM public.cost_entries c
  JOIN public.properties p ON p.id = c.property_id
  JOIN affected_properties affected ON affected.property_id = p.id
  WHERE c.status = 'active'
)
SELECT property_name, property_currency, source, record_currency, status,
  count(*) AS rows, sum(recorded_amount) AS recorded_amount,
  sum(applied_amount) AS applied_amount
FROM recorded
GROUP BY property_name, property_currency, source, record_currency, status
ORDER BY property_name, source, record_currency, status;
