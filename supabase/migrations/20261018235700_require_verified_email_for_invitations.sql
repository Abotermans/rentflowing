-- Possession of an invitation link is not proof of control of its email address.
CREATE OR REPLACE FUNCTION public.accept_portfolio_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  invite public.portfolio_invitations%ROWTYPE;
  account_email text;
  confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before accepting an invitation' USING ERRCODE = '28000';
  END IF;

  SELECT u.email, u.email_confirmed_at
    INTO account_email, confirmed_at
  FROM auth.users u WHERE u.id = auth.uid();
  SELECT * INTO invite FROM public.portfolio_invitations
    WHERE token = _token FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation already accepted' USING ERRCODE = '22023';
  END IF;
  IF invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation expired' USING ERRCODE = '22023';
  END IF;
  IF account_email IS NULL OR lower(trim(account_email)) <> lower(trim(invite.email)) THEN
    RAISE EXCEPTION 'Invitation belongs to another email address' USING ERRCODE = '28000';
  END IF;
  IF confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Confirm your email before accepting an invitation' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_portfolio_role(
    invite.portfolio_id, invite.invited_by,
    ARRAY['owner', 'admin']::public.portfolio_role[]
  ) OR (
    invite.role = 'owner'
    AND NOT public.has_portfolio_role(
      invite.portfolio_id, invite.invited_by,
      ARRAY['owner']::public.portfolio_role[]
    )
  ) THEN
    RAISE EXCEPTION 'The inviter no longer has permission to grant this role' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
  VALUES (invite.portfolio_id, auth.uid(), invite.role)
  ON CONFLICT (portfolio_id, user_id) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account is already a portfolio member; ask an administrator to change its role'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.portfolio_invitations SET accepted_at = now() WHERE id = invite.id;
  RETURN invite.portfolio_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_portfolio_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_portfolio_invitation(text) TO authenticated;
