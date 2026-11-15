-- A deferred guard covers direct lease updates without duplicating rows written
-- explicitly by the lifecycle RPCs in the same transaction.
CREATE OR REPLACE FUNCTION public.ensure_lease_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lease_status_changes AS history
    WHERE history.lease_id = NEW.id
      AND history.portfolio_id = NEW.portfolio_id
      AND history.from_stage IS NOT DISTINCT FROM OLD.lifecycle_stage
      AND history.to_stage = NEW.lifecycle_stage
      AND history.xmin = pg_catalog.pg_current_xact_id()::xid
  ) THEN
    INSERT INTO public.lease_status_changes
      (lease_id, portfolio_id, from_stage, to_stage, reason, changed_by)
    VALUES (NEW.id, NEW.portfolio_id, OLD.lifecycle_stage, NEW.lifecycle_stage,
      'direct-status-update', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER ensure_lease_status_history
AFTER UPDATE ON public.leases
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD.lifecycle_stage IS DISTINCT FROM NEW.lifecycle_stage)
EXECUTE FUNCTION public.ensure_lease_status_history();

NOTIFY pgrst, 'reload schema';
