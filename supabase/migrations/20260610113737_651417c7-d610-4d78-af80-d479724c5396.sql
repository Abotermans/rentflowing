
-- =========================
-- ENUM: portfolio role
-- =========================
CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- =========================
-- profiles
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  default_portfolio_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles: read own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Profiles: insert own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles: update own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =========================
-- portfolios
-- =========================
CREATE TABLE public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  default_currency TEXT NOT NULL DEFAULT 'EUR',
  default_locale TEXT NOT NULL DEFAULT 'en',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

-- =========================
-- portfolio_members
-- =========================
CREATE TABLE public.portfolio_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.portfolio_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, user_id)
);

CREATE INDEX idx_portfolio_members_user ON public.portfolio_members(user_id);
CREATE INDEX idx_portfolio_members_portfolio ON public.portfolio_members(portfolio_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_members TO authenticated;
GRANT ALL ON public.portfolio_members TO service_role;
ALTER TABLE public.portfolio_members ENABLE ROW LEVEL SECURITY;

-- Security-definer helper: is the user a member of a portfolio?
CREATE OR REPLACE FUNCTION public.is_portfolio_member(_portfolio_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portfolio_members
    WHERE portfolio_id = _portfolio_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_portfolio_role(_portfolio_id UUID, _user_id UUID, _roles public.portfolio_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portfolio_members
    WHERE portfolio_id = _portfolio_id
      AND user_id = _user_id
      AND role = ANY(_roles)
  );
$$;

-- portfolios policies (defined after helper)
CREATE POLICY "Portfolios: members can read"
  ON public.portfolios FOR SELECT TO authenticated
  USING (public.is_portfolio_member(id, auth.uid()));

CREATE POLICY "Portfolios: authenticated can create"
  ON public.portfolios FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Portfolios: owners/admins can update"
  ON public.portfolios FOR UPDATE TO authenticated
  USING (public.has_portfolio_role(id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]))
  WITH CHECK (public.has_portfolio_role(id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));

CREATE POLICY "Portfolios: owners can delete"
  ON public.portfolios FOR DELETE TO authenticated
  USING (public.has_portfolio_role(id, auth.uid(), ARRAY['owner']::public.portfolio_role[]));

-- portfolio_members policies
CREATE POLICY "Members: read members of my portfolios"
  ON public.portfolio_members FOR SELECT TO authenticated
  USING (public.is_portfolio_member(portfolio_id, auth.uid()));

CREATE POLICY "Members: owners/admins can add"
  ON public.portfolio_members FOR INSERT TO authenticated
  WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));

CREATE POLICY "Members: owners/admins can update"
  ON public.portfolio_members FOR UPDATE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]))
  WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));

CREATE POLICY "Members: owners/admins can remove, or self leave"
  ON public.portfolio_members FOR DELETE TO authenticated
  USING (
    public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[])
    OR user_id = auth.uid()
  );

-- =========================
-- portfolio_invitations
-- =========================
CREATE TABLE public.portfolio_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.portfolio_role NOT NULL DEFAULT 'editor',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolio_invitations_email ON public.portfolio_invitations(lower(email));
CREATE INDEX idx_portfolio_invitations_portfolio ON public.portfolio_invitations(portfolio_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_invitations TO authenticated;
GRANT ALL ON public.portfolio_invitations TO service_role;
ALTER TABLE public.portfolio_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invitations: members can read"
  ON public.portfolio_invitations FOR SELECT TO authenticated
  USING (public.is_portfolio_member(portfolio_id, auth.uid()));

CREATE POLICY "Invitations: owners/admins can create"
  ON public.portfolio_invitations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[])
    AND invited_by = auth.uid()
  );

CREATE POLICY "Invitations: owners/admins can update"
  ON public.portfolio_invitations FOR UPDATE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]))
  WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));

CREATE POLICY "Invitations: owners/admins can delete"
  ON public.portfolio_invitations FOR DELETE TO authenticated
  USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','admin']::public.portfolio_role[]));

-- =========================
-- Triggers
-- =========================

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- On signup: create profile + a default Portfolio + owner membership
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first TEXT := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  v_last  TEXT := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  v_portfolio_name TEXT;
  v_portfolio_id UUID;
BEGIN
  -- profile
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, NULLIF(v_first,''), NULLIF(v_last,''))
  ON CONFLICT (id) DO NOTHING;

  -- starter portfolio
  v_portfolio_name := COALESCE(
    NULLIF(trim(v_first || ' ' || v_last), ''),
    split_part(NEW.email, '@', 1),
    'My Portfolio'
  ) || '''s Portfolio';

  INSERT INTO public.portfolios (name, created_by)
  VALUES (v_portfolio_name, NEW.id)
  RETURNING id INTO v_portfolio_id;

  INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
  VALUES (v_portfolio_id, NEW.id, 'owner');

  UPDATE public.profiles SET default_portfolio_id = v_portfolio_id WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
