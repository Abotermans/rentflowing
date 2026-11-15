import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";

type RepositoryError = { message: string; code?: string; details?: string; hint?: string };
type RepositoryResponse<T> = { data: T | null; error: RepositoryError | null };

interface RepositoryQuery<T> extends PromiseLike<RepositoryResponse<T>> {
  eq(column: string, value: string): RepositoryQuery<T>;
  in(column: string, values: string[]): RepositoryQuery<T>;
  order(column: string, options: { ascending: boolean }): RepositoryQuery<T>;
  range(from: number, to: number): RepositoryQuery<T>;
  select(columns: string): RepositoryQuery<Record<string, unknown>[]>;
}

interface RepositoryTableQuery {
  select(columns: string): RepositoryQuery<Record<string, unknown>[]>;
  insert(row: Record<string, unknown> | Record<string, unknown>[]): RepositoryQuery<unknown>;
  upsert(rows: Record<string, unknown>[]): RepositoryQuery<unknown>;
  update(row: Record<string, unknown>): RepositoryQuery<unknown>;
  delete(): RepositoryQuery<unknown>;
}

// All tables in TABLES share these PostgREST operations; their row shapes are
// converted at this boundary before the typed domain models are hydrated.
const repositoryClient = supabase as unknown as { from(table: string): RepositoryTableQuery };

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

function toRow(
  obj: object,
  portfolioId?: string,
  table?: SupabaseTable,
): Record<string, Json | undefined> {
  const fields = obj as Record<string, unknown>;
  const row: Record<string, Json | undefined> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_TO_ROW.has(k)) continue;
    if (v === undefined) continue;
    row[toSnake(k)] = v as Json;
  }
  if (portfolioId && !("portfolio_id" in row)) row.portfolio_id = portfolioId;
  // Derive new-schema fields from legacy compatibility shims, then drop the
  // legacy columns so we never try to persist them.
  if (table === "leases") {
    if (row.end_date === "") row.end_date = null;
    if (!("tenant_ids" in row) || row.tenant_ids == null) {
      const tIds = [fields.primaryTenantId, ...(Array.isArray(fields.coTenantIds) ? fields.coTenantIds : [])].filter(
        (x: unknown): x is string => typeof x === "string" && x.length > 0,
      );
      if (tIds.length > 0) row.tenant_ids = tIds;
    }
    if (!("billing_tenant_id" in row) || row.billing_tenant_id == null) {
      if (typeof fields.primaryTenantId === "string" && fields.primaryTenantId) row.billing_tenant_id = fields.primaryTenantId;
    }
  }
  const legacy = table ? LEGACY_FIELDS_BY_TABLE[table] : undefined;
  if (legacy) for (const k of legacy) delete row[k];
  return row;
}

function fromRow<T>(row: Record<string, unknown>): T {
  const obj: Record<string, unknown> = {};
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
    endDate: lease.endDate ?? "",
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
  const pageSize = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await repositoryClient
      .from(table)
      .select("*")
      .eq("portfolio_id", portfolioId)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(`Unable to load ${table}: ${error.message ?? "Unknown database error"}`);
    }
    const page = data ?? [];
    rows.push(...page.map(r => fromRow<T>(r)));
    if (page.length < pageSize) return rows;
  }
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
  const propertyById = new Map(properties.map(property => [property.id, property]));
  const hydratedLeases = leases.map(l => advanceLeaseLifecycle(
    hydrateLease(l, leaseUnitAssignments, units),
    propertyBusinessDateISO(propertyById.get(l.propertyId)),
  ));
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

// ===== Mirror writes =====
function logErr(label: string, err: RepositoryError | null) {
  if (err) console.error(`[repo] ${label} failed (${err.code ?? "unknown"}): ${err.message ?? String(err)}`, err);
}

function isMissingPartialOwnershipColumn(error: RepositoryError | null): boolean {
  return (error?.code === "42703" || error?.code === "PGRST204")
    && typeof error.message === "string"
    && error.message.includes("is_partially_owned");
}

async function writePropertyWithLegacyFallback<T>(
  row: Record<string, unknown>,
  write: (value: Record<string, unknown>) => PromiseLike<RepositoryResponse<T>>,
): Promise<RepositoryResponse<T>> {
  const response = await write(row);
  if (!isMissingPartialOwnershipColumn(response.error)) return response;
  if (row.is_partially_owned) {
    return { data: null, error: new Error("Partial ownership cannot be saved until the partial property ownership database migration is applied.") };
  }
  const { is_partially_owned: _unsupported, ...legacyRow } = row;
  return write(legacyRow);
}

const INDEXATION_COLUMNS = [
  "indexation_enabled", "indexation_frequency", "indexation_base_date",
  "indexation_base_index", "indexation_current_index", "indexation_cap_percent",
  "indexation_rounding_mode", "indexation_notes",
] as const;

