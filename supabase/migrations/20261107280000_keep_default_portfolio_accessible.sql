-- A user's preferred portfolio must remain one of their memberships.
UPDATE public.profiles AS p
SET default_portfolio_id = (
  SELECT m.portfolio_id
  FROM public.portfolio_members AS m
  WHERE m.user_id = p.id
  ORDER BY m.joined_at, m.id
  LIMIT 1
)
WHERE p.default_portfolio_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.portfolio_members AS m
    WHERE m.user_id = p.id AND m.portfolio_id = p.default_portfolio_id
  );

CREATE FUNCTION public.require_accessible_default_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.default_portfolio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.portfolio_members AS m
    WHERE m.user_id = NEW.id AND m.portfolio_id = NEW.default_portfolio_id
  ) THEN
    RAISE EXCEPTION 'Default portfolio must be an active membership'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_accessible_default_portfolio()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_accessible_default_portfolio
  BEFORE INSERT OR UPDATE OF default_portfolio_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.require_accessible_default_portfolio();

CREATE FUNCTION public.replace_default_portfolio_after_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles AS p
  SET default_portfolio_id = (
    SELECT m.portfolio_id
    FROM public.portfolio_members AS m
    WHERE m.user_id = OLD.user_id
    ORDER BY m.joined_at, m.id
    LIMIT 1
  )
  WHERE p.id = OLD.user_id AND p.default_portfolio_id = OLD.portfolio_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_default_portfolio_after_leave()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER portfolio_members_replace_default_after_leave
  AFTER DELETE ON public.portfolio_members
  FOR EACH ROW EXECUTE FUNCTION public.replace_default_portfolio_after_leave();
