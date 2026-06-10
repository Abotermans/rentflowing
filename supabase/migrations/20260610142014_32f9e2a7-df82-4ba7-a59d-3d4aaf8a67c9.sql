
ALTER TABLE public.portfolios
  DROP CONSTRAINT portfolios_created_by_fkey,
  ALTER COLUMN created_by DROP NOT NULL,
  ADD CONSTRAINT portfolios_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.portfolio_invitations
  DROP CONSTRAINT portfolio_invitations_invited_by_fkey,
  ALTER COLUMN invited_by DROP NOT NULL,
  ADD CONSTRAINT portfolio_invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
