import type { Lease, LeaseUnitAssignment, Property, Tenant, Unit } from "../types/index.ts";
import type { LeaseAmendment, LeaseAmendmentChange } from "../types/amendments.ts";
import type { ReceivableItem, ReceiptAllocation } from "../types/receivables.ts";
import type { IntegrityState } from "./integrity/types.ts";
import { planAmendmentActivation, type AmendmentActivationResult } from "./amendmentActivationPlan.ts";

export type DatabaseRow = Record<string, unknown>;

function fromRow<T>(row: DatabaseRow): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value,
  ])) as T;
}

function toRow(item: object, portfolioId: string, kind?: "lease" | "amendment"): DatabaseRow {
  const row: DatabaseRow = { portfolio_id: portfolioId };
  for (const [key, value] of Object.entries(item)) {
    if (key === "createdAt" || key === "updatedAt" || value === undefined) continue;
    row[key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] = value;
  }
  if (kind === "lease") {
    const lease = item as Lease;
    row.tenant_ids = lease.tenantIds ?? [lease.primaryTenantId, ...lease.coTenantIds].filter(Boolean);
    row.billing_tenant_id = lease.billingTenantId ?? lease.primaryTenantId;
    if (row.end_date === "") row.end_date = null;
    delete row.primary_tenant_id;
    delete row.co_tenant_ids;
    delete row.unit_id;
  }
  if (kind === "amendment") delete row.amendment_type;
  return row;
}

export interface ServerAmendmentRows {
  properties: DatabaseRow[];
  units: DatabaseRow[];
  tenants: DatabaseRow[];
  leases: DatabaseRow[];
  assignments: DatabaseRow[];
  amendments: DatabaseRow[];
  changes: DatabaseRow[];
  receivables: DatabaseRow[];
  allocations: DatabaseRow[];
}

export function planServerAmendmentActivation(
  id: string,
  rows: ServerAmendmentRows,
  options: { businessDate: string; portfolioId: string; receivableLeadDays: number; genId: (prefix?: string) => string },
): AmendmentActivationResult {
  const assignments = rows.assignments.map(row => fromRow<LeaseUnitAssignment>(row));
  const leases = rows.leases.map(row => {
    const lease = fromRow<Lease>(row);
    const tenantIds = Array.isArray(lease.tenantIds) ? lease.tenantIds : [];
    lease.primaryTenantId = lease.billingTenantId || tenantIds[0] || "";
    lease.coTenantIds = tenantIds.filter(tenantId => tenantId !== lease.primaryTenantId);
    lease.unitId = assignments.find(item => item.leaseId === lease.id)?.unitId ?? "";
    lease.endDate = lease.endDate ?? "";
    return lease;
  });
  const state: IntegrityState = {
    properties: rows.properties.map(row => fromRow<Property>(row)),
    units: rows.units.map(row => fromRow<Unit>(row)),
    tenants: rows.tenants.map(row => fromRow<Tenant>(row)),
    leases,
    guarantees: [],
    leaseUnitAssignments: assignments,
    amendments: rows.amendments.map(row => fromRow<LeaseAmendment>(row)),
    amendmentChanges: rows.changes.map(row => fromRow<LeaseAmendmentChange>(row)),
    receivableItems: rows.receivables.map(row => fromRow<ReceivableItem>(row)),
    cashReceipts: [],
    allocations: rows.allocations.map(row => fromRow<ReceiptAllocation>(row)),
    tickets: [],
    costCategories: [],
    costEntries: [],
    allocationRules: [],
    allocationRuleUnitShares: [],
    costAllocationResults: [],
  };
  return planAmendmentActivation(id, state, {
    businessDate: options.businessDate,
    timestamp: options.businessDate,
    genId: options.genId,
    receivableLeadDays: options.receivableLeadDays,
  });
}

export function toAmendmentActivationRpcArgs(
  id: string,
  portfolioId: string,
  result: AmendmentActivationResult,
): DatabaseRow {
  if (result.ok === false) throw new Error(result.reason);
  const plan = result.plan;
  return {
    p_target_amendment_id: id,
    p_lease: toRow(plan.lease, portfolioId, "lease"),
    p_assignments: plan.changedAssignments.map(({ item, expectedUpdatedAt }) => ({
      ...toRow(item, portfolioId), expected_updated_at: expectedUpdatedAt ?? null,
    })),
    p_amendments: plan.changedAmendments.map(({ item, expectedUpdatedAt }) => ({
      ...toRow(item, portfolioId, "amendment"), expected_updated_at: expectedUpdatedAt,
    })),
    p_removed_receivables: plan.removedReceivables.map(item => ({ id: item.id, expected_updated_at: item.updatedAt })),
    p_new_receivables: plan.freshReceivables.map(item => toRow(item, portfolioId)),
    p_tenants: plan.changedTenants.map(({ item, expectedUpdatedAt }) => ({
      id: item.id, status: item.status, expected_updated_at: expectedUpdatedAt,
    })),
    p_expected_lease_updated_at: plan.originalLeaseUpdatedAt,
  };
}

export function isCompleteAmendmentActivationResponse(args: DatabaseRow, data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const response = data as DatabaseRow;
  const expectedLease = args.p_lease as DatabaseRow;
  if (!response.lease || typeof response.lease !== "object" ||
      (response.lease as DatabaseRow).id !== expectedLease.id) return false;
  const checks: [string, string][] = [
    ["assignments", "p_assignments"],
    ["amendments", "p_amendments"],
    ["receivables", "p_new_receivables"],
    ["removed_receivable_ids", "p_removed_receivables"],
    ["tenants", "p_tenants"],
  ];
  return checks.every(([responseKey, requestKey]) => {
    const returned = response[responseKey];
    const expected = args[requestKey];
    if (!Array.isArray(returned) || !Array.isArray(expected) || returned.length !== expected.length) return false;
    const ids = new Set(returned.map(item => responseKey === "removed_receivable_ids"
      ? String(item)
      : String((item as DatabaseRow)?.id)));
    return ids.size === expected.length && expected.every(item => ids.has(String((item as DatabaseRow).id)));
  });
}
