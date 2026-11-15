CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_first text := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  v_last text := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  v_portfolio_id uuid;
  v_portfolio_name text;
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, NULLIF(v_first, ''), NULLIF(v_last, ''))
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.default_portfolio_id INTO v_portfolio_id
  FROM public.profiles p WHERE p.id = NEW.id FOR UPDATE;

  IF v_portfolio_id IS NULL THEN
    SELECT p.id INTO v_portfolio_id
    FROM public.portfolios p
    WHERE p.created_by = NEW.id
    ORDER BY p.created_at, p.id
    LIMIT 1;
  END IF;

  IF v_portfolio_id IS NULL THEN
    SELECT m.portfolio_id INTO v_portfolio_id
    FROM public.portfolio_members m
    WHERE m.user_id = NEW.id
    ORDER BY m.joined_at, m.id
    LIMIT 1;
  END IF;

  IF v_portfolio_id IS NULL AND EXISTS (
    SELECT 1
    FROM public.portfolio_invitations i
    WHERE lower(trim(i.email)) = lower(trim(NEW.email))
      AND i.accepted_at IS NULL
      AND i.expires_at > now()
      AND public.has_portfolio_role(
        i.portfolio_id, i.invited_by,
        ARRAY['owner', 'admin']::public.portfolio_role[]
      )
      AND (
        i.role <> 'owner'
        OR public.has_portfolio_role(
          i.portfolio_id, i.invited_by,
          ARRAY['owner']::public.portfolio_role[]
        )
      )
  ) THEN
    RETURN NEW;
  END IF;

  IF v_portfolio_id IS NULL THEN
    v_portfolio_name := COALESCE(
      NULLIF(trim(v_first || ' ' || v_last), ''),
      split_part(NEW.email, '@', 1),
      'My Portfolio'
    ) || '''s Portfolio';

    INSERT INTO public.portfolios (name, created_by)
    VALUES (v_portfolio_name, NEW.id)
    RETURNING id INTO v_portfolio_id;

    INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
    VALUES (v_portfolio_id, NEW.id, 'owner')
    ON CONFLICT (portfolio_id, user_id) DO NOTHING;
  END IF;

  UPDATE public.profiles
  SET default_portfolio_id = v_portfolio_id
  WHERE id = NEW.id AND default_portfolio_id IS DISTINCT FROM v_portfolio_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
