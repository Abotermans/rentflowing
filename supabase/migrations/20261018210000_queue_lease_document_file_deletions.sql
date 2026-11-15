-- A deleted document and its pending file cleanup must be committed together.
CREATE TABLE public.lease_document_file_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  document_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  CONSTRAINT lease_document_file_deletions_path_check CHECK (length(storage_path) > 0),
  CONSTRAINT lease_document_file_deletions_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX lease_document_file_deletions_created_at_idx
  ON public.lease_document_file_deletions(created_at, id);

ALTER TABLE public.lease_document_file_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lease_document_file_deletions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_document_file_deletions TO service_role;

CREATE FUNCTION public.queue_lease_document_file_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lease_documents WHERE storage_path = OLD.storage_path) THEN
    RETURN OLD;
  END IF;
  INSERT INTO public.lease_document_file_deletions(
    portfolio_id, lease_id, document_id, storage_path
  ) VALUES (OLD.portfolio_id, OLD.lease_id, OLD.id, OLD.storage_path)
  ON CONFLICT (storage_path) DO NOTHING;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_lease_document_file_deletion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER queue_lease_document_file_deletion
  AFTER DELETE ON public.lease_documents
  FOR EACH ROW EXECUTE FUNCTION public.queue_lease_document_file_deletion();

CREATE FUNCTION public.guard_pending_document_file_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefix text;
  v_filename text;
BEGIN
  v_prefix := NEW.portfolio_id::text || '/' || NEW.lease_id::text || '/' || NEW.id::text || '/';
  v_filename := substr(NEW.storage_path, length(v_prefix) + 1);
  IF NOT starts_with(NEW.storage_path, v_prefix)
     OR v_filename IN ('', '.', '..')
     OR position('/' in v_filename) > 0
     OR position(chr(92) in v_filename) > 0
     OR position('%' in v_filename) > 0
     OR v_filename ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Document file path is outside its document scope'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lease_document_file_deletions
    WHERE storage_path = NEW.storage_path) THEN
    RAISE EXCEPTION 'This document file path is pending deletion; upload to a new path'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_document_file_deletion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_pending_document_file_deletion
  BEFORE INSERT OR UPDATE OF storage_path ON public.lease_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_pending_document_file_deletion();

NOTIFY pgrst, 'reload schema';
