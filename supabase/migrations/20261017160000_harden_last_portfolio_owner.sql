-- Serialize owner removals on the parent portfolio. Without this lock, two
-- concurrent transactions can both observe two owners and remove both.
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_portfolio_id uuid;
  v_locked_portfolio_id uuid;
  v_owner_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role <> 'owner' THEN
      RETURN OLD;
    END IF;
    v_portfolio_id := OLD.portfolio_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role <> 'owner' OR NEW.role = 'owner' THEN
      RETURN NEW;
    END IF;
    v_portfolio_id := OLD.portfolio_id;
  END IF;

  SELECT id INTO v_locked_portfolio_id
  FROM public.portfolios
  WHERE id = v_portfolio_id
  FOR UPDATE;

  -- Deleting a portfolio cascades to its memberships; there is no surviving
  -- portfolio whose last owner needs protection in that case.
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM public.portfolio_members
  WHERE portfolio_id = v_portfolio_id AND role = 'owner';

  IF v_owner_count <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last owner of a portfolio'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_last_owner_removal() FROM PUBLIC;
