import { supabase } from "@/integrations/supabase/client";
import { Property, Unit, Tenant, Lease, Guarantee, LeaseUnitAssignment } from "@/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";
import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import type { MaintenanceTicket, Vendor } from "@/types/maintenance";
import type {
  CostCategory, CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult,
} from "@/types/costs";
import type { ChargesReconciliation } from "@/types/chargesReconciliation";

// ===== Case conversion =====
const toSnake = (s: string) =>
  s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const toCamel = (s: string) =>
  s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const SKIP_TO_ROW = new Set(["createdAt", "updatedAt"]);

function toRow<T extends Record<string, any>>(obj: T, portfolioId?: string): Record<string, any> {
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_TO_ROW.has(k)) continue;
    if (v === undefined) continue;
    row[toSnake(k)] = v;
  }
  if (portfolioId && !("portfolio_id" in row)) row.portfolio_id = portfolioId;
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

// ===== Table names =====
export const TABLES = {
  properties: "properties",
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
    properties, units, tenants, leases, guarantees, leaseUnitAssignments,
    amendments, amendmentChanges,
    receivableItems, cashReceipts, allocations,
    tickets, vendors,
    costCategories, costEntries, allocationRules, allocationRuleUnitShares, costAllocationResults,
    chargesReconciliations,
  ] = await Promise.all([
    listAll<Property>(TABLES.properties, portfolioId),
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
  return {
    properties, units, tenants, leases, guarantees, leaseUnitAssignments,
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
  insert<T extends Record<string, any>>(table: SupabaseTable, obj: T, portfolioId: string): void {
    const row = toRow(obj, portfolioId);
    void (supabase as any).from(table).insert(row).then(({ error }: any) => logErr(`insert ${table}`, error));
  },
  insertMany<T extends Record<string, any>>(table: SupabaseTable, objs: T[], portfolioId: string): void {
    if (objs.length === 0) return;
    const rows = objs.map((o) => toRow(o, portfolioId));
    void (supabase as any).from(table).insert(rows).then(({ error }: any) => logErr(`insertMany ${table}`, error));
  },
  upsertMany<T extends Record<string, any>>(table: SupabaseTable, objs: T[], portfolioId: string): void {
    if (objs.length === 0) return;
    const rows = objs.map((o) => toRow(o, portfolioId));
    void (supabase as any).from(table).upsert(rows).then(({ error }: any) => logErr(`upsertMany ${table}`, error));
  },
  update<T extends Record<string, any>>(table: SupabaseTable, id: string, obj: T): void {
    const row = toRow(obj);
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