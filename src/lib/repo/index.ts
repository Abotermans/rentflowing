import { supabase } from "@/integrations/supabase/client";
import { Property, Unit, Tenant, Lease, Guarantee, LeaseUnitAssignment, advanceLeaseLifecycle } from "@/types";
import type { PropertyOwner, PropertyOwnerLink } from "@/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";
import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import type { MaintenanceTicket, Vendor } from "@/types/maintenance";
import type {
  CostCategory, CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult,
} from "@/types/costs";
import type { ChargesReconciliation } from "@/types/chargesReconciliation";
import { isMainLeaseUnit } from "@/lib/leaseAssignments";

// ===== Case conversion =====
const toSnake = (s: string) =>
  s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const toCamel = (s: string) =>
  s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const SKIP_TO_ROW = new Set(["createdAt", "updatedAt"]);

/**
 * Table-scoped legacy fields that exist on the in-memory model as compatibility
 * shims (hydrated at load time) but are NOT real DB columns. They must be
 * stripped from every write payload.
 */
const LEGACY_FIELDS_BY_TABLE: Partial<Record<SupabaseTable, ReadonlySet<string>>> = {
  leases: new Set(["primary_tenant_id", "co_tenant_ids", "unit_id"]),
  lease_amendments: new Set(["amendment_type"]),
};

function toRow<T extends Record<string, any>>(
  obj: T,
  portfolioId?: string,
  table?: SupabaseTable,
): Record<string, any> {
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_TO_ROW.has(k)) continue;
    if (v === undefined) continue;
    row[toSnake(k)] = v;
  }
  if (portfolioId && !("portfolio_id" in row)) row.portfolio_id = portfolioId;
  // Derive new-schema fields from legacy compatibility shims, then drop the
  // legacy columns so we never try to persist them.
  if (table === "leases") {
    if (!("tenant_ids" in row) || row.tenant_ids == null) {
      const tIds = [obj.primaryTenantId, ...(obj.coTenantIds ?? [])].filter(
        (x: unknown): x is string => typeof x === "string" && x.length > 0,
      );
      if (tIds.length > 0) row.tenant_ids = tIds;
    }
    if (!("billing_tenant_id" in row) || row.billing_tenant_id == null) {
      if (obj.primaryTenantId) row.billing_tenant_id = obj.primaryTenantId;
    }
  }
  const legacy = table ? LEGACY_FIELDS_BY_TABLE[table] : undefined;
  if (legacy) for (const k of legacy) delete row[k];
  return row;
}

function fromRow<T = any>(row: Record<string, any>): T {
  const obj: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "legacy_id") continue;
    obj[toCamel(k)] = v;
  }
  return obj as T;
}

/**
 * Hydrate legacy compatibility shims on a loaded Lease row:
 *   primaryTenantId ← billing_tenant_id ?? tenant_ids[0]
 *   coTenantIds     ← tenant_ids minus primaryTenantId
 *   unitId          ← first main-unit assignment, else first assignment
 */
function hydrateLease(lease: Lease, assignments: readonly LeaseUnitAssignment[], units: readonly Unit[]): Lease {
  const tIds: string[] = Array.isArray(lease.tenantIds) ? lease.tenantIds as string[] : [];
  const primaryTenantId: string =
    (lease.billingTenantId as string | undefined) || tIds[0] || "";
  const coTenantIds: string[] = tIds.filter(t => t !== primaryTenantId);
  const my = assignments.filter(a => a.leaseId === lease.id);
  const primaryAssignment =
    my.find(a => isMainLeaseUnit(units.find(u => u.id === a.unitId))) ?? my[0];
  return {
    ...lease,
    tenantIds: tIds,
    billingTenantId: lease.billingTenantId ?? primaryTenantId,
    primaryTenantId,
    coTenantIds,
    unitId: primaryAssignment?.unitId ?? "",
  };
}

