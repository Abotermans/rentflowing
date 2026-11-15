-- Apply after a restorable backup. Legacy amendment metadata stores unit legacy_id
-- values; all unit references must resolve uniquely before any row is rewritten.
BEGIN;

LOCK TABLE public.lease_amendment_changes IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.lease_amendment_changes c
    WHERE c.field_name IN ('unitAssignments', 'unitEndDate', 'unitRentShare', 'unitChargesShare')
      AND (jsonb_typeof(c.metadata) IS DISTINCT FROM 'object'
        OR nullif(c.metadata->>'unitId', '') IS NULL)
  ) THEN
    RAISE EXCEPTION 'Unit amendment change is missing a unit reference'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lease_amendment_changes c
    JOIN public.lease_amendments am ON am.id = c.amendment_id
    JOIN public.leases l ON l.id = am.lease_id
    CROSS JOIN LATERAL (
      SELECT count(*) AS matches
      FROM public.units u
      WHERE u.portfolio_id = c.portfolio_id
        AND u.property_id = l.property_id
        AND (u.id::text = c.metadata->>'unitId'
          OR u.legacy_id = c.metadata->>'unitId')
    ) candidate
    WHERE c.metadata ? 'unitId'
      AND (c.portfolio_id IS DISTINCT FROM am.portfolio_id
        OR am.portfolio_id IS DISTINCT FROM l.portfolio_id
        OR candidate.matches <> 1)
  ) THEN
    RAISE EXCEPTION 'Amendment unit reference is missing, ambiguous, or outside the lease property'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- This one-time metadata repair is the only exception to the applied-history
-- edit guard; the table lock prevents concurrent writes until it is restored.
ALTER TABLE public.lease_amendment_changes
  DISABLE TRIGGER guard_applied_amendment_changes;

UPDATE public.lease_amendment_changes c
SET metadata = jsonb_set(c.metadata, '{unitId}', to_jsonb(u.id::text)),
  old_value = CASE
    WHEN jsonb_typeof(c.old_value) = 'object'
      AND c.old_value->>'unitId' = c.metadata->>'unitId'
    THEN jsonb_set(c.old_value, '{unitId}', to_jsonb(u.id::text))
    ELSE c.old_value END,
  new_value = CASE
    WHEN jsonb_typeof(c.new_value) = 'object'
      AND c.new_value->>'unitId' = c.metadata->>'unitId'
    THEN jsonb_set(c.new_value, '{unitId}', to_jsonb(u.id::text))
    ELSE c.new_value END
FROM public.lease_amendments am
JOIN public.leases l ON l.id = am.lease_id
JOIN public.units u ON u.property_id = l.property_id
WHERE am.id = c.amendment_id
  AND u.portfolio_id = c.portfolio_id
  AND u.legacy_id = c.metadata->>'unitId'
  AND c.metadata->>'unitId' IS DISTINCT FROM u.id::text;

ALTER TABLE public.lease_amendment_changes
  ENABLE TRIGGER guard_applied_amendment_changes;

CREATE FUNCTION public.guard_amendment_change_unit_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.field_name IN ('unitAssignments', 'unitEndDate', 'unitRentShare', 'unitChargesShare')
    AND (jsonb_typeof(NEW.metadata) IS DISTINCT FROM 'object'
      OR nullif(NEW.metadata->>'unitId', '') IS NULL) THEN
    RAISE EXCEPTION 'Unit amendment change requires a unit reference'
      USING ERRCODE = '23514';
  END IF;

  IF coalesce(NEW.metadata ? 'unitId', false) AND NOT EXISTS (
    SELECT 1
    FROM public.lease_amendments am
    JOIN public.leases l ON l.id = am.lease_id
    JOIN public.units u ON u.id::text = NEW.metadata->>'unitId'
      AND u.portfolio_id = NEW.portfolio_id
      AND u.property_id = l.property_id
    WHERE am.id = NEW.amendment_id
      AND am.portfolio_id = NEW.portfolio_id
      AND l.portfolio_id = NEW.portfolio_id
  ) THEN
    RAISE EXCEPTION 'Amendment unit reference must use a unit in the lease property'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_amendment_change_unit_reference() FROM PUBLIC;

CREATE TRIGGER guard_amendment_change_unit_reference
  BEFORE INSERT OR UPDATE OF metadata, field_name, amendment_id, portfolio_id
  ON public.lease_amendment_changes
  FOR EACH ROW EXECUTE FUNCTION public.guard_amendment_change_unit_reference();

COMMIT;

NOTIFY pgrst, 'reload schema';
