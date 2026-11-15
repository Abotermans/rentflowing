-- Browser roles do not need direct access to elevated trigger helpers.
REVOKE ALL ON FUNCTION public.check_lease_document_type()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_used_lease_document_type_deletion()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_unit_millieme_capacity()
  FROM PUBLIC, anon, authenticated;

-- Explicitly place temporary objects after trusted public objects. The
-- older definitions used only public, leaving pg_temp implicitly first for
-- relation lookup even though their current table references are qualified.
ALTER FUNCTION public.add_portfolio_creator_as_owner()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
  SET search_path = public, pg_temp;
ALTER FUNCTION public.is_portfolio_member(uuid, uuid)
  SET search_path = public, pg_temp;
