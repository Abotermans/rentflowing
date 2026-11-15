-- Serialize changes to unit shares through the parent property row. This
-- prevents concurrent unit writes from each accepting the same remaining share.
CREATE OR REPLACE FUNCTION public.guard_unit_millieme_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property public.properties%ROWTYPE;
  v_key text;
  v_share numeric;
  v_other_total numeric;
BEGIN
  SELECT * INTO v_property FROM public.properties
  WHERE id = NEW.property_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit property was not found' USING ERRCODE = '23503';
  END IF;
  IF NEW.portfolio_id IS DISTINCT FROM v_property.portfolio_id THEN
    RAISE EXCEPTION 'Unit and property must belong to the same portfolio' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(NEW.millieme_shares) <> 'object' THEN
    RAISE EXCEPTION 'Unit millieme shares must be an object' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT unnest(v_property.millieme_keys) LOOP
    IF NEW.millieme_shares ? v_key THEN
      IF jsonb_typeof(NEW.millieme_shares->v_key) <> 'number' THEN
        RAISE EXCEPTION 'Unit millieme share for key % must be a number', v_key USING ERRCODE = '22023';
      END IF;
      v_share := (NEW.millieme_shares->>v_key)::numeric;
      IF v_share < 0 THEN
        RAISE EXCEPTION 'Unit millieme share for key % cannot be negative', v_key USING ERRCODE = '23514';
      END IF;
    ELSE
      v_share := 0;
    END IF;
    SELECT coalesce(sum(CASE
      WHEN jsonb_typeof(u.millieme_shares->v_key) = 'number'
        AND (u.millieme_shares->>v_key)::numeric >= 0
      THEN (u.millieme_shares->>v_key)::numeric
      ELSE 0 END), 0)
    INTO v_other_total
    FROM public.units AS u
    WHERE u.property_id = NEW.property_id AND u.id <> NEW.id;
    IF v_other_total + v_share > v_property.millieme_base THEN
      RAISE EXCEPTION 'Unit millieme shares for key % total %, above property base %',
        v_key, v_other_total + v_share, v_property.millieme_base USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_unit_millieme_capacity
BEFORE INSERT OR UPDATE OF millieme_shares, property_id, portfolio_id ON public.units
FOR EACH ROW EXECUTE FUNCTION public.guard_unit_millieme_capacity();
