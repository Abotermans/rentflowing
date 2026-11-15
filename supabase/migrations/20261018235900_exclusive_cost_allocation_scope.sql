ALTER TABLE public.cost_entries
  ADD CONSTRAINT cost_entries_exclusive_allocation_scope
  CHECK (unit_id IS NULL OR allocation_rule_id IS NULL) NOT VALID;

ALTER TABLE public.cost_entries
  VALIDATE CONSTRAINT cost_entries_exclusive_allocation_scope;
