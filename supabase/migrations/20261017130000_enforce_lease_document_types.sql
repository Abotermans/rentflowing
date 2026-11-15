-- Custom document types must exist in the document's portfolio. Lock the type
-- row so deleting a type and uploading a document cannot both succeed.
CREATE OR REPLACE FUNCTION public.check_lease_document_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.document_type IN ('initial-contract', 'amendment', 'supporting') THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.lease_document_types
  WHERE portfolio_id = NEW.portfolio_id AND slug = NEW.document_type
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document type % is not configured for this portfolio', NEW.document_type
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lease_documents_check_type ON public.lease_documents;
CREATE TRIGGER lease_documents_check_type
  BEFORE INSERT OR UPDATE OF portfolio_id, document_type ON public.lease_documents
  FOR EACH ROW EXECUTE FUNCTION public.check_lease_document_type();

CREATE OR REPLACE FUNCTION public.prevent_used_lease_document_type_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.portfolio_id IS NOT DISTINCT FROM OLD.portfolio_id
    AND NEW.slug IS NOT DISTINCT FROM OLD.slug THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lease_documents
    WHERE portfolio_id = OLD.portfolio_id AND document_type = OLD.slug
  ) THEN
    RAISE EXCEPTION 'Document type % is used by lease documents', OLD.slug
      USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS lease_document_types_prevent_used_delete ON public.lease_document_types;
CREATE TRIGGER lease_document_types_prevent_used_delete
  BEFORE UPDATE OR DELETE ON public.lease_document_types
  FOR EACH ROW EXECUTE FUNCTION public.prevent_used_lease_document_type_deletion();
