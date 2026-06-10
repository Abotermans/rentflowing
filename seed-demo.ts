import { randomUUID } from "node:crypto";
import { initialProperties, initialUnits, initialTenants, initialLeases, initialGuarantees, initialLeaseUnitAssignments, initialAmendments, initialAmendmentChanges } from "@/data/mockData";
import { initialReceivableItems, initialCashReceipts, initialAllocations } from "@/data/receivablesMockData";
import { initialTickets, initialVendors } from "@/data/maintenanceMockData";
import { initialCostCategories, initialCostEntries, initialAllocationRules, initialAllocationRuleUnitShares, initialCostAllocationResults } from "@/data/costsMockData";

const USER_ID = "e949194f-51db-435c-81f8-771cb0a22062";

const idMap = new Map<string, string>();
const u = (legacy: string | null | undefined): string | null => {
  if (!legacy) return null;
  let v = idMap.get(legacy);
  if (!v) { v = randomUUID(); idMap.set(legacy, v); }
  return v;
};

// Pre-allocate uuids
[
  ...initialProperties, ...initialUnits, ...initialTenants, ...initialLeases,
  ...initialGuarantees, ...initialLeaseUnitAssignments, ...initialAmendments,
  ...initialAmendmentChanges, ...initialReceivableItems, ...initialCashReceipts,
  ...initialAllocations, ...initialTickets, ...initialVendors,
  ...initialCostCategories, ...initialCostEntries, ...initialAllocationRules,
  ...initialAllocationRuleUnitShares, ...initialCostAllocationResults,
].forEach(o => u((o as any).id));

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const lines: string[] = [];
lines.push(`BEGIN;`);
lines.push(`DO $$ DECLARE v_portfolio uuid; BEGIN
  SELECT id INTO v_portfolio FROM public.portfolios WHERE name = 'Demo' LIMIT 1;
  IF v_portfolio IS NULL THEN
    INSERT INTO public.portfolios (name, created_by) VALUES ('Demo', '${USER_ID}'::uuid) RETURNING id INTO v_portfolio;
    INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES (v_portfolio, '${USER_ID}'::uuid, 'owner') ON CONFLICT DO NOTHING;
  END IF;
  PERFORM set_config('seed.portfolio_id', v_portfolio::text, false);
END $$;`);

const P = `current_setting('seed.portfolio_id')::uuid`;

const ins = (table: string, cols: string[], rows: (string | null)[][]) => {
  if (rows.length === 0) return;
  const vals = rows.map(r => `(${r.map(c => c ?? "NULL").join(",")})`).join(",\n");
  lines.push(`INSERT INTO public.${table} (${cols.join(",")}) VALUES\n${vals};`);
};

// properties
ins("properties",
  ["id","portfolio_id","name","reference_code","address1","address2","city","postal_code","region_or_state","country_code","locale","currency_code","measurement_system","property_type","owner_name","description","status","legacy_id","created_at","updated_at"],
  initialProperties.map(p => [
    `'${u(p.id)}'::uuid`, P, esc(p.name), esc(p.referenceCode), esc(p.address1), esc(p.address2), esc(p.city), esc(p.postalCode), esc(p.regionOrState), esc(p.countryCode), esc(p.locale), esc(p.currencyCode), esc(p.measurementSystem), esc(p.propertyType), esc(p.ownerName), esc(p.description), esc(p.status), esc(p.id), esc(p.createdAt+"T00:00:00Z"), esc(p.updatedAt+"T00:00:00Z"),
  ]),
);

// units
ins("units",
  ["id","portfolio_id","property_id","unit_code","unit_label","unit_type","floor","surface_area","bedrooms","bathrooms","furnished","current_status","base_rent","description","rent_tiers","base_charges","available_from","notes","legacy_id","created_at","updated_at"],
  initialUnits.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.propertyId)}'::uuid`, esc(x.unitCode), esc(x.unitLabel), esc(x.unitType),
    esc(x.floor), esc(x.surfaceArea), esc(x.bedrooms), esc(x.bathrooms), esc(x.furnished), esc(x.currentStatus),
    esc(x.baseRent), esc(x.description ?? ""), esc(x.rentTiers), esc(x.baseCharges), esc(x.availableFrom), esc(x.notes), esc(x.id), esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// tenants
