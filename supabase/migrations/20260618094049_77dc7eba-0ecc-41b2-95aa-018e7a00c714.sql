CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_portfolio_id uuid;
  v_owner_count int;
  v_portfolio_exists boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role <> 'owner' THEN RETURN OLD; END IF;
    v_portfolio_id := OLD.portfolio_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
      v_portfolio_id := OLD.portfolio_id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- If the parent portfolio is being deleted (cascade), allow it.
  SELECT EXISTS (SELECT 1 FROM public.portfolios WHERE id = v_portfolio_id)
    INTO v_portfolio_exists;
  IF NOT v_portfolio_exists THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM public.portfolio_members
  WHERE portfolio_id = v_portfolio_id AND role = 'owner';

  IF v_owner_count <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last owner of a portfolio'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;