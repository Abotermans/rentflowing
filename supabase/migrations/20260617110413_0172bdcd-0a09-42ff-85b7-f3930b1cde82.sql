REVOKE EXECUTE ON FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_portfolio_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_portfolio_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_portfolio_member(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_portfolio_member(uuid, uuid) TO service_role;