async function writeLeaseWithLegacyFallback<T>(
  row: Record<string, unknown>,
  write: (value: Record<string, unknown>) => PromiseLike<RepositoryResponse<T>>,
): Promise<RepositoryResponse<T>> {
  const explainMissingEndDateMigration = (response: RepositoryResponse<T>): RepositoryResponse<T> => {
    if (row.end_date === null && response.error?.code === "23502" && response.error.message?.includes("end_date")) {
      return { data: null, error: new Error("Open-ended leases cannot be saved until the nullable lease end-date database migration is applied.") };
    }
    return response;
  };
  const response = await write(row);
  if (response.error?.code === "23502") return explainMissingEndDateMigration(response);
  const missingIndexationColumn = (response.error?.code === "42703" || response.error?.code === "PGRST204")
    && INDEXATION_COLUMNS.some(column => response.error?.message?.includes(column));
  if (!missingIndexationColumn) return response;
  if (row.indexation_enabled) {
    return { data: null, error: new Error("Lease indexation cannot be saved until the lease indexation database migration is applied.") };
  }
  const legacyRow = { ...row };
  for (const column of INDEXATION_COLUMNS) delete legacyRow[column];
  return explainMissingEndDateMigration(await write(legacyRow));
}

export const mirror = {
  async insertReturningAsync<T>(table: SupabaseTable, obj: object, portfolioId: string): Promise<T> {
    const id = (obj as { id?: unknown }).id;
    if (typeof id !== "string" || !id) throw new Error(`Cannot insert ${table} without an id.`);
    const row = toRow(obj, portfolioId, table);
    const response = await repositoryClient.from(table).insert(row).select("*");
    const error = response.error ?? (!confirmsRows(response.data, [id], item => item.portfolio_id === portfolioId)
      ? new Error(`No ${table} row was inserted.`)
      : null);
    if (error) {
      logErr(`insert ${table}`, error);
      throw new Error(error.message);
    }
    return fromRow<T>(response.data![0]);
  },
  async insertAsync(table: SupabaseTable, obj: object, portfolioId: string): Promise<RepositoryError | null> {
    const row = toRow(obj, portfolioId, table);
    const response = table === TABLES.properties
      ? await writePropertyWithLegacyFallback(row, (value) => repositoryClient.from(table).insert(value))
      : table === TABLES.leases
        ? await writeLeaseWithLegacyFallback(row, (value) => repositoryClient.from(table).insert(value))
      : await repositoryClient.from(table).insert(row);
    const error = response.error;
    logErr(`insert ${table}`, error);
    return error ?? null;
  },
  async insertManyAsync<T extends object>(table: SupabaseTable, objs: T[], portfolioId: string): Promise<RepositoryError | null> {
    if (objs.length === 0) return null;
    const rows = objs.map((o) => toRow(o, portfolioId, table));
    const { error } = await repositoryClient.from(table).insert(rows);
    logErr(`insertMany ${table}`, error);
    return error ?? null;
  },
  async upsertManyAsync<T extends object>(table: SupabaseTable, objs: T[], portfolioId: string): Promise<RepositoryError | null> {
    if (objs.length === 0) return null;
    const rows = objs.map((o) => toRow(o, portfolioId, table));
    const { error } = await repositoryClient.from(table).upsert(rows);
    logErr(`upsertMany ${table}`, error);
    return error ?? null;
  },
  async updateAsync(table: SupabaseTable, id: string, obj: object): Promise<RepositoryError | null> {
    const row = toRow(obj, undefined, table);
    delete row.id;
    delete row.portfolio_id;
    const response = table === TABLES.properties
      ? await writePropertyWithLegacyFallback(row, (value) => repositoryClient.from(table).update(value).eq("id", id).select("id"))
      : table === TABLES.leases
        ? await writeLeaseWithLegacyFallback(row, (value) => repositoryClient.from(table).update(value).eq("id", id).select("id"))
      : await repositoryClient.from(table).update(row).eq("id", id).select("id");
    const error = response.error ?? (!confirmsRows(response.data, [id], () => true)
      ? new Error(`No ${table} row was updated for id ${id}.`)
      : null);
    logErr(`update ${table}`, error);
    return error ?? null;
  },
  async updateReturningAsync<T>(table: SupabaseTable, id: string, obj: object, expectedUpdatedAt?: string): Promise<T> {
    const row = toRow(obj, undefined, table);
    delete row.id;
    delete row.portfolio_id;
    let query = repositoryClient.from(table).update(row).eq("id", id);
    if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
    const response = await query.select("*");
    const error = response.error ?? (!confirmsRows(response.data, [id], () => true)
      ? new Error(`No ${table} row was updated for id ${id}. Reload and retry.`)
      : null);
    if (error) {
      logErr(`update ${table}`, error);
      throw new Error(error.message);
    }
    return fromRow<T>(response.data![0]);
  },
  async removeAsync(table: SupabaseTable, id: string): Promise<RepositoryError | null> {
    const response = await repositoryClient.from(table).delete().eq("id", id).select("id");
    const error = response.error ?? (!confirmsRows(response.data, [id], () => true)
      ? new Error(`No ${table} row was deleted for id ${id}.`)
      : null);
    logErr(`delete ${table}`, error);
    return error ?? null;
  },
  async removeManyAsync(table: SupabaseTable, ids: string[]): Promise<RepositoryError | null> {
    if (ids.length === 0) return null;
    const response = await repositoryClient.from(table).delete().in("id", ids).select("id");
    const returnedCount = Array.isArray(response.data) ? response.data.length : 0;
    const error = response.error ?? (!confirmsRows(response.data, ids, () => true)
      ? new Error(returnedCount !== ids.length
        ? `Only ${returnedCount} of ${ids.length} ${table} rows were deleted.`
        : `The database confirmed different ${table} deletions. Reload before retrying.`)
      : null);
    logErr(`deleteMany ${table}`, error);
    return error ?? null;
  },
  async removeWhereAsync(table: SupabaseTable, column: string, value: string, expectedCount?: number): Promise<RepositoryError | null> {
    const response = await repositoryClient.from(table).delete().eq(column, value).select("id");
    const error = response.error ?? (expectedCount !== undefined && (!Array.isArray(response.data) || response.data.length !== expectedCount)
      ? new Error(`Only ${Array.isArray(response.data) ? response.data.length : 0} of ${expectedCount} ${table} rows were deleted.`)
      : null);
    logErr(`delete ${table} where ${column}`, error);
    return error ?? null;
  },
};

