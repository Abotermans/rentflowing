
CREATE TYPE public.property_owner_type AS ENUM ('individual', 'corporation');

CREATE TABLE public.property_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.property_owner_type NOT NULL DEFAULT 'individual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_owners_portfolio_id_idx ON public.property_owners(portfolio_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_owners TO authenticated;
GRANT ALL ON public.property_owners TO service_role;

ALTER TABLE public.property_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_owners_select ON public.property_owners
  FOR SELECT USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY property_owners_insert ON public.property_owners
  FOR INSERT WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));
CREATE POLICY property_owners_update ON public.property_owners
  FOR UPDATE USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));
CREATE POLICY property_owners_delete ON public.property_owners
  FOR DELETE USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));

CREATE TRIGGER touch_property_owners_updated_at
  BEFORE UPDATE ON public.property_owners
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE public.property_owner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.property_owners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, owner_id)
);
CREATE INDEX property_owner_links_portfolio_id_idx ON public.property_owner_links(portfolio_id);
CREATE INDEX property_owner_links_property_id_idx ON public.property_owner_links(property_id);
CREATE INDEX property_owner_links_owner_id_idx ON public.property_owner_links(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_owner_links TO authenticated;
GRANT ALL ON public.property_owner_links TO service_role;

ALTER TABLE public.property_owner_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_owner_links_select ON public.property_owner_links
  FOR SELECT USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY property_owner_links_insert ON public.property_owner_links
  FOR INSERT WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));
CREATE POLICY property_owner_links_update ON public.property_owner_links
  FOR UPDATE USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));
CREATE POLICY property_owner_links_delete ON public.property_owner_links
  FOR DELETE USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role, 'editor'::portfolio_role]));

CREATE TRIGGER touch_property_owner_links_updated_at
  BEFORE UPDATE ON public.property_owner_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
