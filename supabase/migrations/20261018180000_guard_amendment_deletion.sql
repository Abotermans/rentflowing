-- An applied amendment is part of the lease history. Only a draft can be
-- removed, and ordinary clients must use a version-checked delete.
CREATE FUNCTION public.guard_amendment_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A portfolio deletion is an intentional whole-portfolio cascade.
  IF OLD.status IS DISTINCT FROM 'draft'
    AND EXISTS (SELECT 1 FROM public.portfolios WHERE id = OLD.portfolio_id) THEN
    RAISE EXCEPTION 'Only draft amendments can be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_amendment_deletion() FROM PUBLIC;

CREATE FUNCTION public.guard_applied_amendment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('ended', 'terminated')
    AND (NEW.status IS DISTINCT FROM OLD.status
      OR (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM
        (to_jsonb(OLD) - 'updated_at')) THEN
    RAISE EXCEPTION 'Completed amendment history cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'active' THEN
    IF NEW.status NOT IN ('active', 'ended', 'terminated')
      OR (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM
        (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'Applied amendments cannot return to draft or change their terms'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_applied_amendment_update() FROM PUBLIC;

CREATE TRIGGER guard_applied_amendment_update
  BEFORE UPDATE ON public.lease_amendments
  FOR EACH ROW EXECUTE FUNCTION public.guard_applied_amendment_update();

CREATE TRIGGER guard_amendment_deletion
  BEFORE DELETE ON public.lease_amendments
  FOR EACH ROW EXECUTE FUNCTION public.guard_amendment_deletion();

CREATE FUNCTION public.guard_applied_amendment_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO v_status FROM public.lease_amendments
    WHERE id = OLD.amendment_id FOR SHARE;
    IF v_status NOT IN ('draft', 'scheduled') THEN
      RAISE EXCEPTION 'Changes to an applied amendment cannot be edited or deleted'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO v_status FROM public.lease_amendments
    WHERE id = NEW.amendment_id FOR SHARE;
    IF v_status NOT IN ('draft', 'scheduled') THEN
      RAISE EXCEPTION 'Changes to an applied amendment cannot be edited or deleted'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_applied_amendment_changes() FROM PUBLIC;

CREATE TRIGGER guard_applied_amendment_changes
  BEFORE INSERT OR UPDATE OR DELETE ON public.lease_amendment_changes
  FOR EACH ROW EXECUTE FUNCTION public.guard_applied_amendment_changes();

CREATE FUNCTION public.delete_draft_amendment(
  p_amendment_id uuid,
  p_portfolio_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amendment public.lease_amendments%ROWTYPE;
  v_deleted_count integer;
BEGIN
  IF p_amendment_id IS NULL OR p_portfolio_id IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Amendment, portfolio and version are required'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(
    p_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Amendment deletion is not permitted'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_amendment FROM public.lease_amendments
  WHERE id = p_amendment_id AND portfolio_id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Amendment was not found or is not accessible'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_amendment.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Amendment changed since it was opened. Reload and retry.'
      USING ERRCODE = '40001';
  END IF;
  IF v_amendment.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft amendments can be deleted'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lease_amendments
    WHERE supersedes_amendment_id = p_amendment_id) THEN
    RAISE EXCEPTION 'An amendment referenced by a later amendment cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  DELETE FROM public.lease_amendments
  WHERE id = p_amendment_id AND portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION 'Amendment deletion was denied' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('amendment_id', p_amendment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_draft_amendment(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_draft_amendment(uuid, uuid, timestamptz) TO authenticated;
REVOKE DELETE ON public.lease_amendments FROM authenticated;
NOTIFY pgrst, 'reload schema';
