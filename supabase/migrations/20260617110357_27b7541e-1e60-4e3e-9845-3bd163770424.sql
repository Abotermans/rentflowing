REVOKE EXECUTE ON FUNCTION public.add_portfolio_creator_as_owner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_portfolio_creator_as_owner() FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_portfolio_creator_as_owner() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_portfolio_creator_as_owner() TO service_role;