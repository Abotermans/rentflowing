
-- 1. Last-owner guard
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_portfolio_id uuid;
  v_owner_count int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role <> 'owner' THEN RETURN OLD; END IF;
    v_portfolio_id := OLD.portfolio_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- only care if an owner is being changed to a non-owner role
    IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
      v_portfolio_id := OLD.portfolio_id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM public.portfolio_members
  WHERE portfolio_id = v_portfolio_id AND role = 'owner';

  IF v_owner_count <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last owner of a portfolio'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_owner_removal ON public.portfolio_members;
CREATE TRIGGER trg_prevent_last_owner_removal
BEFORE UPDATE OR DELETE ON public.portfolio_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_removal();

-- 2. Rewrite write policies: admins limited to non-owner rows
DROP POLICY IF EXISTS "Members: owners/admins can add" ON public.portfolio_members;
DROP POLICY IF EXISTS "Members: owners/admins can update" ON public.portfolio_members;
DROP POLICY IF EXISTS "Members: owners/admins can remove, or self leave" ON public.portfolio_members;

CREATE POLICY "Members: owners can add anyone"
ON public.portfolio_members FOR INSERT TO authenticated
WITH CHECK (
  has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role])
  OR (
    has_portfolio_role(portfolio_id, auth.uid(), ARRAY['admin'::portfolio_role])
    AND role <> 'owner'
  )
);

CREATE POLICY "Members: owners can update anyone"
ON public.portfolio_members FOR UPDATE TO authenticated
USING (
  has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role])
  OR (
    has_portfolio_role(portfolio_id, auth.uid(), ARRAY['admin'::portfolio_role])
    AND role <> 'owner'
  )
)
WITH CHECK (
  has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role])
  OR (
    has_portfolio_role(portfolio_id, auth.uid(), ARRAY['admin'::portfolio_role])
    AND role <> 'owner'
  )
);

CREATE POLICY "Members: owners remove anyone, admins remove non-owners, self leave"
ON public.portfolio_members FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role])
  OR (
    has_portfolio_role(portfolio_id, auth.uid(), ARRAY['admin'::portfolio_role])
    AND role <> 'owner'
  )
);

-- 3. Same split for invitations
DROP POLICY IF EXISTS "Invitations: owners/admins can create" ON public.portfolio_invitations;
DROP POLICY IF EXISTS "Invitations: owners/admins can update" ON public.portfolio_invitations;
DROP POLICY IF EXISTS "Invitations: owners/admins can delete" ON public.portfolio_invitations;

CREATE POLICY "Invitations: owners create any, admins create non-owner"
ON public.portfolio_invitations FOR INSERT TO authenticated
WITH CHECK (
  invited_by = auth.uid()
  AND (
    has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role])
    OR (
      has_portfolio_role(portfolio_id, auth.uid(), ARRAY['admin'::portfolio_role])
      AND role <> 'owner'
    )
  )
);

CREATE POLICY "Invitations: owners update any, admins update non-owner"
ON public.portfolio_invitations FOR UPDATE TO authenticated
USING (
  has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role])
  OR (
    has_portfolio_role(portfolio_id, auth.uid(), ARRAY['admin'::portfolio_role])
    AND role <> 'owner'
  )
)
WITH CHECK (
  has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role])
  OR (
    has_portfolio_role(portfolio_id, auth.uid(), ARRAY['admin'::portfolio_role])
    AND role <> 'owner'
  )
);

CREATE POLICY "Invitations: owners delete any, admins delete non-owner"
ON public.portfolio_invitations FOR DELETE TO authenticated
USING (
  has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner'::portfolio_role])
  OR (
    has_portfolio_role(portfolio_id, auth.uid(), ARRAY['admin'::portfolio_role])
    AND role <> 'owner'
  )
);