export async function saveCostEntryWithAllocations(
  entry: CostEntry,
  allocations: CostAllocationResult[],
  portfolioId: string,
  expectedUpdatedAt?: string,
): Promise<{ entry: CostEntry; allocations: CostAllocationResult[] }> {
  const { data, error } = await supabase.rpc("client_save_cost_entry_with_allocations", {
    p_entry: toRow(entry, portfolioId, TABLES.costEntries),
    p_allocations: allocations.map(row => toRow(row, portfolioId, TABLES.costAllocationResults)),
    p_expected_updated_at: expectedUpdatedAt ?? null,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Cost entries cannot be saved until the atomic cost allocation database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !("entry" in data) || !("allocations" in data) ||
      !data.entry || typeof data.entry !== "object" || Array.isArray(data.entry) ||
      !Array.isArray(data.allocations) || data.entry.id !== entry.id ||
      data.allocations.length !== allocations.length) {
    throw new Error("The database did not confirm the cost entry and its allocations.");
  }
  const expectedIds = new Set(allocations.map(row => row.id));
  if (expectedIds.size !== allocations.length ||
      new Set(data.allocations.map(row => row && typeof row === "object" && !Array.isArray(row) ? row.id : null)).size !== expectedIds.size ||
      data.allocations.some(row => !row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.id !== "string" || !expectedIds.has(row.id) || row.cost_entry_id !== entry.id)) {
    throw new Error("The database confirmed different cost allocations. Reload costs before retrying.");
  }
  return {
    entry: fromRow<CostEntry>(data.entry as Record<string, unknown>),
    allocations: data.allocations.map(row => fromRow<CostAllocationResult>(row as Record<string, unknown>)),
  };
}

function confirmsTenantStatuses(
  rows: unknown,
  expected: readonly Pick<Tenant, "id" | "status">[],
  portfolioId: string,
): boolean {
  if (!Array.isArray(rows) || rows.length !== expected.length) return false;
  const expectedById = new Map(expected.map(tenant => [tenant.id, tenant.status]));
  if (expectedById.size !== expected.length) return false;
  const seen = new Set<string>();
  return rows.every(row => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.id !== "string" || seen.has(row.id) ||
        !expectedById.has(row.id) || row.status !== expectedById.get(row.id) ||
        row.portfolio_id !== portfolioId) return false;
    seen.add(row.id);
    return true;
  });
}

