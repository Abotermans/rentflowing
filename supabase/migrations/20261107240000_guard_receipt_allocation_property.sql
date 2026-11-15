-- A tenant-level receipt with a property selected must not settle a debt
-- from another property, even if both debts belong to the same tenant.
CREATE FUNCTION public.guard_receipt_allocation_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_receipt_property uuid;
  v_item_property uuid;
BEGIN
  SELECT property_id INTO v_receipt_property
  FROM public.cash_receipts WHERE id = NEW.cash_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash receipt does not exist' USING ERRCODE = '23503';
  END IF;
  SELECT property_id INTO v_item_property
  FROM public.receivable_items WHERE id = NEW.receivable_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receivable does not exist' USING ERRCODE = '23503';
  END IF;
  IF v_receipt_property IS NOT NULL
    AND v_receipt_property IS DISTINCT FROM v_item_property THEN
    RAISE EXCEPTION 'Receipt property does not match receivable property'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_receipt_allocation_property()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_receipt_allocation_property
BEFORE INSERT OR UPDATE OF cash_receipt_id, receivable_item_id
ON public.receipt_allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_allocation_property();
