-- A lease must be created with its assignments and schedule in one transaction.
-- Assignment changes must likewise use the guarded edit/amendment/closure flows.
REVOKE INSERT ON public.leases FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.lease_unit_assignments
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_lease_atomically(
  jsonb, timestamptz, date, boolean, text, text
) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
