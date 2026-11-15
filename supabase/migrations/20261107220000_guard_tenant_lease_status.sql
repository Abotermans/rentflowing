-- A tenant linked to a lease gets their status from all linked lease stages.
CREATE FUNCTION public.guard_tenant_lease_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected text;
BEGIN
  IF NEW.status NOT IN ('applicant', 'active', 'former') THEN
    RAISE EXCEPTION 'Invalid tenant status' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  SELECT CASE
    WHEN bool_or(lease.lifecycle_stage = 'active') THEN 'active'
    WHEN bool_or(lease.lifecycle_stage IN ('draft', 'pending-signature', 'signed')) THEN 'applicant'
    WHEN count(*) > 0 THEN 'former'
    ELSE NULL
  END INTO v_expected
  FROM public.leases AS lease
  WHERE lease.portfolio_id = NEW.portfolio_id
    AND (lease.tenant_ids ? NEW.id::text OR lease.billing_tenant_id = NEW.id);
  IF v_expected IS NOT NULL AND NEW.status IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Tenant status must match linked leases: expected %', v_expected
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tenant_lease_status() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_tenant_lease_status
  BEFORE INSERT OR UPDATE OF status ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_lease_status();

NOTIFY pgrst, 'reload schema';