ins("tenants",
  ["id","portfolio_id","first_name","last_name","email","phone","date_of_birth","identification_number","current_address","status","notes","legacy_id","created_at","updated_at"],
  initialTenants.map(x => [
    `'${u(x.id)}'::uuid`, P, esc(x.firstName), esc(x.lastName), esc(x.email), esc(x.phone),
    esc(x.dateOfBirth), esc(x.identificationNumber), esc(x.currentAddress), esc(x.status), esc(x.notes), esc(x.id), esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// leases
ins("leases",
  ["id","portfolio_id","property_id","unit_id","primary_tenant_id","lease_reference","co_tenant_ids","lifecycle_stage","start_date","end_date","monthly_rent","monthly_charges","due_day_of_month","deposit_or_guarantee_amount","notice_period_text","signed_date","notes","notice_given","notice_date","intended_move_out_date","termination_reason","move_in_scheduled_date","move_in_actual_date","move_in_meter_reading","move_in_water_meter_reading","move_in_checklist","move_out_scheduled_date","move_out_actual_date","move_out_meter_reading","move_out_water_meter_reading","move_out_checklist","move_out_notes","key_handover_count","key_return_count","return_status","return_notes","rent_formula","has_advance_payment","advance_payment_amount","advance_payment_date","advance_allocation_method","advance_applied_to","advance_allocation_start_date","advance_allocation_duration_months","fixed_monthly_reduction_amount","legacy_id","created_at","updated_at"],
  initialLeases.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.propertyId)}'::uuid`, x.unitId ? `'${u(x.unitId)}'::uuid` : "NULL",
    x.primaryTenantId ? `'${u(x.primaryTenantId)}'::uuid` : "NULL",
    esc(x.leaseReference), esc(x.coTenantIds.map(id => u(id))),
    esc(x.lifecycleStage), esc(x.startDate), esc(x.endDate),
    esc(x.monthlyRent), esc(x.monthlyCharges), esc(x.dueDayOfMonth), esc(x.depositOrGuaranteeAmount),
    esc(x.noticePeriodText), esc(x.signedDate), esc(x.notes), esc(x.noticeGiven), esc(x.noticeDate),
    esc(x.intendedMoveOutDate), esc(x.terminationReason),
    esc(x.moveInScheduledDate), esc(x.moveInActualDate), esc(x.moveInMeterReading), esc(x.moveInWaterMeterReading),
    esc(x.moveInChecklist),
    esc(x.moveOutScheduledDate), esc(x.moveOutActualDate), esc(x.moveOutMeterReading), esc(x.moveOutWaterMeterReading),
    esc(x.moveOutChecklist), esc(x.moveOutNotes),
    esc(x.keyHandoverCount), esc(x.keyReturnCount), esc(x.returnStatus), esc(x.returnNotes),
    esc(x.rentFormula), esc(x.hasAdvancePayment), esc(x.advancePaymentAmount), esc(x.advancePaymentDate),
    esc(x.advanceAllocationMethod), esc(x.advanceAppliedTo), esc(x.advanceAllocationStartDate),
    esc(x.advanceAllocationDurationMonths), esc(x.fixedMonthlyReductionAmount), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// guarantees
ins("guarantees",
  ["id","portfolio_id","lease_id","type","expected_amount","received_amount","status","received_date","release_date","retention_amount","notes","legacy_id"],
  initialGuarantees.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.leaseId)}'::uuid`, esc(x.type),
    esc(x.expectedAmount), esc(x.receivedAmount), esc(x.status), esc(x.receivedDate), esc(x.releaseDate), esc(x.retentionAmount), esc(x.notes), esc(x.id),
  ]),
);

// lease_unit_assignments
ins("lease_unit_assignments",
  ["id","portfolio_id","lease_id","unit_id","assignment_type","is_primary","start_date","end_date","rent_share","charges_share","notes","legacy_id","created_at","updated_at"],
  initialLeaseUnitAssignments.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.leaseId)}'::uuid`, `'${u(x.unitId)}'::uuid`,
    esc(x.assignmentType), esc(x.isPrimary), esc(x.startDate), esc(x.endDate),
    esc(x.rentShare), esc(x.chargesShare), esc(x.notes), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// amendments (no supersedes_amendment_id resolution yet — set null first, update after)
