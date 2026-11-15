-- Only portfolio owners/admins may resolve member IDs to account emails.
CREATE OR REPLACE FUNCTION public.list_portfolio_members_for_management(_portfolio_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role public.portfolio_role,
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.user_id, u.email, m.role, m.joined_at
  FROM public.portfolio_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.portfolio_id = _portfolio_id
    AND public.has_portfolio_role(
      _portfolio_id,
      auth.uid(),
      ARRAY['owner', 'admin']::public.portfolio_role[]
    )
  ORDER BY m.joined_at, m.id;
$$;

REVOKE ALL ON FUNCTION public.list_portfolio_members_for_management(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_portfolio_members_for_management(uuid) TO authenticated;
