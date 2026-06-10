
-- ============ Helper macros via DO blocks not used; inline grants/RLS per table ============

-- ============ PROPERTIES ============
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name text NOT NULL,
  reference_code text NOT NULL DEFAULT '',
  address1 text NOT NULL DEFAULT '',
  address2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  region_or_state text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'FR',
  locale text NOT NULL DEFAULT 'fr-FR',
  currency_code text NOT NULL DEFAULT 'EUR',
  measurement_system text NOT NULL DEFAULT 'metric',
  property_type text NOT NULL DEFAULT 'residential',
  owner_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX properties_portfolio_idx ON public.properties(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "properties_select" ON public.properties FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "properties_insert" ON public.properties FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "properties_update" ON public.properties FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "properties_delete" ON public.properties FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER properties_touch BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ UNITS ============
CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_code text NOT NULL DEFAULT '',
  unit_label text NOT NULL DEFAULT '',
  unit_type text NOT NULL DEFAULT 'apartment',
  floor integer,
  surface_area numeric(10,2),
  bedrooms integer NOT NULL DEFAULT 0,
  bathrooms integer NOT NULL DEFAULT 0,
  furnished boolean NOT NULL DEFAULT false,
  current_status text NOT NULL DEFAULT 'vacant',
  base_rent numeric(12,2),
  description text,
  rent_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_charges numeric(12,2),
  available_from date,
  notes text NOT NULL DEFAULT '',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX units_portfolio_idx ON public.units(portfolio_id);
CREATE INDEX units_property_idx ON public.units(property_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units_select" ON public.units FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "units_insert" ON public.units FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "units_update" ON public.units FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "units_delete" ON public.units FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER units_touch BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ TENANTS ============
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  date_of_birth date,
  identification_number text,
  current_address text,
  status text NOT NULL DEFAULT 'applicant',
  notes text NOT NULL DEFAULT '',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenants_portfolio_idx ON public.tenants(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_select" ON public.tenants FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "tenants_insert" ON public.tenants FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "tenants_update" ON public.tenants FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "tenants_delete" ON public.tenants FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER tenants_touch BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ LEASES ============
CREATE TABLE public.leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  primary_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  lease_reference text NOT NULL DEFAULT '',
  co_tenant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  lifecycle_stage text NOT NULL DEFAULT 'draft',
  start_date date NOT NULL,
  end_date date NOT NULL,
  monthly_rent numeric(12,2) NOT NULL DEFAULT 0,
  monthly_charges numeric(12,2) NOT NULL DEFAULT 0,
  due_day_of_month integer NOT NULL DEFAULT 1,
  deposit_or_guarantee_amount numeric(12,2),
  notice_period_text text NOT NULL DEFAULT '',
  signed_date date,
  notes text NOT NULL DEFAULT '',
  notice_given boolean NOT NULL DEFAULT false,
  notice_date date,
  intended_move_out_date date,
  termination_reason text,
  move_in_scheduled_date date,
  move_in_actual_date date,
  move_in_meter_reading text,
  move_in_water_meter_reading text,
  move_in_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  move_out_scheduled_date date,
  move_out_actual_date date,
  move_out_meter_reading text,
  move_out_water_meter_reading text,
  move_out_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  move_out_notes text NOT NULL DEFAULT '',
  key_handover_count integer NOT NULL DEFAULT 0,
  key_return_count integer NOT NULL DEFAULT 0,
  keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_status text,
  return_notes text NOT NULL DEFAULT '',
  rent_formula integer NOT NULL DEFAULT 1,
  end_reason text,
  has_advance_payment boolean NOT NULL DEFAULT false,
  advance_payment_amount numeric(12,2),
  advance_payment_date date,
  advance_allocation_method text,
  advance_applied_to text,
  advance_allocation_start_date date,
  advance_allocation_duration_months integer,
  fixed_monthly_reduction_amount numeric(12,2),
  advance_cycle_lead_days integer,
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leases_portfolio_idx ON public.leases(portfolio_id);
CREATE INDEX leases_property_idx ON public.leases(property_id);
CREATE INDEX leases_unit_idx ON public.leases(unit_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leases TO authenticated;
GRANT ALL ON public.leases TO service_role;
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leases_select" ON public.leases FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "leases_insert" ON public.leases FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "leases_update" ON public.leases FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "leases_delete" ON public.leases FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER leases_touch BEFORE UPDATE ON public.leases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ GUARANTEES ============
CREATE TABLE public.guarantees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'cash-deposit',
  expected_amount numeric(12,2) NOT NULL DEFAULT 0,
  received_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  received_date date,
  release_date date,
  retention_amount numeric(12,2),
  notes text NOT NULL DEFAULT '',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guarantees_portfolio_idx ON public.guarantees(portfolio_id);
CREATE INDEX guarantees_lease_idx ON public.guarantees(lease_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guarantees TO authenticated;
GRANT ALL ON public.guarantees TO service_role;
ALTER TABLE public.guarantees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guarantees_select" ON public.guarantees FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "guarantees_insert" ON public.guarantees FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "guarantees_update" ON public.guarantees FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "guarantees_delete" ON public.guarantees FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER guarantees_touch BEFORE UPDATE ON public.guarantees FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ LEASE UNIT ASSIGNMENTS ============
CREATE TABLE public.lease_unit_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  assignment_type text NOT NULL DEFAULT 'primary',
  is_primary boolean NOT NULL DEFAULT false,
  start_date date NOT NULL,
  end_date date,
  rent_share numeric(12,2),
  charges_share numeric(12,2),
  notes text NOT NULL DEFAULT '',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lua_portfolio_idx ON public.lease_unit_assignments(portfolio_id);
CREATE INDEX lua_lease_idx ON public.lease_unit_assignments(lease_id);
CREATE INDEX lua_unit_idx ON public.lease_unit_assignments(unit_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_unit_assignments TO authenticated;
GRANT ALL ON public.lease_unit_assignments TO service_role;
ALTER TABLE public.lease_unit_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lua_select" ON public.lease_unit_assignments FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "lua_insert" ON public.lease_unit_assignments FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "lua_update" ON public.lease_unit_assignments FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "lua_delete" ON public.lease_unit_assignments FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER lua_touch BEFORE UPDATE ON public.lease_unit_assignments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ LEASE AMENDMENTS ============
CREATE TABLE public.lease_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
  amendment_number integer NOT NULL DEFAULT 1,
  amendment_type text NOT NULL DEFAULT 'mixed',
  title text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  effective_date date NOT NULL,
  signed_date date,
  status text NOT NULL DEFAULT 'draft',
  supersedes_amendment_id uuid REFERENCES public.lease_amendments(id) ON DELETE SET NULL,
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX la_portfolio_idx ON public.lease_amendments(portfolio_id);
CREATE INDEX la_lease_idx ON public.lease_amendments(lease_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_amendments TO authenticated;
GRANT ALL ON public.lease_amendments TO service_role;
ALTER TABLE public.lease_amendments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "la_select" ON public.lease_amendments FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "la_insert" ON public.lease_amendments FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "la_update" ON public.lease_amendments FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "la_delete" ON public.lease_amendments FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER la_touch BEFORE UPDATE ON public.lease_amendments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ LEASE AMENDMENT CHANGES ============
CREATE TABLE public.lease_amendment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  amendment_id uuid NOT NULL REFERENCES public.lease_amendments(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  change_type text NOT NULL DEFAULT 'set',
  old_value jsonb,
  new_value jsonb,
  metadata jsonb,
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lac_portfolio_idx ON public.lease_amendment_changes(portfolio_id);
CREATE INDEX lac_amendment_idx ON public.lease_amendment_changes(amendment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_amendment_changes TO authenticated;
GRANT ALL ON public.lease_amendment_changes TO service_role;
ALTER TABLE public.lease_amendment_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lac_select" ON public.lease_amendment_changes FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "lac_insert" ON public.lease_amendment_changes FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "lac_update" ON public.lease_amendment_changes FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "lac_delete" ON public.lease_amendment_changes FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER lac_touch BEFORE UPDATE ON public.lease_amendment_changes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RECEIVABLE ITEMS ============
CREATE TABLE public.receivable_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  lease_id uuid REFERENCES public.leases(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  item_type text NOT NULL DEFAULT 'rent',
  label text NOT NULL DEFAULT '',
  period_month text,
  due_date date NOT NULL,
  currency_code text NOT NULL DEFAULT 'EUR',
  expected_amount numeric(14,2) NOT NULL DEFAULT 0,
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  priority integer NOT NULL DEFAULT 50,
  origin text NOT NULL DEFAULT 'manual',
  notes text NOT NULL DEFAULT '',
  cycle_index integer,
  cycle_end_date date,
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ri_portfolio_idx ON public.receivable_items(portfolio_id);
CREATE INDEX ri_lease_idx ON public.receivable_items(lease_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivable_items TO authenticated;
GRANT ALL ON public.receivable_items TO service_role;
ALTER TABLE public.receivable_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ri_select" ON public.receivable_items FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "ri_insert" ON public.receivable_items FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "ri_update" ON public.receivable_items FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "ri_delete" ON public.receivable_items FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER ri_touch BEFORE UPDATE ON public.receivable_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ CASH RECEIPTS ============
CREATE TABLE public.cash_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  lease_id uuid REFERENCES public.leases(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'bank-transfer',
  payment_date date NOT NULL,
  booking_date date,
  value_date date,
  amount_received numeric(14,2) NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'EUR',
  payer_name text,
  payer_iban text,
  payer_bic text,
  reference text,
  remittance_information text,
  end_to_end_reference text,
  status text NOT NULL DEFAULT 'unmatched',
  unmatched_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  import_batch_id text,
  raw_bank_transaction_id text,
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cr_portfolio_idx ON public.cash_receipts(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_receipts TO authenticated;
GRANT ALL ON public.cash_receipts TO service_role;
ALTER TABLE public.cash_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr_select" ON public.cash_receipts FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "cr_insert" ON public.cash_receipts FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "cr_update" ON public.cash_receipts FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "cr_delete" ON public.cash_receipts FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER cr_touch BEFORE UPDATE ON public.cash_receipts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RECEIPT ALLOCATIONS ============
CREATE TABLE public.receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  cash_receipt_id uuid NOT NULL REFERENCES public.cash_receipts(id) ON DELETE CASCADE,
  receivable_item_id uuid NOT NULL REFERENCES public.receivable_items(id) ON DELETE CASCADE,
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  allocation_type text NOT NULL DEFAULT 'manual',
  allocation_date date NOT NULL,
  notes text NOT NULL DEFAULT '',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ra_portfolio_idx ON public.receipt_allocations(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_allocations TO authenticated;
GRANT ALL ON public.receipt_allocations TO service_role;
ALTER TABLE public.receipt_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ra_select" ON public.receipt_allocations FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "ra_insert" ON public.receipt_allocations FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "ra_update" ON public.receipt_allocations FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "ra_delete" ON public.receipt_allocations FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER ra_touch BEFORE UPDATE ON public.receipt_allocations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ VENDORS ============
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  vendor_name text NOT NULL DEFAULT '',
  trade_category text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendors_portfolio_idx ON public.vendors(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_select" ON public.vendors FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "vendors_insert" ON public.vendors FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "vendors_update" ON public.vendors FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "vendors_delete" ON public.vendors FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER vendors_touch BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ MAINTENANCE TICKETS ============
CREATE TABLE public.maintenance_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  assigned_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  created_date date NOT NULL DEFAULT current_date,
  scheduled_date date,
  completed_date date,
  internal_notes text NOT NULL DEFAULT '',
  resident_visible_notes text NOT NULL DEFAULT '',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mt_portfolio_idx ON public.maintenance_tickets(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_tickets TO authenticated;
GRANT ALL ON public.maintenance_tickets TO service_role;
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_select" ON public.maintenance_tickets FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "mt_insert" ON public.maintenance_tickets FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "mt_update" ON public.maintenance_tickets FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "mt_delete" ON public.maintenance_tickets FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER mt_touch BEFORE UPDATE ON public.maintenance_tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ COST CATEGORIES ============
CREATE TABLE public.cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  code text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  nature text NOT NULL DEFAULT 'charge',
  scope text NOT NULL DEFAULT 'property',
  recovery_type_default text NOT NULL DEFAULT 'owner-only',
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cc_portfolio_idx ON public.cost_categories(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_categories TO authenticated;
GRANT ALL ON public.cost_categories TO service_role;
ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_select" ON public.cost_categories FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "cc_insert" ON public.cost_categories FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "cc_update" ON public.cost_categories FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "cc_delete" ON public.cost_categories FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER cc_touch BEFORE UPDATE ON public.cost_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ALLOCATION RULES ============
CREATE TABLE public.allocation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  method text NOT NULL DEFAULT 'equal',
  apply_only_to_occupied_units boolean NOT NULL DEFAULT false,
  include_unavailable_units boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ar_portfolio_idx ON public.allocation_rules(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocation_rules TO authenticated;
GRANT ALL ON public.allocation_rules TO service_role;
ALTER TABLE public.allocation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ar_select" ON public.allocation_rules FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "ar_insert" ON public.allocation_rules FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "ar_update" ON public.allocation_rules FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "ar_delete" ON public.allocation_rules FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER ar_touch BEFORE UPDATE ON public.allocation_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ COST ENTRIES ============
CREATE TABLE public.cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.cost_categories(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  allocation_rule_id uuid REFERENCES public.allocation_rules(id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  frequency text NOT NULL DEFAULT 'one-off',
  start_date date NOT NULL,
  end_date date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'EUR',
  is_tax boolean NOT NULL DEFAULT false,
  recovery_type text NOT NULL DEFAULT 'owner-only',
  vendor_name text NOT NULL DEFAULT '',
  invoice_reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  notes text NOT NULL DEFAULT '',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ce_portfolio_idx ON public.cost_entries(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_entries TO authenticated;
GRANT ALL ON public.cost_entries TO service_role;
ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ce_select" ON public.cost_entries FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "ce_insert" ON public.cost_entries FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "ce_update" ON public.cost_entries FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "ce_delete" ON public.cost_entries FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER ce_touch BEFORE UPDATE ON public.cost_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ALLOCATION RULE UNIT SHARES ============
CREATE TABLE public.allocation_rule_unit_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  allocation_rule_id uuid NOT NULL REFERENCES public.allocation_rules(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  percentage_share numeric(8,4),
  fixed_amount_share numeric(14,2),
  coefficient numeric(10,4),
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arus_portfolio_idx ON public.allocation_rule_unit_shares(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocation_rule_unit_shares TO authenticated;
GRANT ALL ON public.allocation_rule_unit_shares TO service_role;
ALTER TABLE public.allocation_rule_unit_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arus_select" ON public.allocation_rule_unit_shares FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "arus_insert" ON public.allocation_rule_unit_shares FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "arus_update" ON public.allocation_rule_unit_shares FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "arus_delete" ON public.allocation_rule_unit_shares FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER arus_touch BEFORE UPDATE ON public.allocation_rule_unit_shares FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ COST ALLOCATION RESULTS ============
CREATE TABLE public.cost_allocation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  cost_entry_id uuid NOT NULL REFERENCES public.cost_entries(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  recovery_type text NOT NULL DEFAULT 'owner-only',
  recoverable_amount numeric(14,2) NOT NULL DEFAULT 0,
  owner_burden_amount numeric(14,2) NOT NULL DEFAULT 0,
  period_start date,
  period_end date,
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX car_portfolio_idx ON public.cost_allocation_results(portfolio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_allocation_results TO authenticated;
GRANT ALL ON public.cost_allocation_results TO service_role;
ALTER TABLE public.cost_allocation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "car_select" ON public.cost_allocation_results FOR SELECT TO authenticated USING (public.is_portfolio_member(portfolio_id, auth.uid()));
CREATE POLICY "car_insert" ON public.cost_allocation_results FOR INSERT TO authenticated WITH CHECK (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "car_update" ON public.cost_allocation_results FOR UPDATE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE POLICY "car_delete" ON public.cost_allocation_results FOR DELETE TO authenticated USING (public.has_portfolio_role(portfolio_id, auth.uid(), ARRAY['owner','editor']::portfolio_role[]));
CREATE TRIGGER car_touch BEFORE UPDATE ON public.cost_allocation_results FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
