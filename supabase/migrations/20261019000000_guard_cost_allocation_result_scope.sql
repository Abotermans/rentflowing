CREATE FUNCTION public.guard_cost_allocation_result_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry_id uuid;
  v_unit_id uuid;
  v_rule_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'cost_entries' THEN
    v_entry_id := NEW.id;
  ELSE
    v_entry_id := NEW.cost_entry_id;
  END IF;

  SELECT unit_id, allocation_rule_id INTO v_unit_id, v_rule_id
  FROM public.cost_entries
  WHERE id = v_entry_id
  FOR UPDATE;

  IF FOUND AND (v_unit_id IS NOT NULL OR v_rule_id IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.cost_allocation_results
      WHERE cost_entry_id = v_entry_id
    ) THEN
    RAISE EXCEPTION 'Cost allocation results require a property-level cost with an allocation rule'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_cost_allocation_result_scope() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER guard_cost_allocation_result_scope_on_results
AFTER INSERT OR UPDATE ON public.cost_allocation_results
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.guard_cost_allocation_result_scope();

CREATE CONSTRAINT TRIGGER guard_cost_allocation_result_scope_on_entries
AFTER UPDATE ON public.cost_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.guard_cost_allocation_result_scope();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cost_allocation_results AS result
    JOIN public.cost_entries AS entry ON entry.id = result.cost_entry_id
    WHERE entry.unit_id IS NOT NULL OR entry.allocation_rule_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Existing cost allocation results have no valid property-level allocation rule';
  END IF;
END;
$$;