ins("lease_amendments",
  ["id","portfolio_id","lease_id","amendment_number","amendment_type","title","reason","notes","effective_date","signed_date","status","supersedes_amendment_id","legacy_id","created_at","updated_at"],
  initialAmendments.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.leaseId)}'::uuid`,
    esc(x.amendmentNumber), esc(x.amendmentType), esc(x.title), esc(x.reason), esc(x.notes),
    esc(x.effectiveDate), esc(x.signedDate), esc(x.status),
    x.supersedesAmendmentId ? `'${u(x.supersedesAmendmentId)}'::uuid` : "NULL",
    esc(x.id), esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

ins("lease_amendment_changes",
  ["id","portfolio_id","amendment_id","field_name","change_type","old_value","new_value","metadata","legacy_id","created_at","updated_at"],
  initialAmendmentChanges.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.amendmentId)}'::uuid`,
    esc(x.fieldName), esc(x.changeType),
    x.oldValue === null || x.oldValue === undefined ? "NULL" : esc(x.oldValue),
    x.newValue === null || x.newValue === undefined ? "NULL" : esc(x.newValue),
    x.metadata ? esc(x.metadata) : "NULL",
    esc(x.id), esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// vendors
ins("vendors",
  ["id","portfolio_id","vendor_name","trade_category","contact_name","email","phone","address","notes","status","legacy_id"],
  initialVendors.map(x => [
    `'${u(x.id)}'::uuid`, P, esc(x.vendorName), esc(x.tradeCategory), esc(x.contactName),
    esc(x.email), esc(x.phone), esc(x.address), esc(x.notes), esc(x.status), esc(x.id),
  ]),
);

// maintenance_tickets
ins("maintenance_tickets",
  ["id","portfolio_id","property_id","unit_id","tenant_id","assigned_vendor_id","title","description","category","priority","status","created_date","scheduled_date","completed_date","internal_notes","resident_visible_notes","legacy_id"],
  initialTickets.map(x => [
    `'${u(x.id)}'::uuid`, P,
    x.propertyId ? `'${u(x.propertyId)}'::uuid` : "NULL",
    x.unitId ? `'${u(x.unitId)}'::uuid` : "NULL",
    x.tenantId ? `'${u(x.tenantId)}'::uuid` : "NULL",
    x.assignedVendorId ? `'${u(x.assignedVendorId)}'::uuid` : "NULL",
    esc(x.title), esc(x.description), esc(x.category), esc(x.priority), esc(x.status),
    esc(x.createdDate), esc(x.scheduledDate), esc(x.completedDate),
    esc(x.internalNotes), esc(x.residentVisibleNotes), esc(x.id),
  ]),
);

