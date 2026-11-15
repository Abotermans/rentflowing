-- Remove the legacy assignment role; unit type determines its use.
ALTER TABLE public.lease_unit_assignments
  DROP COLUMN IF EXISTS assignment_type;
