-- A property currency defines the meaning of unit prices and financial rows.
-- Changing it after related data exists would relabel amounts without conversion.
CREATE FUNCTION public.guard_property_currency_after_use()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.currency_code IS NOT DISTINCT FROM OLD.currency_code THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.units WHERE property_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.leases WHERE property_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.receivable_items WHERE property_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.cash_receipts WHERE property_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.cost_entries WHERE property_id = OLD.id) THEN
    RAISE EXCEPTION 'Property currency cannot change while units or financial records exist'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_property_currency_after_use
BEFORE UPDATE OF currency_code ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_property_currency_after_use();
