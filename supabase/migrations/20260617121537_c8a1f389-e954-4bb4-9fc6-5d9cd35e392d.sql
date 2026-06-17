
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_first TEXT := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  v_last  TEXT := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  v_portfolio_name TEXT;
  v_portfolio_id UUID;
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, NULLIF(v_first,''), NULLIF(v_last,''))
  ON CONFLICT (id) DO NOTHING;

  v_portfolio_name := COALESCE(
    NULLIF(trim(v_first || ' ' || v_last), ''),
    split_part(NEW.email, '@', 1),
    'My Portfolio'
  ) || '''s Portfolio';

  INSERT INTO public.portfolios (name, created_by)
  VALUES (v_portfolio_name, NEW.id)
  RETURNING id INTO v_portfolio_id;

  -- The add_portfolio_creator_as_owner trigger already inserts this row,
  -- but keep an idempotent insert here as a safety net.
  INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
  VALUES (v_portfolio_id, NEW.id, 'owner')
  ON CONFLICT (portfolio_id, user_id) DO NOTHING;

  UPDATE public.profiles SET default_portfolio_id = v_portfolio_id WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;
