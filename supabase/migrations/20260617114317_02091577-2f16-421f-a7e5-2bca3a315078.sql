
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_invitations TO authenticated;

GRANT ALL ON public.portfolios TO service_role;
GRANT ALL ON public.portfolio_members TO service_role;
GRANT ALL ON public.portfolio_invitations TO service_role;

GRANT EXECUTE ON FUNCTION public.is_portfolio_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[]) TO authenticated;
