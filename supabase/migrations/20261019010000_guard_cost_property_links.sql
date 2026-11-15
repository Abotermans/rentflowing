-- A portfolio match alone does not prevent assigning a cost to another
-- property in the same portfolio. Composite references remain deferrable so
-- the cost-entry RPC can replace allocations within one transaction.
CREATE UNIQUE INDEX units_id_property_id_key ON public.units (id, property_id);
CREATE UNIQUE INDEX allocation_rules_id_property_id_key
  ON public.allocation_rules (id, property_id);
CREATE UNIQUE INDEX cost_entries_id_property_id_key
  ON public.cost_entries (id, property_id);

ALTER TABLE public.cost_entries
  ADD CONSTRAINT cost_entries_unit_property_fk
  FOREIGN KEY (unit_id, property_id)
  REFERENCES public.units (id, property_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public.cost_entries
  ADD CONSTRAINT cost_entries_rule_property_fk
  FOREIGN KEY (allocation_rule_id, property_id)
  REFERENCES public.allocation_rules (id, property_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public.cost_allocation_results
  ADD CONSTRAINT cost_results_entry_property_fk
  FOREIGN KEY (cost_entry_id, property_id)
  REFERENCES public.cost_entries (id, property_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public.cost_allocation_results
  ADD CONSTRAINT cost_results_unit_property_fk
  FOREIGN KEY (unit_id, property_id)
  REFERENCES public.units (id, property_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public.cost_entries VALIDATE CONSTRAINT cost_entries_unit_property_fk;
ALTER TABLE public.cost_entries VALIDATE CONSTRAINT cost_entries_rule_property_fk;
ALTER TABLE public.cost_allocation_results VALIDATE CONSTRAINT cost_results_entry_property_fk;
ALTER TABLE public.cost_allocation_results VALIDATE CONSTRAINT cost_results_unit_property_fk;

-- Rule shares have no property_id column, so their property relationship
-- needs a trigger on both the child and either parent changing property.
CREATE FUNCTION public.guard_allocation_rule_unit_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rule_property uuid;
  v_unit_property uuid;
BEGIN
  IF TG_TABLE_NAME = 'allocation_rule_unit_shares' THEN
    SELECT property_id INTO v_rule_property
    FROM public.allocation_rules WHERE id = NEW.allocation_rule_id FOR SHARE;
    SELECT property_id INTO v_unit_property
    FROM public.units WHERE id = NEW.unit_id FOR SHARE;
    IF v_rule_property IS DISTINCT FROM v_unit_property THEN
      RAISE EXCEPTION 'Allocation rule share unit must belong to the rule property'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.property_id IS DISTINCT FROM OLD.property_id THEN
    IF TG_TABLE_NAME = 'allocation_rules' AND EXISTS (
      SELECT 1 FROM public.allocation_rule_unit_shares
      WHERE allocation_rule_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'An allocation rule with unit shares cannot change property'
        USING ERRCODE = '23514';
    ELSIF TG_TABLE_NAME = 'units' AND EXISTS (
      SELECT 1 FROM public.allocation_rule_unit_shares
      WHERE unit_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'A unit in an allocation rule cannot change property'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_allocation_rule_unit_property() FROM PUBLIC;

-- Block writes while validating historical shares and installing the guard.
LOCK TABLE public.allocation_rule_unit_shares, public.allocation_rules, public.units
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.allocation_rule_unit_shares AS share
    JOIN public.allocation_rules AS rule ON rule.id = share.allocation_rule_id
    JOIN public.units AS unit ON unit.id = share.unit_id
    WHERE rule.property_id IS DISTINCT FROM unit.property_id
  ) THEN
    RAISE EXCEPTION 'Existing allocation rule shares refer to units in another property'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TRIGGER guard_rule_share_unit_property
BEFORE INSERT OR UPDATE OF allocation_rule_id, unit_id
ON public.allocation_rule_unit_shares
FOR EACH ROW EXECUTE FUNCTION public.guard_allocation_rule_unit_property();

CREATE TRIGGER guard_rule_share_rule_property_move
BEFORE UPDATE OF property_id ON public.allocation_rules
FOR EACH ROW EXECUTE FUNCTION public.guard_allocation_rule_unit_property();

CREATE TRIGGER guard_rule_share_unit_property_move
BEFORE UPDATE OF property_id ON public.units
FOR EACH ROW EXECUTE FUNCTION public.guard_allocation_rule_unit_property();
