ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS legal_form text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS contact_first_name text,
  ADD COLUMN IF NOT EXISTS contact_last_name text,
  ADD COLUMN IF NOT EXISTS contact_role text;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_kind_check CHECK (kind IN ('individual','corporation'));