GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_members TO authenticated;
GRANT ALL ON public.portfolio_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_invitations TO authenticated;
GRANT ALL ON public.portfolio_invitations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;