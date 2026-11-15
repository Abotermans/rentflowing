-- One document owns one Storage object. Shared legacy paths make concurrent
-- document deletions unsafe for the file-deletion outbox.
DO $$
DECLARE
  v_collision text;
BEGIN
  SELECT storage_path INTO v_collision
  FROM public.lease_documents
  GROUP BY storage_path
  HAVING count(*) > 1
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'Lease documents share a storage path; reconcile before enabling file cleanup: %', v_collision
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX lease_documents_storage_path_unique_idx
  ON public.lease_documents(storage_path);

DROP INDEX public.lease_documents_storage_path_idx;

-- Serialize queue creation and any attempt to reuse the same path. Without
-- this lock, an insert trigger can read an empty queue before a concurrent
-- delete commits, then wait on the unique index and insert after the delete.
CREATE OR REPLACE FUNCTION public.queue_lease_document_file_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(OLD.storage_path, 0));
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

CREATE OR REPLACE FUNCTION public.guard_pending_document_file_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefix text;
  v_filename text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id
    OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
  ) THEN
    RAISE EXCEPTION 'A document file path and its ownership cannot be changed after creation'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.storage_path, 0));
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

DROP TRIGGER guard_pending_document_file_deletion ON public.lease_documents;
CREATE TRIGGER guard_pending_document_file_deletion
  BEFORE INSERT OR UPDATE OF id, portfolio_id, lease_id, storage_path
  ON public.lease_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_pending_document_file_deletion();