function confirmsRows(
  rows: unknown,
  expectedIds: readonly string[],
  matches: (row: Record<string, unknown>) => boolean,
): rows is Record<string, unknown>[] {
  if (!Array.isArray(rows) || rows.length !== expectedIds.length) return false;
  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length) return false;
  const seen = new Set<string>();
  return rows.every(row => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.id !== "string" || !expected.has(row.id) || seen.has(row.id) ||
        !matches(row)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function createLeaseWithSchedule(
  lease: Lease,
  assignments: LeaseUnitAssignment[],
  receivables: ReceivableItem[],
  tenantStatuses: { tenant: Tenant; expectedUpdatedAt: string }[],
  portfolioId: string,
): Promise<{ lease: Lease; assignments: LeaseUnitAssignment[]; receivables: ReceivableItem[]; tenants: Tenant[] }> {
  const { data, error } = await supabase.rpc("client_create_lease_with_schedule", {
    p_lease: toRow(lease, portfolioId, TABLES.leases),
    p_assignments: assignments.map(row => toRow(row, portfolioId, TABLES.leaseUnitAssignments)),
    p_receivables: receivables.map(row => toRow(row, portfolioId, TABLES.receivableItems)),
    p_tenants: tenantStatuses.map(({ tenant, expectedUpdatedAt }) => ({
      id: tenant.id, status: tenant.status, expected_updated_at: expectedUpdatedAt,
    })),
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Leases cannot be created until the atomic lease creation database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.lease || typeof data.lease !== "object" || Array.isArray(data.lease) ||
      data.lease.id !== lease.id || data.lease.portfolio_id !== portfolioId ||
      !Array.isArray(data.assignments) || !Array.isArray(data.receivables) || !Array.isArray(data.tenants) ||
      data.assignments.length !== assignments.length ||
      data.receivables.length !== receivables.length ||
      !confirmsTenantStatuses(data.tenants, tenantStatuses.map(({ tenant }) => tenant), portfolioId)) {
    throw new Error("The database did not confirm the lease and all its child rows. Reload before retrying.");
  }
  const assignmentIds = new Set(assignments.map(item => item.id));
  const receivableIds = new Set(receivables.map(item => item.id));
  if (assignmentIds.size !== assignments.length ||
      receivableIds.size !== receivables.length ||
      new Set(data.assignments.map(item => item && typeof item === "object" && !Array.isArray(item) ? item.id : null)).size !== assignmentIds.size ||
      data.assignments.some(item => !item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.id !== "string" || !assignmentIds.has(item.id) ||
        item.lease_id !== lease.id || item.portfolio_id !== portfolioId) ||
      new Set(data.receivables.map(item => item && typeof item === "object" && !Array.isArray(item) ? item.id : null)).size !== receivableIds.size ||
      data.receivables.some(item => !item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.id !== "string" || !receivableIds.has(item.id) ||
        item.lease_id !== lease.id || item.property_id !== lease.propertyId || item.portfolio_id !== portfolioId)) {
    throw new Error("The database confirmed different lease rows. Reload before retrying.");
  }
  return {
    lease: { ...lease, ...fromRow<Lease>(data.lease as Record<string, unknown>) },
    assignments: data.assignments.map(row => fromRow<LeaseUnitAssignment>(row as Record<string, unknown>)),
    receivables: data.receivables.map(row => fromRow<ReceivableItem>(row as Record<string, unknown>)),
    tenants: data.tenants.map(row => fromRow<Tenant>(row as Record<string, unknown>)),
  };
}

export async function saveLeaseWithTenantStatuses(
  lease: Lease,
  tenants: { item: Tenant; expectedUpdatedAt: string }[],
  portfolioId: string,
  expectedLeaseUpdatedAt: string,
  statusReason: string | null = null,
  statusNotes: string | null = null,
): Promise<{ lease: Lease; tenants: Tenant[] }> {
  const { data, error } = await supabase.rpc("client_save_lease_metadata", {
    p_lease: toRow(lease, portfolioId, TABLES.leases),
    p_tenants: tenants.map(({ item, expectedUpdatedAt }) => ({
      id: item.id, status: item.status, expected_updated_at: expectedUpdatedAt,
    })),
    p_expected_updated_at: expectedLeaseUpdatedAt,
    p_status_reason: statusReason,
    p_status_notes: statusNotes,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Lease metadata cannot be edited until the restricted lease metadata database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.lease || typeof data.lease !== "object" || Array.isArray(data.lease) ||
      data.lease.id !== lease.id || data.lease.portfolio_id !== portfolioId ||
      !Array.isArray(data.tenants) ||
      !confirmsTenantStatuses(data.tenants, tenants.map(({ item }) => item), portfolioId)) {
    throw new Error("The database did not confirm the lease and tenant statuses. Reload before retrying.");
  }
  return {
    lease: { ...lease, ...fromRow<Lease>(data.lease as Record<string, unknown>) },
    tenants: data.tenants.map(row => fromRow<Tenant>(row as Record<string, unknown>)),
  };
}

export async function saveLeaseWithAssignments(
  lease: Lease,
  tenants: { item: Tenant; expectedUpdatedAt: string }[],
  expectedAssignments: readonly LeaseUnitAssignment[],
  assignments: readonly LeaseUnitAssignment[],
  portfolioId: string,
  expectedLeaseUpdatedAt: string,
  schedule: {
    fromDate: string;
    expected: readonly ReceivableItem[];
    removed: readonly ReceivableItem[];
    fresh: readonly ReceivableItem[];
  } | null = null,
): Promise<{ lease: Lease; tenants: Tenant[]; assignments: LeaseUnitAssignment[]; receivables: ReceivableItem[]; removedReceivableIds: string[] }> {
  const { data, error } = await supabase.rpc("client_save_lease_with_assignments", {
    p_lease: toRow(lease, portfolioId, TABLES.leases),
    p_tenants: tenants.map(({ item, expectedUpdatedAt }) => ({
      id: item.id, status: item.status, expected_updated_at: expectedUpdatedAt,
    })),
    p_expected_updated_at: expectedLeaseUpdatedAt,
    p_expected_assignments: expectedAssignments.map(item => ({
      id: item.id, updated_at: item.updatedAt,
    })),
    p_assignments: assignments.map(item => toRow(item, portfolioId, TABLES.leaseUnitAssignments)),
    p_schedule_from: schedule?.fromDate ?? null,
    p_expected_receivables: schedule?.expected.map(item => ({ id: item.id, updated_at: item.updatedAt })) ?? [],
    p_removed_receivables: schedule?.removed.map(item => ({ id: item.id, expected_updated_at: item.updatedAt })) ?? [],
    p_new_receivables: schedule?.fresh.map(item => toRow(item, portfolioId, TABLES.receivableItems)) ?? [],
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Leases and units cannot be edited until the secured lease-assignment database migration is applied.");
    }
    throw error;
  }
  const expectedIds = new Set(assignments.map(item => item.id));
  const returnedAssignments = data && typeof data === "object" && !Array.isArray(data)
    && Array.isArray(data.assignments) ? data.assignments : null;
  const returnedIds = new Set(returnedAssignments
    ? returnedAssignments.map(item => item && typeof item === "object" && !Array.isArray(item) ? item.id : null)
    : []);
  const expectedReceivableIds = new Set(schedule?.fresh.map(item => item.id) ?? []);
  const expectedRemovedIds = new Set(schedule?.removed.map(item => item.id) ?? []);
  const returnedReceivables = data && typeof data === "object" && !Array.isArray(data)
    && Array.isArray(data.receivables) ? data.receivables : null;
  const returnedRemovedIds = data && typeof data === "object" && !Array.isArray(data)
    && Array.isArray(data.removed_receivable_ids) ? data.removed_receivable_ids : null;
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.lease || typeof data.lease !== "object" || Array.isArray(data.lease) ||
      data.lease.id !== lease.id || data.lease.portfolio_id !== portfolioId ||
      !Array.isArray(data.tenants) ||
      !confirmsTenantStatuses(data.tenants, tenants.map(({ item }) => item), portfolioId) ||
      !returnedAssignments || returnedAssignments.length !== expectedIds.size ||
      returnedIds.size !== expectedIds.size ||
      returnedAssignments.some(item => !item || typeof item !== "object" || Array.isArray(item) ||
        item.lease_id !== lease.id || item.portfolio_id !== portfolioId ||
        typeof item.id !== "string" || !expectedIds.has(item.id)) ||
      !returnedReceivables || returnedReceivables.length !== expectedReceivableIds.size ||
      new Set(returnedReceivables.map(item => item && typeof item === "object" && !Array.isArray(item)
        ? item.id : null)).size !== expectedReceivableIds.size ||
      returnedReceivables.some(item => !item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.id !== "string" || !expectedReceivableIds.has(item.id) ||
        item.lease_id !== lease.id || item.portfolio_id !== portfolioId) ||
      !returnedRemovedIds || returnedRemovedIds.length !== expectedRemovedIds.size ||
      new Set(returnedRemovedIds).size !== expectedRemovedIds.size ||
      returnedRemovedIds.some(item => typeof item !== "string" || !expectedRemovedIds.has(item))) {
    throw new Error("The database did not confirm the lease and all unit assignments. Reload before retrying.");
  }
  return {
    lease: { ...lease, ...fromRow<Lease>(data.lease as Record<string, unknown>) },
    tenants: data.tenants.map(item => fromRow<Tenant>(item as Record<string, unknown>)),
    assignments: returnedAssignments.map(item => fromRow<LeaseUnitAssignment>(item as Record<string, unknown>)),
    receivables: returnedReceivables.map(item => fromRow<ReceivableItem>(item as Record<string, unknown>)),
    removedReceivableIds: returnedRemovedIds as string[],
  };
}

export async function closeLeaseAtomically(
  lease: Lease,
  portfolioId: string,
  expectedUpdatedAt: string,
  vacancyDate: string,
  freeUnits: boolean,
  reason: string | null,
  notes: string | null,
): Promise<{ lease: Lease; assignments: LeaseUnitAssignment[]; amendments: LeaseAmendment[]; units: Unit[]; tenants: Tenant[] }> {
  const { data, error } = await supabase.rpc("client_close_lease_atomically", {
    p_lease: toRow(lease, portfolioId, TABLES.leases),
    p_expected_updated_at: expectedUpdatedAt,
    p_vacancy_date: vacancyDate,
    p_free_units: freeUnits,
    p_reason: reason,
    p_notes: notes,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Leases cannot be closed until the atomic lease closure database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.lease || typeof data.lease !== "object" || Array.isArray(data.lease) ||
      !Array.isArray(data.assignments) || !Array.isArray(data.amendments) ||
      !Array.isArray(data.units) || !Array.isArray(data.tenants)) {
    throw new Error("The database did not confirm the lease closure. Reload before retrying.");
  }
  return {
    lease: { ...lease, ...fromRow<Lease>(data.lease as Record<string, unknown>) },
    assignments: data.assignments.map(row => fromRow<LeaseUnitAssignment>(row as Record<string, unknown>)),
    amendments: data.amendments.map(row => fromRow<LeaseAmendment>(row as Record<string, unknown>)),
    units: data.units.map(row => fromRow<Unit>(row as Record<string, unknown>)),
    tenants: data.tenants.map(row => fromRow<Tenant>(row as Record<string, unknown>)),
  };
}

export async function deleteLeaseAtomically(
  leaseId: string,
  portfolioId: string,
  expectedUpdatedAt: string,
): Promise<Tenant[]> {
  const { data, error } = await supabase.rpc("delete_lease_atomically", {
    p_lease_id: leaseId,
    p_portfolio_id: portfolioId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Leases cannot be deleted until the atomic lease deletion database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.lease_id !== leaseId || !Array.isArray(data.tenants)) {
    throw new Error("The database did not confirm the lease deletion. Reload before retrying.");
  }
  return data.tenants.map(row => fromRow<Tenant>(row as Record<string, unknown>));
}

export async function deleteDraftAmendment(
  amendment: LeaseAmendment,
  portfolioId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("delete_draft_amendment", {
    p_amendment_id: amendment.id,
    p_portfolio_id: portfolioId,
    p_expected_updated_at: amendment.updatedAt,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Draft amendments cannot be deleted until the amendment deletion database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.amendment_id !== amendment.id) {
    throw new Error("The database did not confirm amendment deletion. Reload before retrying.");
  }
}

export async function saveAllocationRuleWithShares(
  rule: AllocationRule,
  shares: AllocationRuleUnitShare[],
  portfolioId: string,
  expectedUpdatedAt?: string,
): Promise<{ rule: AllocationRule; shares: AllocationRuleUnitShare[] }> {
  const { data, error } = await supabase.rpc("client_save_allocation_rule_with_shares", {
    p_rule: toRow(rule, portfolioId, TABLES.allocationRules),
    p_shares: shares.map(row => toRow(row, portfolioId, TABLES.allocationRuleUnitShares)),
    p_expected_updated_at: expectedUpdatedAt ?? null,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Allocation rules cannot be saved until the atomic rule-share database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.rule || typeof data.rule !== "object" || Array.isArray(data.rule) ||
      data.rule.id !== rule.id || data.rule.portfolio_id !== portfolioId ||
      !confirmsRows(data.shares, shares.map(item => item.id), row =>
        row.allocation_rule_id === rule.id && row.portfolio_id === portfolioId)) {
    throw new Error("The database did not confirm the allocation rule and all its shares. Reload before retrying.");
  }
  return {
    rule: fromRow<AllocationRule>(data.rule as Record<string, unknown>),
    shares: data.shares.map(row => fromRow<AllocationRuleUnitShare>(row as Record<string, unknown>)),
  };
}

export async function createChargesReconciliation(
  reconciliation: ChargesReconciliation,
  receivable: ReceivableItem | null,
  portfolioId: string,
): Promise<{ reconciliation: ChargesReconciliation; receivable: ReceivableItem | null }> {
  const { data, error } = await supabase.rpc("client_create_charges_reconciliation", {
    p_reconciliation: toRow(reconciliation, portfolioId, TABLES.chargesReconciliations),
    p_receivable: receivable ? toRow(receivable, portfolioId, TABLES.receivableItems) : null,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Charges cannot be reconciled until the atomic reconciliation database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.reconciliation || typeof data.reconciliation !== "object" || Array.isArray(data.reconciliation) ||
      data.reconciliation.id !== reconciliation.id || data.reconciliation.portfolio_id !== portfolioId ||
      (receivable ? !data.receivable || typeof data.receivable !== "object" || Array.isArray(data.receivable) ||
        data.receivable.id !== receivable.id || data.receivable.portfolio_id !== portfolioId ||
        data.receivable.lease_id !== receivable.leaseId : data.receivable != null)) {
    throw new Error("The database did not confirm the reconciliation and adjustment receivable. Reload before retrying.");
  }
  return {
    reconciliation: fromRow<ChargesReconciliation>(data.reconciliation as Record<string, unknown>),
    receivable: data.receivable ? fromRow<ReceivableItem>(data.receivable as Record<string, unknown>) : null,
  };
}

export async function deleteChargesReconciliation(
  reconciliation: ChargesReconciliation,
  portfolioId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("client_delete_charges_reconciliation", {
    p_id: reconciliation.id,
    p_portfolio_id: portfolioId,
    p_expected_updated_at: reconciliation.updatedAt,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Charges cannot be deleted until the secured reconciliation database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.reconciliation_id !== reconciliation.id ||
      data.receivable_id !== reconciliation.receivableItemId) {
    throw new Error("The database did not confirm deletion of the reconciliation and adjustment receivable. Reload before retrying.");
  }
}

export async function changeAmendmentStatus(
  amendment: LeaseAmendment,
  portfolioId: string,
  status: "draft" | "scheduled",
): Promise<LeaseAmendment> {
  const { data, error } = await supabase.rpc("change_amendment_status", {
    p_amendment_id: amendment.id,
    p_portfolio_id: portfolioId,
    p_expected_updated_at: amendment.updatedAt,
    p_status: status,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Amendment status cannot change until the guarded amendment database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.id !== amendment.id ||
      data.portfolio_id !== portfolioId || data.status !== status || !data.updated_at) {
    throw new Error("The database did not confirm the amendment status change. Reload before retrying.");
  }
  return fromRow<LeaseAmendment>(data as Record<string, unknown>);
}

export async function saveAmendmentWithChanges(
  amendment: LeaseAmendment,
  changes: LeaseAmendmentChange[],
  portfolioId: string,
  expectedUpdatedAt?: string,
): Promise<{ amendment: LeaseAmendment; changes: LeaseAmendmentChange[] }> {
  const { data, error } = await supabase.rpc("client_save_amendment_with_changes", {
    p_amendment: toRow(amendment, portfolioId, TABLES.amendments),
    p_changes: changes.map(row => toRow(row, portfolioId, TABLES.amendmentChanges)),
    p_expected_updated_at: expectedUpdatedAt ?? null,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Amendments cannot be saved until the atomic amendment database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.amendment || typeof data.amendment !== "object" || Array.isArray(data.amendment) ||
      data.amendment.id !== amendment.id || data.amendment.portfolio_id !== portfolioId ||
      !confirmsRows(data.changes, changes.map(item => item.id), row =>
        row.amendment_id === amendment.id)) {
    throw new Error("The database did not confirm the amendment and all its changes. Reload before retrying.");
  }
  return {
    amendment: fromRow<LeaseAmendment>(data.amendment as Record<string, unknown>),
    changes: data.changes.map(row => fromRow<LeaseAmendmentChange>(row as Record<string, unknown>)),
  };
}

export async function loadLeaseReceivables(leaseId: string, portfolioId: string): Promise<ReceivableItem[]> {
  const rows: ReceivableItem[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const response = await repositoryClient.from(TABLES.receivableItems).select("*")
      .eq("lease_id", leaseId).eq("portfolio_id", portfolioId)
      .order("id", { ascending: true }).range(offset, offset + pageSize - 1);
    if (response.error || !Array.isArray(response.data)) {
      throw new Error(response.error?.message ?? "Could not reload lease receivables after closure.");
    }
    rows.push(...response.data.map(row => fromRow<ReceivableItem>(row)));
    if (response.data.length < pageSize) return rows;
  }
}

export async function activateAmendmentWithSchedule(
  targetAmendmentId: string,
  lease: Lease,
  assignments: { item: LeaseUnitAssignment; expectedUpdatedAt?: string }[],
  amendments: { item: LeaseAmendment; expectedUpdatedAt: string }[],
  removedReceivables: ReceivableItem[],
  newReceivables: ReceivableItem[],
  tenants: { item: Tenant; expectedUpdatedAt: string }[],
  portfolioId: string,
  expectedLeaseUpdatedAt: string,
): Promise<{
  lease: Lease;
  assignments: LeaseUnitAssignment[];
  amendments: LeaseAmendment[];
  receivables: ReceivableItem[];
  removedReceivableIds: string[];
  tenants: Tenant[];
}> {
  const { data, error } = await supabase.rpc("client_activate_amendment_with_schedule", {
    p_target_amendment_id: targetAmendmentId,
    p_lease: toRow(lease, portfolioId, TABLES.leases),
    p_assignments: assignments.map(({ item, expectedUpdatedAt }) => ({
      ...toRow(item, portfolioId, TABLES.leaseUnitAssignments),
      expected_updated_at: expectedUpdatedAt ?? null,
    })),
    p_amendments: amendments.map(({ item, expectedUpdatedAt }) => ({
      ...toRow(item, portfolioId, TABLES.amendments),
      expected_updated_at: expectedUpdatedAt,
    })),
    p_removed_receivables: removedReceivables.map(item => ({ id: item.id, expected_updated_at: item.updatedAt })),
    p_new_receivables: newReceivables.map(item => toRow(item, portfolioId, TABLES.receivableItems)),
    p_tenants: tenants.map(({ item, expectedUpdatedAt }) => ({
      id: item.id, status: item.status, expected_updated_at: expectedUpdatedAt,
    })),
    p_expected_lease_updated_at: expectedLeaseUpdatedAt,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Amendments cannot be activated until the atomic activation database migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.lease || typeof data.lease !== "object" || Array.isArray(data.lease) ||
      data.lease.id !== lease.id || data.lease.portfolio_id !== portfolioId ||
      !confirmsRows(data.assignments, assignments.map(({ item }) => item.id), row =>
        row.lease_id === lease.id && row.portfolio_id === portfolioId) ||
      !confirmsRows(data.amendments, amendments.map(({ item }) => item.id), row =>
        row.lease_id === lease.id && row.portfolio_id === portfolioId) ||
      !confirmsRows(data.receivables, newReceivables.map(item => item.id), row =>
        row.lease_id === lease.id && row.property_id === lease.propertyId && row.portfolio_id === portfolioId) ||
      !Array.isArray(data.removed_receivable_ids) || data.removed_receivable_ids.length !== removedReceivables.length ||
      new Set(data.removed_receivable_ids).size !== removedReceivables.length ||
      data.removed_receivable_ids.some(id => typeof id !== "string" || !removedReceivables.some(item => item.id === id)) ||
      !Array.isArray(data.tenants) ||
      !confirmsTenantStatuses(data.tenants, tenants.map(({ item }) => item), portfolioId)) {
    throw new Error("The database did not confirm the complete amendment activation. Reload before retrying.");
  }
  return {
    lease: { ...lease, ...fromRow<Lease>(data.lease as Record<string, unknown>) },
    assignments: data.assignments.map(row => fromRow<LeaseUnitAssignment>(row as Record<string, unknown>)),
    amendments: data.amendments.map(row => fromRow<LeaseAmendment>(row as Record<string, unknown>)),
    receivables: data.receivables.map(row => fromRow<ReceivableItem>(row as Record<string, unknown>)),
    removedReceivableIds: data.removed_receivable_ids as string[],
    tenants: data.tenants.map(row => fromRow<Tenant>(row as Record<string, unknown>)),
  };
}

export async function setPropertyOwnerLinksPersisted(
  propertyId: string,
  ownerIds: string[],
  expectedLinks: readonly PropertyOwnerLink[],
  portfolioId: string,
): Promise<PropertyOwnerLink[]> {
  const { data, error } = await supabase.rpc("set_property_owner_links", {
    p_property_id: propertyId,
    p_expected_links: expectedLinks.map(link => ({
      id: link.id, owner_id: link.ownerId, updated_at: link.updatedAt,
    })),
    p_desired_owner_ids: ownerIds,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Property owners cannot be changed until the atomic owner-link migration is applied.");
    }
    throw error;
  }
  const desired = new Set(ownerIds);
  const returnedOwnerIds = Array.isArray(data)
    ? new Set(data.map(row => row && typeof row === "object" && !Array.isArray(row) ? row.owner_id : null))
    : new Set();
  if (!Array.isArray(data) || data.length !== desired.size ||
      returnedOwnerIds.size !== desired.size ||
      data.some(row => !row || typeof row !== "object" || Array.isArray(row) ||
        row.property_id !== propertyId || row.portfolio_id !== portfolioId ||
        typeof row.owner_id !== "string" || !desired.has(row.owner_id))) {
    throw new Error("The database did not confirm all property owner links. Reload before retrying.");
  }
  return data.map(row => fromRow<PropertyOwnerLink>(row as Record<string, unknown>));
}

export async function savePropertyWithOwnersPersisted(
  property: Property,
  ownerIds: string[],
  expectedUpdatedAt: string | null,
  expectedLinks: readonly PropertyOwnerLink[],
  portfolioId: string,
): Promise<{ property: Property; links: PropertyOwnerLink[] }> {
  const { data, error } = await supabase.rpc("save_property_with_owners", {
    p_property: toRow(property, portfolioId, TABLES.properties),
    p_owner_ids: ownerIds,
    p_expected_updated_at: expectedUpdatedAt,
    p_expected_links: expectedLinks.map(link => ({
      id: link.id, owner_id: link.ownerId, updated_at: link.updatedAt,
    })),
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Properties cannot be saved until the atomic property-and-owner migration is applied.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !data.property || typeof data.property !== "object" || Array.isArray(data.property) ||
      data.property.id !== property.id || data.property.portfolio_id !== portfolioId ||
      !Array.isArray(data.links)) {
    throw new Error("The database did not confirm the property and its owners. Reload before retrying.");
  }
  const desired = new Set(ownerIds);
  const returned = new Set(data.links.map(link =>
    link && typeof link === "object" && !Array.isArray(link) ? link.owner_id : null));
  if (data.links.length !== desired.size || returned.size !== desired.size ||
      data.links.some(link => !link || typeof link !== "object" || Array.isArray(link) ||
        link.property_id !== property.id || link.portfolio_id !== portfolioId ||
        typeof link.owner_id !== "string" || !desired.has(link.owner_id))) {
    throw new Error("The database did not confirm all property owner links. Reload before retrying.");
  }
  return {
    property: fromRow<Property>(data.property as Record<string, unknown>),
    links: data.links.map(link => fromRow<PropertyOwnerLink>(link as Record<string, unknown>)),
  };
}

export async function saveReceiptAllocations(
  receipt: CashReceipt,
  receivables: { item: ReceivableItem; expectedUpdatedAt: string }[],
  allocations: ReceiptAllocation[],
  portfolioId: string,
  expectedReceiptUpdatedAt?: string,
): Promise<{ receipt: CashReceipt; receivables: ReceivableItem[]; allocations: ReceiptAllocation[] }> {
  const { data, error } = await supabase.rpc("client_save_receipt_allocations", {
    p_receipt: toRow(receipt, portfolioId, TABLES.cashReceipts),
    p_receivables: receivables.map(({ item, expectedUpdatedAt }) => ({
      ...toRow(item, portfolioId, TABLES.receivableItems),
      expected_updated_at: expectedUpdatedAt,
    })),
    p_allocations: allocations.map(row => toRow(row, portfolioId, TABLES.allocations)),
    p_expected_receipt_updated_at: expectedReceiptUpdatedAt ?? null,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("The atomic receipt allocation database migration and scoped payment RPC are required before receipts can be saved or allocated.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !("receipt" in data) || !("receivables" in data) || !("allocations" in data) ||
      !data.receipt || typeof data.receipt !== "object" || Array.isArray(data.receipt) ||
      !Array.isArray(data.receivables) || !Array.isArray(data.allocations) ||
      data.receivables.length !== receivables.length || data.allocations.length !== allocations.length) {
    throw new Error("The database did not confirm the receipt and all its allocations. Reload before retrying.");
  }
  const expectedItems = new Set(receivables.map(({ item }) => item.id));
  const expectedAllocations = new Map(allocations.map(row => [row.id, row]));
  const isRow = (row: unknown): row is Record<string, unknown> =>
    !!row && typeof row === "object" && !Array.isArray(row);
  if (data.receipt.id !== receipt.id ||
      new Set(data.receivables.map(row => isRow(row) ? row.id : null)).size !== expectedItems.size ||
      data.receivables.some(row => !isRow(row) || typeof row.id !== "string"
        || !expectedItems.has(row.id)) ||
      new Set(data.allocations.map(row => isRow(row) ? row.id : null)).size !== expectedAllocations.size ||
      data.allocations.some(row => {
        if (!isRow(row) || typeof row.id !== "string") return true;
        const expected = expectedAllocations.get(row.id);
        return !expected || row.cash_receipt_id !== receipt.id ||
          row.receivable_item_id !== expected.receivableItemId;
      })) {
    throw new Error("The database confirmed different payment rows. Reload payments before retrying.");
  }
  return {
    receipt: fromRow<CashReceipt>(data.receipt as Record<string, unknown>),
    receivables: data.receivables.map(row => fromRow<ReceivableItem>(row as Record<string, unknown>)),
    allocations: data.allocations.map(row => fromRow<ReceiptAllocation>(row as Record<string, unknown>)),
  };
}

export async function deleteDuplicateLeaseReceivables(
  portfolioId: string,
  items: readonly Pick<ReceivableItem, "id" | "updatedAt">[],
): Promise<number> {
  if (items.length === 0) return 0;
  const { data, error } = await supabase.rpc("delete_duplicate_lease_receivables", {
    p_portfolio_id: portfolioId,
    p_items: items.map(item => ({ id: item.id, expected_updated_at: item.updatedAt })),
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Duplicate cleanup requires the safe database cleanup migration before it can run.");
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      typeof data.deleted !== "number" || data.deleted !== items.length) {
    throw new Error("The database did not confirm deletion of every reviewed duplicate. Reload before retrying.");
  }
  return data.deleted;
}

export const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36));
