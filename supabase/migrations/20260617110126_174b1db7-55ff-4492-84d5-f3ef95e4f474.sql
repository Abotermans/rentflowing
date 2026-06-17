
CREATE OR REPLACE FUNCTION public.add_portfolio_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner')
    ON CONFLICT (portfolio_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_portfolio_creator_as_owner ON public.portfolios;
CREATE TRIGGER trg_add_portfolio_creator_as_owner
AFTER INSERT ON public.portfolios
FOR EACH ROW EXECUTE FUNCTION public.add_portfolio_creator_as_owner();
