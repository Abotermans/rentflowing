ALTER TABLE public.lease_documents
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'supporting',
  ADD COLUMN IF NOT EXISTS status text NULL,
  ADD COLUMN IF NOT EXISTS signed_date date NULL;

UPDATE public.lease_documents
SET document_type = 'supporting'
WHERE document_type IS NULL;

ALTER TABLE public.lease_documents
  DROP CONSTRAINT IF EXISTS lease_documents_document_type_check,
  DROP CONSTRAINT IF EXISTS lease_documents_contractual_status_check;

ALTER TABLE public.lease_documents
  ADD CONSTRAINT lease_documents_document_type_check
  CHECK (document_type ~ '^[a-z0-9][a-z0-9-]{0,63}$');

ALTER TABLE public.lease_documents
  ADD CONSTRAINT lease_documents_contractual_status_check
  CHECK (
    (
      document_type NOT IN ('initial-contract', 'amendment')
      AND status IS NULL
      AND signed_date IS NULL
    )
    OR (
      document_type IN ('initial-contract', 'amendment')
      AND status IN ('draft', 'validated', 'sent', 'partially-signed', 'signed', 'cancelled')
      AND (
        (status = 'signed' AND signed_date IS NOT NULL)
        OR (status <> 'signed' AND signed_date IS NULL)
      )
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS lease_documents_one_initial_contract_per_lease_idx
  ON public.lease_documents(lease_id)
  WHERE document_type = 'initial-contract';

CREATE INDEX IF NOT EXISTS lease_documents_document_type_idx
  ON public.lease_documents(document_type);


CREATE TABLE IF NOT EXISTS public.lease_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lease_document_types_slug_format_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  CONSTRAINT lease_document_types_label_check CHECK (length(trim(label)) BETWEEN 1 AND 80),
  CONSTRAINT lease_document_types_not_builtin_check CHECK (slug NOT IN ('initial-contract', 'amendment', 'supporting')),
  CONSTRAINT lease_document_types_portfolio_slug_key UNIQUE (portfolio_id, slug)
);

CREATE INDEX IF NOT EXISTS lease_document_types_portfolio_id_idx
  ON public.lease_document_types(portfolio_id);

ALTER TABLE public.lease_document_types ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_document_types TO authenticated;
GRANT ALL ON public.lease_document_types TO service_role;

DROP POLICY IF EXISTS "Document types: members can read" ON public.lease_document_types;
CREATE POLICY "Document types: members can read"
  ON public.lease_document_types FOR SELECT TO authenticated
  USING (public.is_portfolio_member(portfolio_id, auth.uid()));

DROP POLICY IF EXISTS "Document types: owners/admins can insert" ON public.lease_document_types;
CREATE POLICY "Document types: owners/admins can insert"
  ON public.lease_document_types FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));

DROP POLICY IF EXISTS "Document types: owners/admins can update" ON public.lease_document_types;
CREATE POLICY "Document types: owners/admins can update"
  ON public.lease_document_types FOR UPDATE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]))
  WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));

DROP POLICY IF EXISTS "Document types: owners/admins can delete" ON public.lease_document_types;
CREATE POLICY "Document types: owners/admins can delete"
  ON public.lease_document_types FOR DELETE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));

DROP TRIGGER IF EXISTS lease_document_types_touch_updated_at ON public.lease_document_types;
CREATE TRIGGER lease_document_types_touch_updated_at
  BEFORE UPDATE ON public.lease_document_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
