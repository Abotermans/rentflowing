CREATE OR REPLACE FUNCTION public.set_first_portfolio_as_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET default_portfolio_id = NEW.portfolio_id
  WHERE id = NEW.user_id AND default_portfolio_id IS NULL;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_first_portfolio_as_default()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_first_portfolio_membership ON public.portfolio_members;
CREATE TRIGGER on_first_portfolio_membership
  AFTER INSERT ON public.portfolio_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_first_portfolio_as_default();
