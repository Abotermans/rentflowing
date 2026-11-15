-- Status history is evidence of a committed lease transition, not client input.
ALTER FUNCTION public.ensure_lease_status_history() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.ensure_lease_status_history() FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.lease_status_changes FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
