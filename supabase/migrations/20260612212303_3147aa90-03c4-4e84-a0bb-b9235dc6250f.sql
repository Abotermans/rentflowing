ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS payer_accounts JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.leases l
SET payer_accounts = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'payerName', COALESCE(NULLIF(trim(concat_ws(' ', t.first_name, t.last_name)), ''), ''),
    'payerIban', NULL,
    'payerBic', NULL,
    'isDefault', true,
    'notes', ''
  )
)
FROM public.tenants t
WHERE l.payer_accounts = '[]'::jsonb
  AND t.id = COALESCE(
    l.billing_tenant_id,
    NULLIF(l.tenant_ids->>0, '')::uuid
  );