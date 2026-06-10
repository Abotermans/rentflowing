GRANT EXECUTE ON FUNCTION public.is_portfolio_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_portfolio_role(uuid, uuid, portfolio_role[]) TO authenticated, anon;