// receivable_items
ins("receivable_items",
  ["id","portfolio_id","lease_id","tenant_id","property_id","unit_id","item_type","label","period_month","due_date","currency_code","expected_amount","allocated_amount","outstanding_amount","status","priority","origin","notes","cycle_index","cycle_end_date","legacy_id","created_at","updated_at"],
  initialReceivableItems.map(x => [
    `'${u(x.id)}'::uuid`, P,
    x.leaseId ? `'${u(x.leaseId)}'::uuid` : "NULL",
    x.tenantId ? `'${u(x.tenantId)}'::uuid` : "NULL",
    x.propertyId ? `'${u(x.propertyId)}'::uuid` : "NULL",
    x.unitId ? `'${u(x.unitId)}'::uuid` : "NULL",
    esc(x.itemType), esc(x.label), esc(x.periodMonth), esc(x.dueDate), esc(x.currencyCode),
    esc(x.expectedAmount), esc(x.allocatedAmount), esc(x.outstandingAmount),
    esc(x.status), esc(x.priority), esc(x.origin), esc(x.notes),
    esc(x.cycleIndex ?? null), esc(x.cycleEndDate ?? null), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// cash_receipts
ins("cash_receipts",
  ["id","portfolio_id","tenant_id","lease_id","property_id","unit_id","source_type","payment_date","booking_date","value_date","amount_received","currency_code","payer_name","payer_iban","payer_bic","reference","remittance_information","end_to_end_reference","status","unmatched_amount","notes","import_batch_id","raw_bank_transaction_id","legacy_id","created_at","updated_at"],
  initialCashReceipts.map(x => [
    `'${u(x.id)}'::uuid`, P,
    x.tenantId ? `'${u(x.tenantId)}'::uuid` : "NULL",
    x.leaseId ? `'${u(x.leaseId)}'::uuid` : "NULL",
    x.propertyId ? `'${u(x.propertyId)}'::uuid` : "NULL",
    x.unitId ? `'${u(x.unitId)}'::uuid` : "NULL",
    esc(x.sourceType), esc(x.paymentDate), esc(x.bookingDate), esc(x.valueDate),
    esc(x.amountReceived), esc(x.currencyCode), esc(x.payerName), esc(x.payerIban), esc(x.payerBic),
    esc(x.reference), esc(x.remittanceInformation), esc(x.endToEndReference),
    esc(x.status), esc(x.unmatchedAmount), esc(x.notes),
    esc(x.importBatchId), esc(x.rawBankTransactionId), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// receipt_allocations
ins("receipt_allocations",
  ["id","portfolio_id","cash_receipt_id","receivable_item_id","allocated_amount","allocation_type","allocation_date","notes","legacy_id","created_at","updated_at"],
  initialAllocations.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.cashReceiptId)}'::uuid`, `'${u(x.receivableItemId)}'::uuid`,
    esc(x.allocatedAmount), esc(x.allocationType), esc(x.allocationDate), esc(x.notes), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// cost_categories
ins("cost_categories",
  ["id","portfolio_id","code","name","nature","scope","recovery_type_default","description","is_active","legacy_id","created_at","updated_at"],
  initialCostCategories.map(x => [
    `'${u(x.id)}'::uuid`, P, esc(x.code), esc(x.name), esc(x.nature), esc(x.scope),
    esc(x.recoveryTypeDefault), esc(x.description), esc(x.isActive), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// allocation_rules
ins("allocation_rules",
  ["id","portfolio_id","property_id","name","method","apply_only_to_occupied_units","include_unavailable_units","notes","legacy_id","created_at","updated_at"],
  initialAllocationRules.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.propertyId)}'::uuid`, esc(x.name), esc(x.method),
    esc(x.applyOnlyToOccupiedUnits), esc(x.includeUnavailableUnits), esc(x.notes), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// cost_entries
ins("cost_entries",
  ["id","portfolio_id","category_id","property_id","unit_id","allocation_rule_id","label","description","frequency","start_date","end_date","amount","currency_code","is_tax","recovery_type","vendor_name","invoice_reference","status","notes","legacy_id","created_at","updated_at"],
  initialCostEntries.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.categoryId)}'::uuid`, `'${u(x.propertyId)}'::uuid`,
    x.unitId ? `'${u(x.unitId)}'::uuid` : "NULL",
    x.allocationRuleId ? `'${u(x.allocationRuleId)}'::uuid` : "NULL",
    esc(x.label), esc(x.description), esc(x.frequency), esc(x.startDate), esc(x.endDate),
    esc(x.amount), esc(x.currencyCode), esc(x.isTax), esc(x.recoveryType),
    esc(x.vendorName), esc(x.invoiceReference), esc(x.status), esc(x.notes), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

// allocation_rule_unit_shares
ins("allocation_rule_unit_shares",
  ["id","portfolio_id","allocation_rule_id","unit_id","percentage_share","fixed_amount_share","coefficient","legacy_id"],
  initialAllocationRuleUnitShares.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.allocationRuleId)}'::uuid`, `'${u(x.unitId)}'::uuid`,
    esc(x.percentageShare), esc(x.fixedAmountShare), esc(x.coefficient), esc(x.id),
  ]),
);

// cost_allocation_results
ins("cost_allocation_results",
  ["id","portfolio_id","cost_entry_id","property_id","unit_id","allocated_amount","recovery_type","recoverable_amount","owner_burden_amount","period_start","period_end","legacy_id","created_at","updated_at"],
  initialCostAllocationResults.map(x => [
    `'${u(x.id)}'::uuid`, P, `'${u(x.costEntryId)}'::uuid`, `'${u(x.propertyId)}'::uuid`, `'${u(x.unitId)}'::uuid`,
    esc(x.allocatedAmount), esc(x.recoveryType), esc(x.recoverableAmount), esc(x.ownerBurdenAmount),
    esc(x.periodStart), esc(x.periodEnd), esc(x.id),
    esc(x.createdAt+"T00:00:00Z"), esc(x.updatedAt+"T00:00:00Z"),
  ]),
);

lines.push(`COMMIT;`);

// Output SQL
process.stdout.write(lines.join("\n") + "\n");