// ===== Table names =====
export const TABLES = {
  properties: "properties",
  propertyOwners: "property_owners",
  propertyOwnerLinks: "property_owner_links",
  units: "units",
  tenants: "tenants",
  leases: "leases",
  guarantees: "guarantees",
  leaseUnitAssignments: "lease_unit_assignments",
  amendments: "lease_amendments",
  amendmentChanges: "lease_amendment_changes",
  receivableItems: "receivable_items",
  cashReceipts: "cash_receipts",
  allocations: "receipt_allocations",
  tickets: "maintenance_tickets",
  vendors: "vendors",
  costCategories: "cost_categories",
  costEntries: "cost_entries",
  allocationRules: "allocation_rules",
  allocationRuleUnitShares: "allocation_rule_unit_shares",
  costAllocationResults: "cost_allocation_results",
  chargesReconciliations: "charges_reconciliations",
} as const;

export type TableKey = keyof typeof TABLES;
export type SupabaseTable = (typeof TABLES)[TableKey];

// ===== Snapshot =====
export interface PortfolioSnapshot {
  properties: Property[];
  propertyOwners: PropertyOwner[];
  propertyOwnerLinks: PropertyOwnerLink[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  guarantees: Guarantee[];
  leaseUnitAssignments: LeaseUnitAssignment[];
  amendments: LeaseAmendment[];
  amendmentChanges: LeaseAmendmentChange[];
  receivableItems: ReceivableItem[];
  cashReceipts: CashReceipt[];
  allocations: ReceiptAllocation[];
  tickets: MaintenanceTicket[];
  vendors: Vendor[];
  costCategories: CostCategory[];
  costEntries: CostEntry[];
  allocationRules: AllocationRule[];
  allocationRuleUnitShares: AllocationRuleUnitShare[];
  costAllocationResults: CostAllocationResult[];
  chargesReconciliations: ChargesReconciliation[];
}

async function listAll<T>(table: SupabaseTable, portfolioId: string): Promise<T[]> {
  const { data, error } = await (supabase as any)
    .from(table)
    .select("*")
    .eq("portfolio_id", portfolioId);
  if (error) {
    console.error(`[repo] list ${table} failed:`, error);
    return [];
  }
  return (data ?? []).map((r: any) => fromRow<T>(r));
}

export async function loadPortfolio(portfolioId: string): Promise<PortfolioSnapshot> {
  const [
    properties, propertyOwners, propertyOwnerLinks, units, tenants, leases, guarantees, leaseUnitAssignments,
    amendments, amendmentChanges,
    receivableItems, cashReceipts, allocations,
    tickets, vendors,
    costCategories, costEntries, allocationRules, allocationRuleUnitShares, costAllocationResults,
    chargesReconciliations,
  ] = await Promise.all([
    listAll<Property>(TABLES.properties, portfolioId),
    listAll<PropertyOwner>(TABLES.propertyOwners, portfolioId),
    listAll<PropertyOwnerLink>(TABLES.propertyOwnerLinks, portfolioId),
    listAll<Unit>(TABLES.units, portfolioId),
    listAll<Tenant>(TABLES.tenants, portfolioId),
    listAll<Lease>(TABLES.leases, portfolioId),
    listAll<Guarantee>(TABLES.guarantees, portfolioId),
    listAll<LeaseUnitAssignment>(TABLES.leaseUnitAssignments, portfolioId),
    listAll<LeaseAmendment>(TABLES.amendments, portfolioId),
    listAll<LeaseAmendmentChange>(TABLES.amendmentChanges, portfolioId),
    listAll<ReceivableItem>(TABLES.receivableItems, portfolioId),
    listAll<CashReceipt>(TABLES.cashReceipts, portfolioId),
    listAll<ReceiptAllocation>(TABLES.allocations, portfolioId),
    listAll<MaintenanceTicket>(TABLES.tickets, portfolioId),
    listAll<Vendor>(TABLES.vendors, portfolioId),
    listAll<CostCategory>(TABLES.costCategories, portfolioId),
    listAll<CostEntry>(TABLES.costEntries, portfolioId),
    listAll<AllocationRule>(TABLES.allocationRules, portfolioId),
    listAll<AllocationRuleUnitShare>(TABLES.allocationRuleUnitShares, portfolioId),
    listAll<CostAllocationResult>(TABLES.costAllocationResults, portfolioId),
    listAll<ChargesReconciliation>(TABLES.chargesReconciliations, portfolioId),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const hydratedLeases = leases.map(l => advanceLeaseLifecycle(hydrateLease(l, leaseUnitAssignments, units), today));
  return {
    properties, propertyOwners, propertyOwnerLinks, units, tenants,
    leases: hydratedLeases,
    guarantees,
    leaseUnitAssignments,
    amendments, amendmentChanges,
    receivableItems, cashReceipts, allocations,
    tickets, vendors,
    costCategories, costEntries, allocationRules, allocationRuleUnitShares, costAllocationResults,
    chargesReconciliations,
  };
}

// ===== Mirror writes (fire-and-forget with console.error) =====
function logErr(label: string, err: any) {
  if (err) console.error(`[repo] ${label} failed:`, err);
}

export const mirror = {
  async insertAsync<T extends Record<string, any>>(table: SupabaseTable, obj: T, portfolioId: string): Promise<any | null> {
    const row = toRow(obj, portfolioId, table);
    const { error } = await (supabase as any).from(table).insert(row);
    logErr(`insert ${table}`, error);
    return error ?? null;
  },
  async insertManyAsync<T extends Record<string, any>>(table: SupabaseTable, objs: T[], portfolioId: string): Promise<any | null> {
    if (objs.length === 0) return null;
    const rows = objs.map((o) => toRow(o, portfolioId, table));
    const { error } = await (supabase as any).from(table).insert(rows);
    logErr(`insertMany ${table}`, error);
    return error ?? null;
  },
  async upsertManyAsync<T extends Record<string, any>>(table: SupabaseTable, objs: T[], portfolioId: string): Promise<any | null> {
    if (objs.length === 0) return null;
    const rows = objs.map((o) => toRow(o, portfolioId, table));
    const { error } = await (supabase as any).from(table).upsert(rows);
    logErr(`upsertMany ${table}`, error);
    return error ?? null;
  },
  async updateAsync<T extends Record<string, any>>(table: SupabaseTable, id: string, obj: T): Promise<any | null> {
    const row = toRow(obj, undefined, table);
    delete row.id;
    delete row.portfolio_id;
    const { error } = await (supabase as any).from(table).update(row).eq("id", id);
    logErr(`update ${table}`, error);
    return error ?? null;
  },
  async removeAsync(table: SupabaseTable, id: string): Promise<any | null> {
    const { error } = await (supabase as any).from(table).delete().eq("id", id);
    logErr(`delete ${table}`, error);
    return error ?? null;
  },
  async removeWhereAsync(table: SupabaseTable, column: string, value: string): Promise<any | null> {
    const { error } = await (supabase as any).from(table).delete().eq(column, value);
    logErr(`delete ${table} where ${column}`, error);
    return error ?? null;
  },
  insert<T extends Record<string, any>>(table: SupabaseTable, obj: T, portfolioId: string): void {
    const row = toRow(obj, portfolioId, table);
    void (supabase as any).from(table).insert(row).then(({ error }: any) => logErr(`insert ${table}`, error));
  },
  insertMany<T extends Record<string, any>>(table: SupabaseTable, objs: T[], portfolioId: string): void {
    if (objs.length === 0) return;
    const rows = objs.map((o) => toRow(o, portfolioId, table));
    void (supabase as any).from(table).insert(rows).then(({ error }: any) => logErr(`insertMany ${table}`, error));
  },
  upsertMany<T extends Record<string, any>>(table: SupabaseTable, objs: T[], portfolioId: string): void {
    if (objs.length === 0) return;
    const rows = objs.map((o) => toRow(o, portfolioId, table));
    void (supabase as any).from(table).upsert(rows).then(({ error }: any) => logErr(`upsertMany ${table}`, error));
  },
  update<T extends Record<string, any>>(table: SupabaseTable, id: string, obj: T): void {
    const row = toRow(obj, undefined, table);
    delete row.id;
    delete row.portfolio_id;
    void (supabase as any).from(table).update(row).eq("id", id).then(({ error }: any) => logErr(`update ${table}`, error));
  },
  remove(table: SupabaseTable, id: string): void {
    void (supabase as any).from(table).delete().eq("id", id).then(({ error }: any) => logErr(`delete ${table}`, error));
  },
  removeWhere(table: SupabaseTable, column: string, value: string): void {
    void (supabase as any).from(table).delete().eq(column, value).then(({ error }: any) => logErr(`delete ${table} where ${column}`, error));
  },
};

export const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36));
