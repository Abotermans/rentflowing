-- A receipt's linked objects must agree on the lease and property, even when
-- the scoped payment RPC is called without the browser's form validation.
CREATE FUNCTION public.guard_cash_receipt_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_unit_property uuid;
  v_property_id uuid;
  v_tenant_linked boolean;
BEGIN
  IF NEW.lease_id IS NOT NULL THEN
    SELECT * INTO v_lease FROM public.leases WHERE id = NEW.lease_id;
    IF NOT FOUND OR v_lease.portfolio_id IS DISTINCT FROM NEW.portfolio_id
      OR (NEW.property_id IS NOT NULL AND NEW.property_id IS DISTINCT FROM v_lease.property_id) THEN
      RAISE EXCEPTION 'Cash receipt lease, property, or tenant does not match'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.tenant_id IS NOT NULL THEN
      v_tenant_linked := coalesce(v_lease.tenant_ids ? NEW.tenant_id::text, false)
        OR coalesce(v_lease.billing_tenant_id = NEW.tenant_id, false);
      IF NOT v_tenant_linked THEN
        SELECT EXISTS (
          SELECT 1 FROM public.lease_amendments am
          JOIN public.lease_amendment_changes change ON change.amendment_id = am.id
          WHERE am.lease_id = NEW.lease_id
            AND am.status IN ('active', 'ended', 'terminated')
            AND (
              (change.field_name = 'tenantIds' AND (
                coalesce(change.old_value ? NEW.tenant_id::text, false)
                OR coalesce(change.new_value ? NEW.tenant_id::text, false)
              ))
              OR (change.field_name = 'billingTenantId' AND (
                change.old_value #>> '{}' = NEW.tenant_id::text
                OR change.new_value #>> '{}' = NEW.tenant_id::text
              ))
            )
        ) INTO v_tenant_linked;
      END IF;
      IF NOT v_tenant_linked THEN
        RAISE EXCEPTION 'Cash receipt tenant does not belong to this lease history'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    v_property_id := v_lease.property_id;
  ELSE
    v_property_id := NEW.property_id;
  END IF;

  IF NEW.unit_id IS NOT NULL THEN
    SELECT property_id INTO v_unit_property FROM public.units
    WHERE id = NEW.unit_id AND portfolio_id = NEW.portfolio_id;
    IF NOT FOUND OR v_property_id IS NULL
      OR v_unit_property IS DISTINCT FROM v_property_id THEN
      RAISE EXCEPTION 'Cash receipt unit must belong to its property'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_cash_receipt_scope() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_cash_receipt_scope
BEFORE INSERT OR UPDATE OF lease_id, tenant_id, property_id, unit_id
ON public.cash_receipts
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_receipt_scope();
