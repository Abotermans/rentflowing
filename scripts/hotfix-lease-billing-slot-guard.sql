-- Emergency duplicate-billing guard for the observed Lovable database.
-- Do not run without separate write approval and a fresh read-only preflight.
-- This changes only the existing trigger function, not any receivable row.
-- The later 20261115001000 migration installs this same trigger behavior.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'receivable_items'
        AND t.tgname = 'prevent_duplicate_lease_receivable'
        AND NOT t.tgisinternal
        AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT OR UPDATE OF lease_id, unit_id, item_type, origin, period_month, due_date, cycle_index, cycle_end_date%') <> 1
    OR (SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'prevent_duplicate_lease_receivable'
        AND p.pronargs = 0
        AND pg_get_functiondef(p.oid) LIKE '%coalesce(NEW.unit_id::text, '''')%'
        AND pg_get_functiondef(p.oid) LIKE '%existing.unit_id IS NOT DISTINCT FROM NEW.unit_id%') <> 1
  THEN
    RAISE EXCEPTION 'Receivable duplicate guard changed; hotfix aborted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_lease_receivable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin <> 'lease-schedule' OR NEW.lease_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(
    NEW.portfolio_id::text || ':' || NEW.lease_id::text || ':' ||
    NEW.item_type || ':' || coalesce(NEW.period_month, '')
  ));

  IF EXISTS (
    SELECT 1 FROM public.receivable_items existing
    WHERE existing.id <> NEW.id
      AND existing.portfolio_id = NEW.portfolio_id
      AND existing.lease_id = NEW.lease_id
      AND existing.item_type = NEW.item_type
      AND existing.origin = 'lease-schedule'
      AND existing.period_month IS NOT DISTINCT FROM NEW.period_month
      AND (existing.due_date = NEW.due_date
        OR existing.cycle_end_date IS NULL
        OR NEW.cycle_end_date IS NULL
        OR existing.cycle_end_date = NEW.cycle_end_date)
  ) THEN
    RAISE EXCEPTION 'Duplicate lease-schedule receivable for lease %, period %', NEW.lease_id, NEW.period_month
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'prevent_duplicate_lease_receivable'
        AND p.pronargs = 0
        AND pg_get_functiondef(p.oid) LIKE '%existing.cycle_end_date = NEW.cycle_end_date%'
        AND pg_get_functiondef(p.oid) NOT LIKE '%existing.unit_id IS NOT DISTINCT FROM NEW.unit_id%') <> 1
  THEN
    RAISE EXCEPTION 'Receivable hotfix postcondition failed; rolled back';
  END IF;
END;
$$;
COMMIT;
