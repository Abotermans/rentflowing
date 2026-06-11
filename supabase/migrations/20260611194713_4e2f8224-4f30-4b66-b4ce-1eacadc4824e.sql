
-- 1) Add new columns
ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS tenant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS billing_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- 2) Backfill tenant_ids = [primary_tenant_id] || co_tenant_ids (deduped, primary nulls skipped)
UPDATE public.leases l
SET tenant_ids = (
  SELECT COALESCE(jsonb_agg(DISTINCT t), '[]'::jsonb)
  FROM (
    SELECT l.primary_tenant_id::text AS t WHERE l.primary_tenant_id IS NOT NULL
    UNION
    SELECT jsonb_array_elements_text(COALESCE(l.co_tenant_ids, '[]'::jsonb)) AS t
  ) s
)
WHERE jsonb_typeof(tenant_ids) = 'array' AND jsonb_array_length(tenant_ids) = 0;

-- 3) Backfill billing_tenant_id from primary_tenant_id
UPDATE public.leases SET billing_tenant_id = primary_tenant_id WHERE billing_tenant_id IS NULL;

-- 4) Drop old columns
ALTER TABLE public.leases
  DROP COLUMN IF EXISTS primary_tenant_id,
  DROP COLUMN IF EXISTS co_tenant_ids,
  DROP COLUMN IF EXISTS unit_id;

-- 5) Drop is_primary from lease_unit_assignments
ALTER TABLE public.lease_unit_assignments
  DROP COLUMN IF EXISTS is_primary;
