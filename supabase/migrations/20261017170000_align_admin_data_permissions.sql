-- Portfolio admins manage operational data, just as owners and editors do.
-- Keep membership, invitation, and portfolio-deletion privileges separate.
DO $$
DECLARE
  entry record;
  predicate text := 'public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY[''owner'', ''admin'', ''editor'']::public.portfolio_role[])';
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('properties', 'properties'),
    ('units', 'units'),
    ('tenants', 'tenants'),
    ('leases', 'leases'),
    ('guarantees', 'guarantees'),
    ('lease_unit_assignments', 'lua'),
    ('lease_amendments', 'la'),
    ('lease_amendment_changes', 'lac'),
    ('receivable_items', 'ri'),
    ('cash_receipts', 'cr'),
    ('receipt_allocations', 'ra'),
    ('vendors', 'vendors'),
    ('maintenance_tickets', 'mt'),
    ('cost_categories', 'cc'),
    ('allocation_rules', 'ar'),
    ('cost_entries', 'ce'),
    ('allocation_rule_unit_shares', 'arus'),
    ('cost_allocation_results', 'car'),
    ('property_owners', 'property_owners'),
    ('property_owner_links', 'property_owner_links'),
    ('charges_reconciliations', 'cr')
  ) AS policies(table_name, prefix) LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
      entry.prefix || '_insert', entry.table_name, predicate);
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
      entry.prefix || '_update', entry.table_name, predicate, predicate);
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
      entry.prefix || '_delete', entry.table_name, predicate);
  END LOOP;

  EXECUTE format('ALTER POLICY lease_status_changes_insert ON public.lease_status_changes WITH CHECK (%s)', predicate);
END;
$$;
