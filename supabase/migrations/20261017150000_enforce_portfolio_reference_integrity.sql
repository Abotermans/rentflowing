-- RLS checks the child row's portfolio. Without a same-portfolio reference
-- check, an editor can link that row to an object in another portfolio.
CREATE OR REPLACE FUNCTION public.enforce_portfolio_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  reference_index integer;
  reference_id uuid;
  matches boolean;
BEGIN
  FOR reference_index IN 0..(TG_NARGS / 2 - 1) LOOP
    reference_id := (to_jsonb(NEW) ->> TG_ARGV[reference_index * 2])::uuid;
    IF reference_id IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND portfolio_id = $2)',
      TG_ARGV[reference_index * 2 + 1]
    ) INTO matches USING reference_id, NEW.portfolio_id;

    IF NOT matches THEN
      RAISE EXCEPTION 'Portfolio mismatch in %.%', TG_TABLE_NAME, TG_ARGV[reference_index * 2]
        USING ERRCODE = '23503';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_portfolio_references() FROM PUBLIC;

-- Moving a parent to another portfolio would invalidate its existing child
-- references without firing a child trigger. Portfolio reassignment requires
-- an explicit data migration, not a normal row update.
CREATE OR REPLACE FUNCTION public.prevent_portfolio_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id THEN
    RAISE EXCEPTION 'Cannot change portfolio_id for %', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_portfolio_reassignment() FROM PUBLIC;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'portfolio_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_portfolio_reassignment ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER prevent_portfolio_reassignment BEFORE UPDATE OF portfolio_id ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.prevent_portfolio_reassignment()',
      table_name
    );
  END LOOP;
END;
$$;

-- Preflight every existing reference before installing any trigger. The whole
-- migration rolls back if historical cross-portfolio links need correction.
DO $$
DECLARE
  entry record;
  pair_index integer;
  arg_index integer;
  mismatches bigint;
  arguments text;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('units', ARRAY['property_id', 'properties']),
    ('leases', ARRAY['property_id', 'properties', 'billing_tenant_id', 'tenants']),
    ('guarantees', ARRAY['lease_id', 'leases']),
    ('lease_unit_assignments', ARRAY['lease_id', 'leases', 'unit_id', 'units']),
    ('lease_amendments', ARRAY['lease_id', 'leases', 'supersedes_amendment_id', 'lease_amendments']),
    ('lease_amendment_changes', ARRAY['amendment_id', 'lease_amendments']),
    ('receivable_items', ARRAY['lease_id', 'leases', 'tenant_id', 'tenants', 'property_id', 'properties', 'unit_id', 'units']),
    ('cash_receipts', ARRAY['tenant_id', 'tenants', 'lease_id', 'leases', 'property_id', 'properties', 'unit_id', 'units']),
    ('receipt_allocations', ARRAY['cash_receipt_id', 'cash_receipts', 'receivable_item_id', 'receivable_items']),
    ('maintenance_tickets', ARRAY['property_id', 'properties', 'unit_id', 'units', 'tenant_id', 'tenants', 'assigned_vendor_id', 'vendors']),
    ('allocation_rules', ARRAY['property_id', 'properties']),
    ('cost_entries', ARRAY['category_id', 'cost_categories', 'property_id', 'properties', 'unit_id', 'units', 'allocation_rule_id', 'allocation_rules']),
    ('allocation_rule_unit_shares', ARRAY['allocation_rule_id', 'allocation_rules', 'unit_id', 'units']),
    ('cost_allocation_results', ARRAY['cost_entry_id', 'cost_entries', 'property_id', 'properties', 'unit_id', 'units']),
    ('property_owner_links', ARRAY['property_id', 'properties', 'owner_id', 'property_owners']),
    ('lease_documents', ARRAY['lease_id', 'leases']),
    ('lease_status_changes', ARRAY['lease_id', 'leases']),
    ('charges_reconciliations', ARRAY['lease_id', 'leases', 'receivable_item_id', 'receivable_items'])
  ) AS references_to_check(child_table, pairs) LOOP
    -- Block writes between the historical-data preflight and trigger creation.
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', entry.child_table);
    FOR pair_index IN 1..(array_length(entry.pairs, 1) / 2) LOOP
      EXECUTE format(
        'SELECT count(*) FROM public.%1$I child LEFT JOIN public.%2$I parent ON parent.id = child.%3$I '
        || 'WHERE child.%3$I IS NOT NULL AND parent.portfolio_id IS DISTINCT FROM child.portfolio_id',
        entry.child_table, entry.pairs[pair_index * 2], entry.pairs[pair_index * 2 - 1]
      ) INTO mismatches;
      IF mismatches > 0 THEN
        RAISE EXCEPTION 'Cannot enforce portfolio references: %.% has % mismatched rows',
          entry.child_table, entry.pairs[pair_index * 2 - 1], mismatches
          USING ERRCODE = '23503';
      END IF;
    END LOOP;

    arguments := '';
    FOR arg_index IN 1..array_length(entry.pairs, 1) LOOP
      arguments := arguments || CASE WHEN arg_index > 1 THEN ', ' ELSE '' END
        || quote_literal(entry.pairs[arg_index]);
    END LOOP;
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_portfolio_references ON public.%I', entry.child_table);
    EXECUTE format(
      'CREATE TRIGGER enforce_portfolio_references BEFORE INSERT OR UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.enforce_portfolio_references(%s)',
      entry.child_table, arguments
    );
  END LOOP;
END;
$$;

-- Lease participants are stored as a JSON array, so they need a separate
-- same-portfolio check from the UUID reference pairs above.
CREATE OR REPLACE FUNCTION public.enforce_lease_tenant_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF jsonb_typeof(NEW.tenant_ids) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Lease tenant_ids must be an array' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW.tenant_ids) AS linked(id)
    LEFT JOIN public.tenants tenant ON tenant.id = linked.id::uuid
    WHERE tenant.portfolio_id IS DISTINCT FROM NEW.portfolio_id
  ) THEN
    RAISE EXCEPTION 'Portfolio mismatch in leases.tenant_ids' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_lease_tenant_ids() FROM PUBLIC;

DO $$
DECLARE
  mismatches bigint;
BEGIN
  SELECT count(*) INTO mismatches
  FROM public.leases
  WHERE jsonb_typeof(tenant_ids) IS DISTINCT FROM 'array';

  IF mismatches > 0 THEN
    RAISE EXCEPTION 'Cannot enforce portfolio references: % leases have invalid tenant_ids', mismatches
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO mismatches
  FROM public.leases lease
  CROSS JOIN LATERAL jsonb_array_elements_text(lease.tenant_ids) AS linked(id)
  LEFT JOIN public.tenants tenant ON tenant.id = linked.id::uuid
  WHERE tenant.portfolio_id IS DISTINCT FROM lease.portfolio_id;

  IF mismatches > 0 THEN
    RAISE EXCEPTION 'Cannot enforce portfolio references: leases.tenant_ids has % mismatched rows', mismatches
      USING ERRCODE = '23503';
  END IF;

  DROP TRIGGER IF EXISTS enforce_lease_tenant_ids ON public.leases;
  CREATE TRIGGER enforce_lease_tenant_ids
    BEFORE INSERT OR UPDATE ON public.leases
    FOR EACH ROW EXECUTE FUNCTION public.enforce_lease_tenant_ids();
END;
$$;
