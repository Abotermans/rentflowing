import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { Property, Unit, UnitStatus, Tenant, Lease, Guarantee, getTenantFullName } from "@/types";
import type { LeaseUnitAssignment, LeaseUnitAssignmentType, PropertyOwner, PropertyOwnerLink, PropertyOwnerType } from "@/types";
import { ReceivableItem, CashReceipt, ReceiptAllocation, computeReceivableStatus, computeReceiptStatus } from "@/types/receivables";
import { MaintenanceTicket, Vendor } from "@/types/maintenance";
import { CostCategory, CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult } from "@/types/costs";
import type { ChargesReconciliation, ReconciliationResolution } from "@/types/chargesReconciliation";
import { computeReconciliation as engineComputeReconciliation, type ReconciliationBreakdown, type ReconciliationWindow } from "@/lib/chargesReconciliation";
import type { LeaseAmendment, LeaseAmendmentChange, AmendmentType, AmendmentStatus, AmendmentFieldName, AmendmentChangeType, AmendmentChangeMetadata } from "@/types/amendments";
import { nextAmendmentNumber, getAmendmentChanges } from "@/lib/amendments";
import { canActivateAmendment } from "@/lib/integrity/amendmentIntegrity";
import { autoAllocate } from "@/lib/reconciliation";
import { generateLeaseReceivables } from "@/lib/leaseReceivables";
import { computeCycles } from "@/lib/leaseCycles";
import { computeAllocations } from "@/lib/costAllocation";
import { getEffectiveLeaseTerms as libGetEffectiveLeaseTerms } from "@/lib/amendments";
import { usePortfolio } from "@/context/PortfolioContext";
import { useSettings } from "@/context/SettingsContext";
import { loadPortfolio, mirror, newId, TABLES } from "@/lib/repo";
import {
  migrateLegacyLeaseAssignments,
  getActiveLeaseForUnit as findActiveLeaseForUnit,
  assignmentIsActiveOn,
  closeOpenAssignmentsForLease,
  getLeaseAssignedUnits as libGetLeaseAssignedUnits,
  getPrimaryLeaseUnit as libGetPrimaryLeaseUnit,
  getAncillaryLeaseUnits as libGetAncillaryLeaseUnits,
  isUnitAssignedToActiveLease as libIsUnitAssignedToActiveLease,
} from "@/lib/leaseAssignments";

function reconcileTenantStatuses(tenantIds: string[], leases: Lease[], tenants: Tenant[]): Tenant[] {
  const affected = new Set(tenantIds.filter(Boolean));
  if (affected.size === 0) return tenants;
  const ts = new Date().toISOString();
  return tenants.map(t => {
    if (!affected.has(t.id)) return t;
    const tenantLeases = leases.filter(l => l.primaryTenantId === t.id || l.coTenantIds.includes(t.id));
    if (tenantLeases.length === 0) return t;
    const hasActive = tenantLeases.some(l => l.lifecycleStage === "active");
    const target = hasActive ? "active" : "former";
    if (target === "former" && t.status !== "active") return t;
    if (target === "active" && t.status === "active") return t;
    return { ...t, status: target, updatedAt: ts };
  });
}

interface PropertyStats {
  total: number;
  occupied: number;
  /** Units leased only as ancillary (parking, cellar, …). Not a primary home. */
  ancillaryLeased: number;
  vacant: number;
  reserved: number;
  unavailable: number;
  occupancyRate: number;
}

interface AppState {
  loading: boolean;
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

  // Costs & Taxes
  costCategories: CostCategory[];
  costEntries: CostEntry[];
  allocationRules: AllocationRule[];
  allocationRuleUnitShares: AllocationRuleUnitShare[];
  costAllocationResults: CostAllocationResult[];
  chargesReconciliations: ChargesReconciliation[];

  // Property CRUD
  addProperty: (p: Omit<Property, "id" | "createdAt" | "updatedAt">) => Property;
  updateProperty: (p: Property) => void;
  deleteProperty: (id: string) => void;

  // Property Owners
  createPropertyOwner: (data: { name: string; type: PropertyOwnerType }) => PropertyOwner;
  setPropertyOwners: (propertyId: string, ownerIds: string[]) => void;
  getOwnersForProperty: (propertyId: string) => PropertyOwner[];

  // Unit CRUD
  addUnit: (u: Omit<Unit, "id" | "createdAt" | "updatedAt">) => void;
  updateUnit: (u: Unit) => void;
  deleteUnit: (id: string) => void;

  // Tenant CRUD
  addTenant: (t: Omit<Tenant, "id" | "createdAt" | "updatedAt">) => Tenant;
  updateTenant: (t: Tenant) => void;
  deleteTenant: (id: string) => void;

  // Lease CRUD
  addLease: (l: Omit<Lease, "id" | "createdAt" | "updatedAt">) => Lease;
  updateLease: (l: Lease) => void;
  deleteLease: (id: string) => void;
  confirmMoveOut: (lease: Lease) => void;

  // Lease unit assignments
  setLeaseUnits: (leaseId: string, propertyId: string, units: {
    unitId: string;
    assignmentType: LeaseUnitAssignmentType;
    isPrimary: boolean;
    rentShare: number | null;
    chargesShare: number | null;
    startDate?: string;
  }[]) => void;
  getLeaseAssignments: (leaseId: string) => LeaseUnitAssignment[];
  getActiveLeaseAssignmentForUnit: (unitId: string) => { lease: Lease; assignment: LeaseUnitAssignment } | undefined;
  getLeaseAssignedUnits: (leaseId: string, opts?: { activeOnly?: boolean }) => { unit: Unit; assignment: LeaseUnitAssignment }[];
  getPrimaryLeaseUnit: (leaseId: string) => Unit | undefined;
  getAncillaryLeaseUnits: (leaseId: string, opts?: { activeOnly?: boolean }) => { unit: Unit; assignment: LeaseUnitAssignment }[];
  isUnitAssignedToActiveLease: (unitId: string) => boolean;

  // Amendments
  addAmendment: (
    a: Omit<LeaseAmendment, "id" | "amendmentNumber" | "status" | "createdAt" | "updatedAt"> & { status?: AmendmentStatus },
    changes: Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">[],
  ) => LeaseAmendment;
  updateAmendment: (a: LeaseAmendment, changes: Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">[]) => void;
  deleteAmendment: (id: string) => void;
  setAmendmentStatus: (id: string, status: AmendmentStatus) => void;
  activateAmendment: (id: string) => { ok: boolean; reason?: string };
  scheduleAmendment: (id: string) => { ok: boolean; reason?: string };
  terminateAmendment: (id: string) => void;
  revertAmendmentToDraft: (id: string) => void;
  getLeaseAmendments: (leaseId: string) => LeaseAmendment[];
  getAmendmentChanges: (amendmentId: string) => LeaseAmendmentChange[];

  // Guarantee
  addGuarantee: (g: Omit<Guarantee, "id">) => void;
  updateGuarantee: (g: Guarantee) => void;
  deleteGuarantee: (id: string) => void;

  // Receivables
  createReceivableItem: (r: Omit<ReceivableItem, "id" | "createdAt" | "updatedAt">) => void;
  updateReceivableItem: (r: ReceivableItem) => void;
  deleteReceivableItem: (id: string) => void;

  // Cash Receipts
  createCashReceipt: (r: Omit<CashReceipt, "id" | "createdAt" | "updatedAt">, autoAllocateFlag?: boolean) => void;
  
  // Allocation
  allocateCashReceipt: (receiptId: string, manualAllocations: { receivableItemId: string; amount: number; notes?: string }[]) => void;
  autoAllocateCashReceipt: (receiptId: string) => void;

  // Quick-pay a single receivable in one atomic operation
  quickPayReceivable: (params: {
    receivableItemId: string;
    amountReceived: number;
    paymentDate: string;
    sourceType: CashReceipt["sourceType"];
    payerName?: string | null;
    reference?: string | null;
    tenantIdOverride?: string | null;
    leaseIdOverride?: string | null;
  }) => void;

  // Maintenance
  addTicket: (t: Omit<MaintenanceTicket, "id">) => void;
  updateTicket: (t: MaintenanceTicket) => void;
  deleteTicket: (id: string) => void;

  // Vendors
  addVendor: (v: Omit<Vendor, "id">) => void;
  updateVendor: (v: Vendor) => void;
  deleteVendor: (id: string) => void;

  // Cost Categories CRUD
  addCostCategory: (c: Omit<CostCategory, "id" | "createdAt" | "updatedAt">) => void;
  updateCostCategory: (c: CostCategory) => void;
  deleteCostCategory: (id: string) => void;

  // Cost Entries CRUD
  addCostEntry: (e: Omit<CostEntry, "id" | "createdAt" | "updatedAt">) => void;
  updateCostEntry: (e: CostEntry) => void;
  deleteCostEntry: (id: string) => void;

  // Allocation Rules CRUD
  addAllocationRule: (r: Omit<AllocationRule, "id" | "createdAt" | "updatedAt">) => void;
  updateAllocationRule: (r: AllocationRule) => void;
  deleteAllocationRule: (id: string) => void;

  // Allocation Rule Unit Shares
  setAllocationRuleUnitShares: (ruleId: string, shares: Omit<AllocationRuleUnitShare, "id">[]) => void;

  // Run allocation
  runAllocation: (costEntryId: string) => void;

  // Queries
  getPropertyStats: (propertyId: string) => PropertyStats;
  getPropertyById: (id: string) => Property | undefined;
  getUnitById: (id: string) => Unit | undefined;
  getTenantById: (id: string) => Tenant | undefined;
  getActiveLease: (unitId: string) => Lease | undefined;
  getLeasesByTenant: (tenantId: string) => Lease[];
  getLeasesByProperty: (propertyId: string) => Lease[];
  getGuaranteeByLease: (leaseId: string) => Guarantee | undefined;

  // Receivables queries
  getReceivableItemsByLease: (leaseId: string) => ReceivableItem[];
  getReceivableItemsByTenant: (tenantId: string) => ReceivableItem[];
  getCashReceiptsByLease: (leaseId: string) => CashReceipt[];
  getCashReceiptsByTenant: (tenantId: string) => CashReceipt[];
  getAllocationsByReceipt: (receiptId: string) => ReceiptAllocation[];
  getAllocationsByReceivableItem: (itemId: string) => ReceiptAllocation[];

  // Financial aggregates
  getLeaseOutstanding: (leaseId: string) => { outstanding: number; overdue: number };
  getTenantOutstanding: (tenantId: string) => { outstanding: number; overdue: number };
  getTenantUnappliedCredit: (tenantId: string) => number;
  getReceiptMatchingStatus: (receiptId: string) => CashReceipt["status"];

  // Maintenance queries
  getTicketsByUnit: (unitId: string) => MaintenanceTicket[];
  getTicketsByProperty: (propertyId: string) => MaintenanceTicket[];
  getTicketsByVendor: (vendorId: string) => MaintenanceTicket[];
  getVendorById: (id: string) => Vendor | undefined;

  // Cost queries
  getCostEntriesByProperty: (propertyId: string) => CostEntry[];
  getCostEntriesByUnit: (unitId: string) => CostEntry[];
  getAllocationResultsByUnit: (unitId: string) => CostAllocationResult[];
  getAllocationResultsByProperty: (propertyId: string) => CostAllocationResult[];
  getCostCategoryById: (id: string) => CostCategory | undefined;
  getAllocationRuleById: (id: string) => AllocationRule | undefined;
  getUnitSharesByRule: (ruleId: string) => AllocationRuleUnitShare[];

  // ===== Charges reconciliation =====
  getChargesReconciliationsByLease: (leaseId: string) => ChargesReconciliation[];
  previewChargesReconciliation: (leaseId: string, window: ReconciliationWindow) => ReconciliationBreakdown | null;
  applyChargesReconciliation: (args: {
    leaseId: string;
    window: ReconciliationWindow;
    resolution: ReconciliationResolution;
    notes?: string;
  }) => ChargesReconciliation | null;
  deleteChargesReconciliation: (id: string) => void;
}

const AppContext = createContext<AppState | null>(null);

const genId = (_prefix?: string) => newId();
const now = () => new Date().toISOString().split("T")[0];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { currentPortfolioId, loading: portfolioLoading } = usePortfolio();
  const { receivableLeadDays } = useSettings();
  const [loading, setLoading] = useState<boolean>(true);

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyOwners, setPropertyOwnersState] = useState<PropertyOwner[]>([]);
  const [propertyOwnerLinks, setPropertyOwnerLinks] = useState<PropertyOwnerLink[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [guarantees, setGuarantees] = useState<Guarantee[]>([]);
  const [leaseUnitAssignments, setLeaseUnitAssignments] = useState<LeaseUnitAssignment[]>([]);
  const [amendments, setAmendments] = useState<LeaseAmendment[]>([]);
  const [amendmentChanges, setAmendmentChanges] = useState<LeaseAmendmentChange[]>([]);
  const [receivableItems, setReceivableItems] = useState<ReceivableItem[]>([]);
  const [cashReceipts, setCashReceipts] = useState<CashReceipt[]>([]);
  const [allocationsState, setAllocations] = useState<ReceiptAllocation[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [costCategories, setCostCategories] = useState<CostCategory[]>([]);
  const [costEntries, setCostEntries] = useState<CostEntry[]>([]);
  const [allocationRules, setAllocationRules] = useState<AllocationRule[]>([]);
  const [allocationRuleUnitShares, setAllocationRuleUnitShares] = useState<AllocationRuleUnitShare[]>([]);
  const [costAllocationResults, setCostAllocationResults] = useState<CostAllocationResult[]>([]);
  const [chargesReconciliations, setChargesReconciliations] = useState<ChargesReconciliation[]>([]);

  // Hydrate from DB whenever the active portfolio changes.
  useEffect(() => {
    let cancelled = false;
    // While the portfolio list is still being fetched, stay in loading
    // state and don't clear data — prevents a flash of "no portfolio".
    if (portfolioLoading) {
      setLoading(true);
      return;
    }
    if (!currentPortfolioId) {
      setProperties([]); setPropertyOwnersState([]); setPropertyOwnerLinks([]);
      setUnits([]); setTenants([]); setLeases([]);
      setGuarantees([]); setLeaseUnitAssignments([]);
      setAmendments([]); setAmendmentChanges([]);
      setReceivableItems([]); setCashReceipts([]); setAllocations([]);
      setTickets([]); setVendors([]);
      setCostCategories([]); setCostEntries([]); setAllocationRules([]);
      setAllocationRuleUnitShares([]); setCostAllocationResults([]);
      setChargesReconciliations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadPortfolio(currentPortfolioId).then(snap => {
      if (cancelled) return;
      setProperties(snap.properties);
      setPropertyOwnersState(snap.propertyOwners);
      setPropertyOwnerLinks(snap.propertyOwnerLinks);
      setUnits(snap.units);
      setTenants(snap.tenants);
      setLeases(snap.leases);
      setGuarantees(snap.guarantees);
      setLeaseUnitAssignments(
        migrateLegacyLeaseAssignments(snap.leases, snap.leaseUnitAssignments),
      );
      setAmendments(snap.amendments);
      setAmendmentChanges(snap.amendmentChanges);
      setReceivableItems(snap.receivableItems);
      setCashReceipts(snap.cashReceipts);
      setAllocations(snap.allocations);
      setTickets(snap.tickets);
      setVendors(snap.vendors);
      setCostCategories(snap.costCategories);
      setCostEntries(snap.costEntries);
      setAllocationRules(snap.allocationRules);
      setAllocationRuleUnitShares(snap.allocationRuleUnitShares);
      setCostAllocationResults(snap.costAllocationResults);
      setChargesReconciliations(snap.chargesReconciliations);
      setLoading(false);
    }).catch(err => {
      console.error("[AppContext] loadPortfolio failed:", err);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [currentPortfolioId, portfolioLoading]);

  // ===== Auto-generate cycle receivables when their global lead window
  // opens. Idempotent — keyed on (leaseId, cycleIndex). Runs whenever
  // leases, properties, or the global lead-days setting change. Applies to
  // both monthly and advance leases; due dates derive from the lease's
  // `dueDayOfMonth`.
  useEffect(() => {
    const today = now();
    const toAdd: ReceivableItem[] = [];
    const leadDays = Math.max(0, receivableLeadDays ?? 0);
    const horizon = new Date(Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10)) + leadDays,
    )).toISOString().slice(0, 10);
    const cycleDueDate = (cycleStart: string, dueDay: number): string => {
      const [y, m] = cycleStart.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const day = Math.min(Math.max(Math.floor(dueDay || 1), 1), lastDay);
      return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    };
    for (const lease of leases) {
      if (lease.lifecycleStage === "ended" || lease.lifecycleStage === "terminated") continue;
      const property = properties.find(p => p.id === lease.propertyId);
      const currencyCode = property?.currencyCode ?? "EUR";
      const cycles = computeCycles(lease);
      const isAdvance = (lease.rentFormula || 1) > 1;
      const dueDay = lease.dueDayOfMonth || 1;
      for (const cycle of cycles) {
        if (cycle.index > 1 && cycle.startDate > horizon) continue;
        const periodMonth = cycle.startDate.slice(0, 7);
        const dueDate = cycleDueDate(cycle.startDate, dueDay);
        const already = receivableItems.some(
          r => r.leaseId === lease.id
            && (
              (r.cycleIndex != null && r.cycleIndex === cycle.index)
              || (r.cycleIndex == null && r.periodMonth === periodMonth && r.dueDate === dueDate)
            ),
        );
        if (already) continue;
        const ts = today;
        if (cycle.rentTotal > 0) {
          const rent: ReceivableItem = {
            id: genId("ri"),
            leaseId: lease.id, tenantId: lease.primaryTenantId,
            propertyId: lease.propertyId, unitId: lease.unitId,
            itemType: "rent",
            label: isAdvance
              ? `Rent — ${cycle.months}-month advance (cycle ${cycle.index}, ${cycle.months} mo)`
              : "Monthly Rent",
            periodMonth, dueDate,
            currencyCode,
            expectedAmount: cycle.rentTotal, allocatedAmount: 0, outstandingAmount: cycle.rentTotal,
            status: "open", priority: 10, origin: "lease-schedule", notes: "",
            cycleIndex: cycle.index, cycleEndDate: cycle.endDate,
            createdAt: ts, updatedAt: ts,
          };
          rent.status = computeReceivableStatus(rent);
          toAdd.push(rent);
        }
        if (cycle.chargesTotal > 0) {
          const charges: ReceivableItem = {
            id: genId("ri"),
            leaseId: lease.id, tenantId: lease.primaryTenantId,
            propertyId: lease.propertyId, unitId: lease.unitId,
            itemType: "charges",
            label: isAdvance
              ? `Charges — ${cycle.months}-month advance (cycle ${cycle.index}, ${cycle.months} mo)`
              : "Monthly Charges",
            periodMonth, dueDate,
            currencyCode,
            expectedAmount: cycle.chargesTotal, allocatedAmount: 0, outstandingAmount: cycle.chargesTotal,
            status: "open", priority: 20, origin: "lease-schedule", notes: "",
            cycleIndex: cycle.index, cycleEndDate: cycle.endDate,
            createdAt: ts, updatedAt: ts,
          };
          charges.status = computeReceivableStatus(charges);
          toAdd.push(charges);
        }
      }
    }
    if (toAdd.length > 0) {
      setReceivableItems(prev => [...prev, ...toAdd]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leases, properties, receivableLeadDays]);

  // ===== Property CRUD =====
  const addProperty = useCallback((p: Omit<Property, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    const created: Property = {
      ...p,
      portfolioId: p.portfolioId ?? currentPortfolioId ?? undefined,
      id: genId("p"), createdAt: ts, updatedAt: ts,
    };
    setProperties(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.properties, created, currentPortfolioId);
    return created;
  }, [currentPortfolioId]);
  const updateProperty = useCallback((p: Property) => {
    const next = { ...p, updatedAt: now() };
    setProperties(prev => prev.map(x => x.id === p.id ? next : x));
    mirror.update(TABLES.properties, p.id, next);
  }, []);
  const deleteProperty = useCallback((id: string) => {
    setProperties(prev => prev.filter(x => x.id !== id));
    setUnits(prev => prev.filter(x => x.propertyId !== id));
    setPropertyOwnerLinks(prev => prev.filter(x => x.propertyId !== id));
    // FK ON DELETE CASCADE handles units/leases/etc. in the DB.
    mirror.remove(TABLES.properties, id);
  }, []);

  // ===== Property Owners =====
  const createPropertyOwner = useCallback((data: { name: string; type: PropertyOwnerType }) => {
    const ts = now();
    const created: PropertyOwner = {
      id: genId("po"),
      name: data.name.trim(),
      type: data.type,
      portfolioId: currentPortfolioId ?? undefined,
      createdAt: ts, updatedAt: ts,
    };
    setPropertyOwnersState(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.propertyOwners, created, currentPortfolioId);
    return created;
  }, [currentPortfolioId]);

  const setPropertyOwners = useCallback((propertyId: string, ownerIds: string[]) => {
    const ts = now();
    const desired = new Set(ownerIds);
    setPropertyOwnerLinks(prev => {
      const existingForProp = prev.filter(l => l.propertyId === propertyId);
      const existingIds = new Set(existingForProp.map(l => l.ownerId));
      const toRemove = existingForProp.filter(l => !desired.has(l.ownerId));
      const toAdd: PropertyOwnerLink[] = ownerIds
        .filter(oid => !existingIds.has(oid))
        .map(oid => ({
          id: genId("pol"),
          propertyId, ownerId: oid,
          portfolioId: currentPortfolioId ?? undefined,
          createdAt: ts, updatedAt: ts,
        }));
      // Mirror writes
      for (const link of toRemove) mirror.remove(TABLES.propertyOwnerLinks, link.id);
      if (toAdd.length > 0 && currentPortfolioId) {
        mirror.insertMany(TABLES.propertyOwnerLinks, toAdd, currentPortfolioId);
      }
      const removeIds = new Set(toRemove.map(l => l.id));
      return [...prev.filter(l => !removeIds.has(l.id)), ...toAdd];
    });
  }, [currentPortfolioId]);

  const getOwnersForProperty = useCallback((propertyId: string): PropertyOwner[] => {
    const ownerIds = propertyOwnerLinks
      .filter(l => l.propertyId === propertyId)
      .map(l => l.ownerId);
    const byId = new Map(propertyOwners.map(o => [o.id, o] as const));
    return ownerIds.map(id => byId.get(id)).filter((x): x is PropertyOwner => !!x);
  }, [propertyOwners, propertyOwnerLinks]);

  // ===== Unit CRUD =====
  const addUnit = useCallback((u: Omit<Unit, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    const created: Unit = { ...u, id: genId("u"), createdAt: ts, updatedAt: ts };
    setUnits(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.units, created, currentPortfolioId);
  }, [currentPortfolioId]);
  const updateUnit = useCallback((u: Unit) => {
    const next = { ...u, updatedAt: now() };
    setUnits(prev => prev.map(x => x.id === u.id ? next : x));
    mirror.update(TABLES.units, u.id, next);
  }, []);
  const deleteUnit = useCallback((id: string) => {
    setUnits(prev => prev.filter(x => x.id !== id));
    mirror.remove(TABLES.units, id);
  }, []);

  // ===== Tenant CRUD =====
  const addTenant = useCallback((t: Omit<Tenant, "id" | "createdAt" | "updatedAt">): Tenant => {
    const ts = now();
    const created: Tenant = {
      ...t,
      portfolioId: t.portfolioId ?? currentPortfolioId ?? undefined,
      id: genId("t"), createdAt: ts, updatedAt: ts,
    };
    setTenants(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.tenants, created, currentPortfolioId);
    return created;
  }, [currentPortfolioId]);
  const updateTenant = useCallback((t: Tenant) => {
    const next = { ...t, updatedAt: now() };
    setTenants(prev => prev.map(x => x.id === t.id ? next : x));
    mirror.update(TABLES.tenants, t.id, next);
  }, []);
  const deleteTenant = useCallback((id: string) => {
    setTenants(prev => prev.filter(x => x.id !== id));
    mirror.remove(TABLES.tenants, id);
  }, []);

  // ===== Lease CRUD =====
  const addLease = useCallback((l: Omit<Lease, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    // Seed a default payer account from the billing/first tenant when none was
    // provided — needed for bank-feed reconciliation to have a name to match on.
    let payerAccounts = l.payerAccounts ?? [];
    if (payerAccounts.length === 0) {
      const tIds = (l.tenantIds && l.tenantIds.length > 0)
        ? l.tenantIds
        : [l.primaryTenantId, ...(l.coTenantIds ?? [])].filter((x): x is string => !!x);
      const seedId = l.billingTenantId ?? tIds[0];
      if (seedId) {
        // tenants is in scope (closure)
        const seedTenant = tenants.find(tt => tt.id === seedId);
        if (seedTenant) {
          payerAccounts = [{
            id: genId("pa"),
            payerName: getTenantFullName(seedTenant),
            payerIban: null,
            payerBic: null,
            isDefault: true,
            notes: "",
          }];
        }
      }
    }
    const created: Lease = { ...l, payerAccounts, id: genId("l"), createdAt: ts, updatedAt: ts };
    setLeases(prev => {
      const next = [...prev, created];
      setTenants(prevT => reconcileTenantStatuses([created.primaryTenantId, ...created.coTenantIds], next, prevT));
      return next;
    });
    if (currentPortfolioId) mirror.insert(TABLES.leases, created, currentPortfolioId);
    // Always seed a primary assignment from the legacy unitId so a lease is never unit-less.
    if (created.unitId) {
      const lua: LeaseUnitAssignment = {
        id: genId("lua"),
        leaseId: created.id,
        unitId: created.unitId,
        assignmentType: "primary",
        isPrimary: true,
        startDate: created.startDate,
        endDate: null,
        rentShare: created.monthlyRent,
        chargesShare: created.monthlyCharges,
        notes: "",
        createdAt: ts,
        updatedAt: ts,
      };
      setLeaseUnitAssignments(prev => [...prev, lua]);
      if (currentPortfolioId) mirror.insert(TABLES.leaseUnitAssignments, lua, currentPortfolioId);
    }
    // Auto-generate the monthly rent/charges receivables, plus a prepayment
    // CashReceipt + allocations if the lease carries an advance. This is what
    // makes "Rent paid until X" real — the prepayment satisfies actual receivables
    // instead of being a phantom discount on the lease record.
    const property = properties.find(p => p.id === created.propertyId);
    const currencyCode = property?.currencyCode ?? "EUR";
    const { receivables } = generateLeaseReceivables(created, {
      currencyCode, genId, today: ts, leadDays: receivableLeadDays,
    });
    if (receivables.length > 0) {
      setReceivableItems(prev => [...prev, ...receivables]);
      if (currentPortfolioId) mirror.insertMany(TABLES.receivableItems, receivables, currentPortfolioId);
    }
    return created;
  }, [properties, currentPortfolioId, receivableLeadDays]);
  const updateLease = useCallback((l: Lease) => {
    const ts = now();
    const patched = { ...l, updatedAt: ts };
    mirror.update(TABLES.leases, l.id, patched);
    setLeases(prev => {
      const old = prev.find(x => x.id === l.id);
      const next = prev.map(x => x.id === l.id ? patched : x);
      const affected = [
        ...(old ? [old.primaryTenantId, ...old.coTenantIds] : []),
        l.primaryTenantId, ...l.coTenantIds,
      ];
      setTenants(prevT => reconcileTenantStatuses(affected, next, prevT));

      // Lifecycle transition cascade: when a lease moves to ended/terminated, close
      // every open assignment and vacate the linked units so ancillary spaces (parking,
      // cellar, …) don't stay flagged as occupied.
      const becameClosed =
        old &&
        old.lifecycleStage === "active" &&
        (l.lifecycleStage === "ended" || l.lifecycleStage === "terminated");
      if (becameClosed) {
        const endDate = l.endDate || ts;
        setLeaseUnitAssignments(prevA => {
          const openUnitIds = prevA
            .filter(a => a.leaseId === l.id && !a.endDate)
            .map(a => a.unitId);
          if (openUnitIds.length > 0) {
            setUnits(prevU => prevU.map(u =>
              openUnitIds.includes(u.id)
                ? { ...u, currentStatus: "vacant" as const, availableFrom: endDate, updatedAt: ts }
                : u,
            ));
            openUnitIds.forEach(uid => mirror.update(TABLES.units, uid, {
              currentStatus: "vacant", availableFrom: endDate,
            }));
          }
          const nextA = closeOpenAssignmentsForLease(l.id, endDate, prevA, ts);
          // Mirror closed assignments.
          const closed = nextA.filter(a => prevA.some(p => p.id === a.id && !p.endDate) && a.endDate);
          closed.forEach(a => mirror.update(TABLES.leaseUnitAssignments, a.id, { endDate: a.endDate }));
          return nextA;
        });
        // Cascade to active amendments: keep lease and amendment lifecycle in sync.
        const newAmStatus = l.lifecycleStage === "terminated" ? "terminated" as const : "ended" as const;
        setAmendments(prevAm => prevAm.map(a =>
          a.leaseId === l.id && a.status === "active"
            ? (() => {
                const upd = { ...a, status: newAmStatus, updatedAt: ts };
                mirror.update(TABLES.amendments, a.id, { status: newAmStatus });
                return upd;
              })()
            : a,
        ));
      }
      return next;
    });
  }, []);
  const deleteLease = useCallback((id: string) => {
    setLeases(prev => prev.filter(x => x.id !== id));
    setLeaseUnitAssignments(prev => prev.filter(a => a.leaseId !== id));
    mirror.remove(TABLES.leases, id); // ON DELETE CASCADE cleans up children
  }, []);

  const confirmMoveOut = useCallback((lease: Lease) => {
    const ts = now();
    const moveOutDate = lease.moveOutActualDate ?? ts;
    const patched: Lease = {
      ...lease,
      lifecycleStage: "ended" as const,
      moveOutActualDate: moveOutDate,
      endDate: lease.endDate || moveOutDate,
      updatedAt: ts,
    };
    mirror.update(TABLES.leases, lease.id, patched);
    setLeases(prev => {
      const next = prev.map(x => x.id === lease.id ? patched : x);
      setTenants(prevT => reconcileTenantStatuses([lease.primaryTenantId, ...lease.coTenantIds], next, prevT));
      return next;
    });
    // Vacate every unit that still had an open assignment on this lease
    // (primary AND ancillary — parking/cellar/storage).
    setLeaseUnitAssignments(prev => {
      const openUnitIds = prev
        .filter(a => a.leaseId === lease.id && !a.endDate)
        .map(a => a.unitId);
      // Always include the legacy unitId as a defensive fallback.
      if (lease.unitId && !openUnitIds.includes(lease.unitId)) openUnitIds.push(lease.unitId);
      if (openUnitIds.length > 0) {
        setUnits(prevU => prevU.map(u =>
          openUnitIds.includes(u.id)
            ? { ...u, currentStatus: "vacant" as const, availableFrom: moveOutDate, updatedAt: ts }
            : u,
        ));
        openUnitIds.forEach(uid => mirror.update(TABLES.units, uid, {
          currentStatus: "vacant", availableFrom: moveOutDate,
        }));
      }
      const nextA = closeOpenAssignmentsForLease(lease.id, moveOutDate, prev, ts);
      const closed = nextA.filter(a => prev.some(p => p.id === a.id && !p.endDate) && a.endDate);
      closed.forEach(a => mirror.update(TABLES.leaseUnitAssignments, a.id, { endDate: a.endDate }));
      return nextA;
    });
    // Cascade: end any active amendments on this lease.
    setAmendments(prevAm => prevAm.map(a =>
      a.leaseId === lease.id && a.status === "active"
        ? (() => {
            mirror.update(TABLES.amendments, a.id, { status: "ended" });
            return { ...a, status: "ended" as const, updatedAt: ts };
          })()
        : a,
    ));
  }, []);

  // ===== Lease Unit Assignments =====
  const setLeaseUnitsFn = useCallback((leaseId: string, propertyId: string, draft: {
    unitId: string;
    assignmentType: LeaseUnitAssignmentType;
    isPrimary: boolean;
    rentShare: number | null;
    chargesShare: number | null;
    startDate?: string;
  }[]) => {
    const ts = now();
    setLeaseUnitAssignments(prev => {
      const others = prev.filter(a => a.leaseId !== leaseId);
      const existing = prev.filter(a => a.leaseId === leaseId);
      const keepIds = new Set<string>();
      const merged: LeaseUnitAssignment[] = [];
      for (const d of draft) {
        const match = existing.find(a => a.unitId === d.unitId && !a.endDate);
        if (match) {
          keepIds.add(match.id);
          merged.push({
            ...match,
            assignmentType: d.assignmentType,
            isPrimary: d.isPrimary,
            rentShare: d.rentShare,
            chargesShare: d.chargesShare,
            startDate: d.startDate ?? match.startDate,
            updatedAt: ts,
          });
        } else {
          merged.push({
            id: genId("lua"),
            leaseId,
            unitId: d.unitId,
            assignmentType: d.assignmentType,
            isPrimary: d.isPrimary,
            startDate: d.startDate ?? ts,
            endDate: null,
            rentShare: d.rentShare,
            chargesShare: d.chargesShare,
            notes: "",
            createdAt: ts,
            updatedAt: ts,
          });
        }
      }
      // Close (don't delete) assignments removed from the draft to preserve history.
      const closed = existing
        .filter(a => !keepIds.has(a.id))
        .map(a => a.endDate ? a : { ...a, endDate: ts, updatedAt: ts });
      const nextAll = [...others, ...merged, ...closed];
      if (currentPortfolioId) {
        mirror.upsertMany(TABLES.leaseUnitAssignments, [...merged, ...closed], currentPortfolioId);
      }
      return nextAll;
    });
    // Sync legacy lease.unitId to the new primary AND mirror the sum of shares into
    // lease.monthlyRent / lease.monthlyCharges so receivables, reports, exports keep
    // working without changes. Lease totals are now derived from per-unit shares.
    const primary = draft.find(d => d.isPrimary);
    const sums = {
      rent: draft.reduce((s, d) => s + (d.rentShare ?? 0), 0),
      charges: draft.reduce((s, d) => s + (d.chargesShare ?? 0), 0),
    };
    setLeases(prev => prev.map(l =>
      l.id === leaseId
        ? (() => {
            const patch = {
              ...l,
              unitId: primary ? primary.unitId : l.unitId,
              propertyId,
              monthlyRent: sums.rent,
              monthlyCharges: sums.charges,
              updatedAt: ts,
            };
            mirror.update(TABLES.leases, l.id, patch);
            return patch;
          })()
        : l,
    ));
  }, [currentPortfolioId]);

  const getLeaseAssignments = useCallback(
    (leaseId: string) => leaseUnitAssignments.filter(a => a.leaseId === leaseId),
    [leaseUnitAssignments],
  );

  const getActiveLeaseAssignmentForUnit = useCallback(
    (unitId: string) => findActiveLeaseForUnit(unitId, leases, leaseUnitAssignments),
    [leases, leaseUnitAssignments],
  );

  const getLeaseAssignedUnitsFn = useCallback(
    (leaseId: string, opts: { activeOnly?: boolean } = {}) =>
      libGetLeaseAssignedUnits(leaseId, leaseUnitAssignments, units, opts),
    [leaseUnitAssignments, units],
  );
  const getPrimaryLeaseUnitFn = useCallback(
    (leaseId: string) => libGetPrimaryLeaseUnit(leaseId, leaseUnitAssignments, units),
    [leaseUnitAssignments, units],
  );
  const getAncillaryLeaseUnitsFn = useCallback(
    (leaseId: string, opts: { activeOnly?: boolean } = {}) =>
      libGetAncillaryLeaseUnits(leaseId, leaseUnitAssignments, units, opts),
    [leaseUnitAssignments, units],
  );
  const isUnitAssignedToActiveLeaseFn = useCallback(
    (unitId: string) => libIsUnitAssignedToActiveLease(unitId, leases, leaseUnitAssignments),
    [leases, leaseUnitAssignments],
  );

  // ===== Amendments =====
  const buildChanges = (amendmentId: string, draft: Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">[], ts: string): LeaseAmendmentChange[] =>
    draft.map(d => ({ ...d, id: genId("amc"), amendmentId, createdAt: ts, updatedAt: ts }));

  const addAmendment = useCallback(
    (a: Omit<LeaseAmendment, "id" | "amendmentNumber" | "status" | "createdAt" | "updatedAt"> & { status?: AmendmentStatus }, changesDraft) => {
      const ts = now();
      const id = genId("am");
      const number = nextAmendmentNumber(a.leaseId, amendments);
      const created: LeaseAmendment = {
        ...a,
        id,
        amendmentNumber: number,
        status: a.status ?? "draft",
        createdAt: ts,
        updatedAt: ts,
      };
      const builtChanges = buildChanges(id, changesDraft, ts);
      setAmendments(prev => [...prev, created]);
      setAmendmentChanges(prev => [...prev, ...builtChanges]);
      if (currentPortfolioId) {
        mirror.insert(TABLES.amendments, created, currentPortfolioId);
        mirror.insertMany(TABLES.amendmentChanges, builtChanges, currentPortfolioId);
      }
      return created;
    },
    [amendments, currentPortfolioId],
  );

  const updateAmendment = useCallback(
    (a: LeaseAmendment, changesDraft: Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">[]) => {
      const ts = now();
      const patched = { ...a, updatedAt: ts };
      const builtChanges = buildChanges(a.id, changesDraft, ts);
      setAmendments(prev => prev.map(x => x.id === a.id ? patched : x));
      setAmendmentChanges(prev => [
        ...prev.filter(c => c.amendmentId !== a.id),
        ...builtChanges,
      ]);
      mirror.update(TABLES.amendments, a.id, patched);
      mirror.removeWhere(TABLES.amendmentChanges, "amendment_id", a.id);
      if (currentPortfolioId) mirror.insertMany(TABLES.amendmentChanges, builtChanges, currentPortfolioId);
    },
    [currentPortfolioId],
  );

  const deleteAmendment = useCallback((id: string) => {
    // Only safe for drafts; UI is expected to gate this. We still strip both rows.
    setAmendments(prev => prev.filter(a => a.id !== id));
    setAmendmentChanges(prev => prev.filter(c => c.amendmentId !== id));
    mirror.remove(TABLES.amendments, id);
  }, []);

  const setAmendmentStatus = useCallback((id: string, status: AmendmentStatus) => {
    const ts = now();
    setAmendments(prev => prev.map(a => a.id === id ? { ...a, status, updatedAt: ts } : a));
    mirror.update(TABLES.amendments, id, { status });
  }, []);

  /**
   * Activate an amendment: validates, marks active, and writes the unit-assignment
   * side effects prospectively (new rows from effectiveDate, existing rows closed
   * at effectiveDate − 1 day per affected unit). Lease record fields are NOT
   * mutated — current values are derived through getEffectiveLeaseTerms.
   */
  const activateAmendment = useCallback((id: string): { ok: boolean; reason?: string } => {
    const am = amendments.find(a => a.id === id);
    if (!am) return { ok: false, reason: "Amendment not found" };
    const todayISO = new Date().toISOString().slice(0, 10);
    if (am.effectiveDate && am.effectiveDate > todayISO) {
      return { ok: false, reason: "Effective date is in the future — schedule instead" };
    }
    const ts = now();
    const eff = am.effectiveDate;
    const dayBefore = (() => {
      const d = new Date(eff + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();
    const changes = getAmendmentChanges(id, amendmentChanges);

    // Compute the post-activation snapshot synchronously so we can derive the
    // effective lease terms and patch the lease + receivables in one shot.
    const nextAssignments: LeaseUnitAssignment[] = (() => {
      let next = [...leaseUnitAssignments];
      for (const c of changes) {
        if (c.fieldName === "unitAssignments" && c.changeType === "add" && c.metadata?.unitId) {
          const v = (c.newValue ?? {}) as { rentShare?: number; chargesShare?: number };
          next.push({
            id: genId("lua"),
            leaseId: am.leaseId,
            unitId: c.metadata.unitId,
            assignmentType: c.metadata.assignmentType ?? "ancillary",
            isPrimary: false,
            startDate: c.metadata.startDate ?? eff,
            endDate: null,
            rentShare: Number(v.rentShare ?? 0),
            chargesShare: Number(v.chargesShare ?? 0),
            notes: `Added by amendment ${am.amendmentNumber}`,
            createdAt: ts,
            updatedAt: ts,
          });
        } else if (c.fieldName === "unitAssignments" && c.changeType === "remove" && c.metadata?.unitId) {
          next = next.map(a =>
            a.leaseId === am.leaseId && a.unitId === c.metadata!.unitId && !a.endDate
              ? { ...a, endDate: dayBefore, updatedAt: ts }
              : a,
          );
        } else if (c.fieldName === "primaryUnitId") {
          const newId = String(c.newValue);
          next = next.map(a =>
            a.leaseId === am.leaseId
              ? { ...a, isPrimary: a.unitId === newId, updatedAt: ts }
              : a,
          );
        } else if (c.fieldName === "unitRentShare" && c.metadata?.unitId) {
          next = next.map(a =>
            a.leaseId === am.leaseId && a.unitId === c.metadata!.unitId && !a.endDate
              ? { ...a, rentShare: Number(c.newValue) || 0, updatedAt: ts }
              : a,
          );
        } else if (c.fieldName === "unitChargesShare" && c.metadata?.unitId) {
          next = next.map(a =>
            a.leaseId === am.leaseId && a.unitId === c.metadata!.unitId && !a.endDate
              ? { ...a, chargesShare: Number(c.newValue) || 0, updatedAt: ts }
              : a,
          );
        } else if (c.fieldName === "unitAssignmentType" && c.metadata?.unitId) {
          next = next.map(a =>
            a.leaseId === am.leaseId && a.unitId === c.metadata!.unitId && !a.endDate
              ? { ...a, assignmentType: (c.newValue as LeaseUnitAssignmentType) ?? a.assignmentType, updatedAt: ts }
              : a,
          );
        }
      }
      return next;
    })();

    // Enforce single-active invariant: any other currently-active amendment on
    // the same lease is moved to "ended". The newly activated amendment records
    // the most recent previous active one as the one it supersedes.
    const previousActives = amendments
      .filter(a => a.leaseId === am.leaseId && a.id !== id && a.status === "active")
      .slice()
      .sort((x, y) => {
        if (x.effectiveDate !== y.effectiveDate) return y.effectiveDate.localeCompare(x.effectiveDate);
        return y.amendmentNumber - x.amendmentNumber;
      });
    const supersededId = previousActives[0]?.id ?? am.supersedesAmendmentId ?? null;
    const endedIds = new Set(previousActives.map(a => a.id));
    const nextAmendments = amendments.map(a => {
      if (a.id === id) return { ...a, status: "active" as const, supersedesAmendmentId: supersededId, updatedAt: ts };
      if (endedIds.has(a.id)) return { ...a, status: "ended" as const, updatedAt: ts };
      return a;
    });

    // Compute effective terms from the simulated post-activation state.
    const lease = leases.find(l => l.id === am.leaseId);
    let patched: Lease | null = null;
    if (lease) {
      const eff2 = libGetEffectiveLeaseTerms(am.leaseId, todayISO, {
        leases, leaseUnitAssignments: nextAssignments,
        amendments: nextAmendments, amendmentChanges,
      });
      if (eff2) {
        patched = {
          ...lease,
          monthlyRent: eff2.monthlyRent || lease.monthlyRent,
          monthlyCharges: eff2.monthlyCharges || lease.monthlyCharges,
          endDate: eff2.endDate || lease.endDate,
          depositOrGuaranteeAmount: eff2.depositAmount ?? lease.depositOrGuaranteeAmount,
          noticePeriodText: eff2.noticePeriodText || lease.noticePeriodText,
          primaryTenantId: eff2.primaryTenantId || lease.primaryTenantId,
          coTenantIds: eff2.coTenantIds ?? lease.coTenantIds,
          updatedAt: ts,
        };
      }
    }

    // Commit all derived state in one render pass.
    setLeaseUnitAssignments(nextAssignments);
    setAmendments(nextAmendments);
    if (currentPortfolioId) {
      mirror.upsertMany(TABLES.leaseUnitAssignments, nextAssignments.filter(a => a.leaseId === am.leaseId), currentPortfolioId);
      mirror.upsertMany(TABLES.amendments, nextAmendments.filter(a => a.leaseId === am.leaseId), currentPortfolioId);
    }
    if (patched) {
      setLeases(prev => prev.map(l => l.id === patched!.id ? patched! : l));
      mirror.update(TABLES.leases, patched.id, patched);
      const property = properties.find(p => p.id === patched.propertyId);
      const currencyCode = property?.currencyCode ?? "EUR";
      const { receivables: regen } = generateLeaseReceivables(patched, {
        currencyCode, genId, today: ts, leadDays: receivableLeadDays,
      });
      setReceivableItems(prevRi => {
        const kept = prevRi.filter(ri =>
          ri.leaseId !== patched!.id ||
          ri.dueDate < eff ||
          ri.allocatedAmount > 0,
        );
        const keptKeys = new Set(kept.map(ri => `${ri.leaseId}|${ri.itemType}|${ri.periodMonth}|${ri.dueDate}`));
        const fresh = regen.filter(ri =>
          ri.dueDate >= eff &&
          !keptKeys.has(`${ri.leaseId}|${ri.itemType}|${ri.periodMonth}|${ri.dueDate}`),
        );
        if (currentPortfolioId && fresh.length > 0) {
          mirror.insertMany(TABLES.receivableItems, fresh, currentPortfolioId);
        }
        return [...kept, ...fresh];
      });
    }

    return { ok: true };
  }, [amendments, amendmentChanges, leases, leaseUnitAssignments, properties, currentPortfolioId, receivableLeadDays]);

  const scheduleAmendment = useCallback((id: string): { ok: boolean; reason?: string } => {
    const am = amendments.find(a => a.id === id);
    if (!am) return { ok: false, reason: "Amendment not found" };
    if (!am.effectiveDate) return { ok: false, reason: "Effective date is required" };
    const todayISO = new Date().toISOString().slice(0, 10);
    if (am.effectiveDate <= todayISO) {
      // Date already reached — go straight to active.
      return activateAmendment(id);
    }
    setAmendmentStatus(id, "scheduled");
    return { ok: true };
  }, [amendments, setAmendmentStatus, activateAmendment]);

  const terminateAmendment = useCallback((id: string) => {
    setAmendmentStatus(id, "terminated");
  }, [setAmendmentStatus]);

  const revertAmendmentToDraft = useCallback((id: string) => {
    setAmendmentStatus(id, "draft");
  }, [setAmendmentStatus]);

  // Auto-activate scheduled amendments once their effectiveDate is reached.
  useEffect(() => {
    const tick = () => {
      const today = new Date().toISOString().slice(0, 10);
      const due = amendments.filter(a => a.status === "scheduled" && a.effectiveDate <= today);
      due.forEach(a => activateAmendment(a.id));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [amendments, activateAmendment]);

  const getLeaseAmendmentsFn = useCallback(
    (leaseId: string) => amendments.filter(a => a.leaseId === leaseId),
    [amendments],
  );
  const getAmendmentChangesFn = useCallback(
    (amendmentId: string) => amendmentChanges.filter(c => c.amendmentId === amendmentId),
    [amendmentChanges],
  );

  // Silence unused-import lint when these helpers stay one-shot.
  void canActivateAmendment;

  // ===== Guarantee =====
  const addGuarantee = useCallback((g: Omit<Guarantee, "id">) => {
    const created: Guarantee = { ...g, id: genId("g") };
    setGuarantees(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.guarantees, created, currentPortfolioId);
  }, [currentPortfolioId]);
  const updateGuarantee = useCallback((g: Guarantee) => {
    setGuarantees(prev => prev.map(x => x.id === g.id ? g : x));
    mirror.update(TABLES.guarantees, g.id, g);
  }, []);
  const deleteGuarantee = useCallback((id: string) => {
    setGuarantees(prev => prev.filter(x => x.id !== id));
    mirror.remove(TABLES.guarantees, id);
  }, []);

  // ===== Receivable Items =====
  const createReceivableItem = useCallback((r: Omit<ReceivableItem, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    const created: ReceivableItem = { ...r, id: genId("ri"), createdAt: ts, updatedAt: ts };
    setReceivableItems(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.receivableItems, created, currentPortfolioId);
  }, [currentPortfolioId]);
  const updateReceivableItem = useCallback((r: ReceivableItem) => {
    const next = { ...r, updatedAt: now() };
    setReceivableItems(prev => prev.map(x => x.id === r.id ? next : x));
    mirror.update(TABLES.receivableItems, r.id, next);
  }, []);
  const deleteReceivableItem = useCallback((id: string) => {
    setReceivableItems(prev => prev.filter(x => x.id !== id));
    mirror.remove(TABLES.receivableItems, id);
  }, []);

  // ===== Cash Receipts =====
  const createCashReceipt = useCallback((r: Omit<CashReceipt, "id" | "createdAt" | "updatedAt">, autoAllocateFlag = false) => {
    const ts = now();
    const newReceipt: CashReceipt = { ...r, id: genId("cr"), createdAt: ts, updatedAt: ts };

    if (autoAllocateFlag) {
      const openItems = receivableItems.filter(ri => {
        if (ri.outstandingAmount <= 0) return false;
        if (newReceipt.leaseId && ri.leaseId === newReceipt.leaseId) return true;
        if (newReceipt.tenantId && ri.tenantId === newReceipt.tenantId) return true;
        if (newReceipt.propertyId && ri.propertyId === newReceipt.propertyId) return true;
        return false;
      });

      const result = autoAllocate(newReceipt, openItems);
      const newAllocs = result.allocations.map(a => ({ ...a, id: genId("al"), createdAt: ts, updatedAt: ts }));
      setCashReceipts(prev => [...prev, result.updatedReceipt]);
      setReceivableItems(prev => prev.map(ri => {
        const updated = result.updatedReceivables.find(u => u.id === ri.id);
        return updated ?? ri;
      }));
      setAllocations(prev => [...prev, ...newAllocs]);
      if (currentPortfolioId) {
        mirror.insert(TABLES.cashReceipts, result.updatedReceipt, currentPortfolioId);
        result.updatedReceivables.forEach(ri => mirror.update(TABLES.receivableItems, ri.id, ri));
        mirror.insertMany(TABLES.allocations, newAllocs, currentPortfolioId);
      }
    } else {
      setCashReceipts(prev => [...prev, newReceipt]);
      if (currentPortfolioId) mirror.insert(TABLES.cashReceipts, newReceipt, currentPortfolioId);
    }
  }, [receivableItems, currentPortfolioId]);

  // ===== Manual Allocation =====
  const allocateCashReceipt = useCallback((receiptId: string, manualAllocations: { receivableItemId: string; amount: number; notes?: string }[]) => {
    const ts = now();
    const receipt = cashReceipts.find(r => r.id === receiptId);
    if (!receipt) return;

    let remainingUnmatched = receipt.unmatchedAmount;
    const newAllocations: ReceiptAllocation[] = [];
    const riUpdates = new Map<string, ReceivableItem>();

    for (const ma of manualAllocations) {
      const ri = receivableItems.find(r => r.id === ma.receivableItemId);
      if (!ri) continue;

      const allocAmount = Math.min(ma.amount, remainingUnmatched, ri.outstandingAmount);
      if (allocAmount <= 0) continue;

      remainingUnmatched -= allocAmount;
      const updatedRi: ReceivableItem = {
        ...ri,
        allocatedAmount: ri.allocatedAmount + allocAmount,
        outstandingAmount: ri.outstandingAmount - allocAmount,
        updatedAt: ts,
      };
      updatedRi.status = computeReceivableStatus(updatedRi);
      riUpdates.set(ri.id, updatedRi);

      newAllocations.push({
        id: genId("al"),
        cashReceiptId: receiptId,
        receivableItemId: ma.receivableItemId,
        allocatedAmount: allocAmount,
        allocationType: "manual",
        allocationDate: ts,
        notes: ma.notes ?? "",
        createdAt: ts,
        updatedAt: ts,
      });
    }

    const updatedReceipt: CashReceipt = {
      ...receipt,
      unmatchedAmount: Math.round(remainingUnmatched * 100) / 100,
      updatedAt: ts,
    };
    updatedReceipt.status = computeReceiptStatus(updatedReceipt);

    setCashReceipts(prev => prev.map(r => r.id === receiptId ? updatedReceipt : r));
    setReceivableItems(prev => prev.map(ri => riUpdates.get(ri.id) ?? ri));
    setAllocations(prev => [...prev, ...newAllocations]);
    mirror.update(TABLES.cashReceipts, receiptId, updatedReceipt);
    riUpdates.forEach(ri => mirror.update(TABLES.receivableItems, ri.id, ri));
    if (currentPortfolioId) mirror.insertMany(TABLES.allocations, newAllocations, currentPortfolioId);
  }, [cashReceipts, receivableItems, currentPortfolioId]);

  // ===== Auto-Allocation =====
  const autoAllocateCashReceipt = useCallback((receiptId: string) => {
    const receipt = cashReceipts.find(r => r.id === receiptId);
    if (!receipt || receipt.unmatchedAmount <= 0) return;

    const openItems = receivableItems.filter(ri => {
      if (ri.outstandingAmount <= 0) return false;
      if (receipt.leaseId && ri.leaseId === receipt.leaseId) return true;
      if (receipt.tenantId && ri.tenantId === receipt.tenantId) return true;
      if (receipt.propertyId && ri.propertyId === receipt.propertyId) return true;
      return false;
    });

    const ts = now();
    const result = autoAllocate(receipt, openItems);

    setCashReceipts(prev => prev.map(r => r.id === receiptId ? result.updatedReceipt : r));
    setReceivableItems(prev => prev.map(ri => {
      const updated = result.updatedReceivables.find(u => u.id === ri.id);
      return updated ?? ri;
    }));
    const newAllocs = result.allocations.map(a => ({ ...a, id: genId("al"), createdAt: ts, updatedAt: ts }));
    setAllocations(prev => [...prev, ...newAllocs]);
    mirror.update(TABLES.cashReceipts, receiptId, result.updatedReceipt);
    result.updatedReceivables.forEach(ri => mirror.update(TABLES.receivableItems, ri.id, ri));
    if (currentPortfolioId) mirror.insertMany(TABLES.allocations, newAllocs, currentPortfolioId);
  }, [cashReceipts, receivableItems, currentPortfolioId]);

  // ===== Quick-pay a single receivable (atomic create + targeted allocate + surplus auto) =====
  const quickPayReceivable = useCallback((params: {
    receivableItemId: string;
    amountReceived: number;
    paymentDate: string;
    sourceType: CashReceipt["sourceType"];
    payerName?: string | null;
    reference?: string | null;
    tenantIdOverride?: string | null;
    leaseIdOverride?: string | null;
  }) => {
    const ri = receivableItems.find(r => r.id === params.receivableItemId);
    if (!ri) return;
    if (params.amountReceived <= 0) return;

    const ts = now();
    const tenantId = params.tenantIdOverride ?? ri.tenantId;
    const leaseId = params.leaseIdOverride ?? ri.leaseId;
    const lease = leaseId ? leases.find(l => l.id === leaseId) : undefined;
    const propertyId = ri.propertyId ?? lease?.propertyId ?? null;
    const unitId = ri.unitId ?? lease?.unitId ?? null;

    const receipt: CashReceipt = {
      id: genId("cr"),
      tenantId: tenantId ?? null,
      leaseId: leaseId ?? null,
      propertyId,
      unitId,
      sourceType: params.sourceType,
      paymentDate: params.paymentDate,
      bookingDate: null,
      valueDate: null,
      amountReceived: params.amountReceived,
      currencyCode: ri.currencyCode,
      payerName: params.payerName ?? null,
      payerIban: null,
      payerBic: null,
      reference: params.reference ?? null,
      remittanceInformation: null,
      endToEndReference: null,
      status: "unmatched",
      unmatchedAmount: params.amountReceived,
      notes: "",
      importBatchId: null,
      rawBankTransactionId: null,
      createdAt: ts,
      updatedAt: ts,
    };

    // 1) Targeted allocation to the clicked receivable first.
    const targetedAmount = Math.min(params.amountReceived, ri.outstandingAmount);
    const riUpdates = new Map<string, ReceivableItem>();
    const newAllocations: ReceiptAllocation[] = [];
    let remaining = params.amountReceived;

    if (targetedAmount > 0) {
      const updatedRi: ReceivableItem = {
        ...ri,
        allocatedAmount: ri.allocatedAmount + targetedAmount,
        outstandingAmount: ri.outstandingAmount - targetedAmount,
        updatedAt: ts,
      };
      updatedRi.status = computeReceivableStatus(updatedRi);
      riUpdates.set(ri.id, updatedRi);
      newAllocations.push({
        id: genId("al"),
        cashReceiptId: receipt.id,
        receivableItemId: ri.id,
        allocatedAmount: targetedAmount,
        allocationType: "manual",
        allocationDate: ts,
        notes: "",
        createdAt: ts,
        updatedAt: ts,
      });
      remaining = Math.round((remaining - targetedAmount) * 100) / 100;
    }

    // 2) Surplus → auto-allocate to other open items on same lease, else same tenant, by priority.
    if (remaining > 0 && (receipt.leaseId || receipt.tenantId)) {
      const otherOpen = receivableItems
        .filter(o => {
          if (o.id === ri.id) return false;
          if (o.outstandingAmount <= 0) return false;
          if (receipt.leaseId && o.leaseId === receipt.leaseId) return true;
          if (!receipt.leaseId && receipt.tenantId && o.tenantId === receipt.tenantId) return true;
          return false;
        })
        .sort((a, b) => (a.priority - b.priority) || a.dueDate.localeCompare(b.dueDate));

      for (const o of otherOpen) {
        if (remaining <= 0) break;
        const alloc = Math.min(remaining, o.outstandingAmount);
        if (alloc <= 0) continue;
        const updated: ReceivableItem = {
          ...o,
          allocatedAmount: o.allocatedAmount + alloc,
          outstandingAmount: o.outstandingAmount - alloc,
          updatedAt: ts,
        };
        updated.status = computeReceivableStatus(updated);
        riUpdates.set(o.id, updated);
        newAllocations.push({
          id: genId("al"),
          cashReceiptId: receipt.id,
          receivableItemId: o.id,
          allocatedAmount: alloc,
          allocationType: "automatic",
          allocationDate: ts,
          notes: "",
          createdAt: ts,
          updatedAt: ts,
        });
        remaining = Math.round((remaining - alloc) * 100) / 100;
      }
    }

    const finalReceipt: CashReceipt = {
      ...receipt,
      unmatchedAmount: Math.round(remaining * 100) / 100,
    };
    finalReceipt.status = computeReceiptStatus(finalReceipt);

    setCashReceipts(prev => [...prev, finalReceipt]);
    setReceivableItems(prev => prev.map(x => riUpdates.get(x.id) ?? x));
    setAllocations(prev => [...prev, ...newAllocations]);
    if (currentPortfolioId) {
      mirror.insert(TABLES.cashReceipts, finalReceipt, currentPortfolioId);
      riUpdates.forEach(updatedRi => mirror.update(TABLES.receivableItems, updatedRi.id, updatedRi));
      mirror.insertMany(TABLES.allocations, newAllocations, currentPortfolioId);
    }
  }, [receivableItems, leases, currentPortfolioId]);

  // ===== Maintenance =====
  const addTicket = useCallback((t: Omit<MaintenanceTicket, "id">) => {
    const created: MaintenanceTicket = { ...t, id: genId("mt") };
    setTickets(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.tickets, created, currentPortfolioId);
  }, [currentPortfolioId]);
  const updateTicket = useCallback((t: MaintenanceTicket) => {
    setTickets(prev => prev.map(x => x.id === t.id ? t : x));
    mirror.update(TABLES.tickets, t.id, t);
  }, []);
  const deleteTicket = useCallback((id: string) => {
    setTickets(prev => prev.filter(x => x.id !== id));
    mirror.remove(TABLES.tickets, id);
  }, []);

  // ===== Vendors =====
  const addVendor = useCallback((v: Omit<Vendor, "id">) => {
    const created: Vendor = {
      ...v,
      portfolioId: v.portfolioId ?? currentPortfolioId ?? undefined,
      id: genId("v"),
    };
    setVendors(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.vendors, created, currentPortfolioId);
  }, [currentPortfolioId]);
  const updateVendor = useCallback((v: Vendor) => {
    setVendors(prev => prev.map(x => x.id === v.id ? v : x));
    mirror.update(TABLES.vendors, v.id, v);
  }, []);
  const deleteVendor = useCallback((id: string) => {
    setVendors(prev => prev.filter(x => x.id !== id));
    mirror.remove(TABLES.vendors, id);
  }, []);

  // ===== Cost Categories CRUD =====
  const addCostCategory = useCallback((c: Omit<CostCategory, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    const created: CostCategory = {
      ...c,
      portfolioId: c.portfolioId ?? currentPortfolioId ?? undefined,
      id: genId("cc"), createdAt: ts, updatedAt: ts,
    };
    setCostCategories(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.costCategories, created, currentPortfolioId);
  }, [currentPortfolioId]);
  const updateCostCategory = useCallback((c: CostCategory) => {
    const next = { ...c, updatedAt: now() };
    setCostCategories(prev => prev.map(x => x.id === c.id ? next : x));
    mirror.update(TABLES.costCategories, c.id, next);
  }, []);
  const deleteCostCategory = useCallback((id: string) => {
    setCostCategories(prev => prev.filter(x => x.id !== id));
    mirror.remove(TABLES.costCategories, id);
  }, []);

  // ===== Cost Entries CRUD =====
  const addCostEntry = useCallback((e: Omit<CostEntry, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    const newEntry: CostEntry = { ...e, id: genId("ce"), createdAt: ts, updatedAt: ts };
    setCostEntries(prev => [...prev, newEntry]);
    if (currentPortfolioId) mirror.insert(TABLES.costEntries, newEntry, currentPortfolioId);
    // Auto-run allocation if property-level with a rule
    if (!newEntry.unitId && newEntry.allocationRuleId) {
      const rule = allocationRules.find(r => r.id === newEntry.allocationRuleId);
      if (rule) {
        const results = computeAllocations(newEntry, rule, units, allocationRuleUnitShares);
        const stamped = results.map(r => ({ ...r, id: genId("car"), createdAt: ts, updatedAt: ts }));
        setCostAllocationResults(prev => [...prev, ...stamped]);
        if (currentPortfolioId) mirror.insertMany(TABLES.costAllocationResults, stamped, currentPortfolioId);
      }
    }
  }, [allocationRules, units, allocationRuleUnitShares, currentPortfolioId]);

  const updateCostEntry = useCallback((e: CostEntry) => {
    const ts = now();
    const next = { ...e, updatedAt: ts };
    setCostEntries(prev => prev.map(x => x.id === e.id ? next : x));
    mirror.update(TABLES.costEntries, e.id, next);
    // Re-run allocation
    setCostAllocationResults(prev => prev.filter(r => r.costEntryId !== e.id));
    mirror.removeWhere(TABLES.costAllocationResults, "cost_entry_id", e.id);
    if (!e.unitId && e.allocationRuleId) {
      const rule = allocationRules.find(r => r.id === e.allocationRuleId);
      if (rule) {
        const results = computeAllocations(e, rule, units, allocationRuleUnitShares);
        const stamped = results.map(r => ({ ...r, id: genId("car"), createdAt: ts, updatedAt: ts }));
        setCostAllocationResults(prev => [...prev, ...stamped]);
        if (currentPortfolioId) mirror.insertMany(TABLES.costAllocationResults, stamped, currentPortfolioId);
      }
    }
  }, [allocationRules, units, allocationRuleUnitShares, currentPortfolioId]);

  const deleteCostEntry = useCallback((id: string) => {
    setCostEntries(prev => prev.filter(x => x.id !== id));
    setCostAllocationResults(prev => prev.filter(r => r.costEntryId !== id));
    mirror.remove(TABLES.costEntries, id);
  }, []);

  // ===== Allocation Rules CRUD =====
  const addAllocationRule = useCallback((r: Omit<AllocationRule, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    const created: AllocationRule = { ...r, id: genId("ar"), createdAt: ts, updatedAt: ts };
    setAllocationRules(prev => [...prev, created]);
    if (currentPortfolioId) mirror.insert(TABLES.allocationRules, created, currentPortfolioId);
  }, [currentPortfolioId]);
  const updateAllocationRule = useCallback((r: AllocationRule) => {
    const next = { ...r, updatedAt: now() };
    setAllocationRules(prev => prev.map(x => x.id === r.id ? next : x));
    mirror.update(TABLES.allocationRules, r.id, next);
  }, []);
  const deleteAllocationRule = useCallback((id: string) => {
    setAllocationRules(prev => prev.filter(x => x.id !== id));
    setAllocationRuleUnitShares(prev => prev.filter(s => s.allocationRuleId !== id));
    mirror.remove(TABLES.allocationRules, id);
  }, []);

  // ===== Allocation Rule Unit Shares =====
  const setAllocationRuleUnitSharesFn = useCallback((ruleId: string, shares: Omit<AllocationRuleUnitShare, "id">[]) => {
    const stamped = shares.map(s => ({ ...s, id: genId("arus") }));
    setAllocationRuleUnitShares(prev => [
      ...prev.filter(s => s.allocationRuleId !== ruleId),
      ...stamped,
    ]);
    mirror.removeWhere(TABLES.allocationRuleUnitShares, "allocation_rule_id", ruleId);
    if (currentPortfolioId) mirror.insertMany(TABLES.allocationRuleUnitShares, stamped, currentPortfolioId);
  }, [currentPortfolioId]);

  // ===== Run Allocation =====
  const runAllocation = useCallback((costEntryId: string) => {
    const entry = costEntries.find(e => e.id === costEntryId);
    if (!entry || entry.unitId || !entry.allocationRuleId) return;
    const rule = allocationRules.find(r => r.id === entry.allocationRuleId);
    if (!rule) return;
    const ts = now();
    const results = computeAllocations(entry, rule, units, allocationRuleUnitShares);
    const stamped = results.map(r => ({ ...r, id: genId("car"), createdAt: ts, updatedAt: ts }));
    setCostAllocationResults(prev => [
      ...prev.filter(r => r.costEntryId !== costEntryId),
      ...stamped,
    ]);
    mirror.removeWhere(TABLES.costAllocationResults, "cost_entry_id", costEntryId);
    if (currentPortfolioId) mirror.insertMany(TABLES.costAllocationResults, stamped, currentPortfolioId);
  }, [costEntries, allocationRules, units, allocationRuleUnitShares, currentPortfolioId]);

  // ===== Queries =====
  const getPropertyStats = useCallback((propertyId: string): PropertyStats => {
    const propUnits = units.filter(u => u.propertyId === propertyId);
    const total = propUnits.length;
    const counts = { occupied: 0, ancillaryLeased: 0, vacant: 0, reserved: 0, unavailable: 0 };
    const todayISO = now();
    const activeLeaseIds = new Set(
      leases.filter(l => l.lifecycleStage === "active").map(l => l.id),
    );
    propUnits.forEach(u => {
      const active = leaseUnitAssignments.find(a =>
        a.unitId === u.id &&
        assignmentIsActiveOn(a, todayISO) &&
        activeLeaseIds.has(a.leaseId),
      );
      if (active && active.isPrimary) {
        counts.occupied++;
      } else if (active) {
        counts.ancillaryLeased++;
      } else if (u.currentStatus === "reserved") {
        counts.reserved++;
      } else if (u.currentStatus === "unavailable") {
        counts.unavailable++;
      } else {
        counts.vacant++;
      }
    });
    // Ancillary units are not eligible to be a "home" — exclude them from the denominator
    // so a 1-bedroom + parking lease doesn't show 50% occupancy.
    const denominator = total - counts.ancillaryLeased;
    return {
      total,
      ...counts,
      occupancyRate: denominator > 0 ? Math.round((counts.occupied / denominator) * 100) : 0,
    };
  }, [units, leases, leaseUnitAssignments]);

  const getPropertyById = useCallback((id: string) => properties.find(p => p.id === id), [properties]);
  const getUnitById = useCallback((id: string) => units.find(u => u.id === id), [units]);
  const getTenantById = useCallback((id: string) => tenants.find(t => t.id === id), [tenants]);
  const getActiveLease = useCallback((unitId: string) => {
    const found = findActiveLeaseForUnit(unitId, leases, leaseUnitAssignments);
    return found?.lease;
  }, [leases, leaseUnitAssignments]);
  const getLeasesByTenant = useCallback((tenantId: string) => leases.filter(l => l.primaryTenantId === tenantId || l.coTenantIds.includes(tenantId)), [leases]);
  const getLeasesByProperty = useCallback((propertyId: string) => leases.filter(l => l.propertyId === propertyId), [leases]);
  const getGuaranteeByLease = useCallback((leaseId: string) => guarantees.find(g => g.leaseId === leaseId), [guarantees]);

  // ===== Receivables Queries =====
  const getReceivableItemsByLease = useCallback((leaseId: string) => receivableItems.filter(ri => ri.leaseId === leaseId), [receivableItems]);
  const getReceivableItemsByTenant = useCallback((tenantId: string) => receivableItems.filter(ri => ri.tenantId === tenantId), [receivableItems]);
  const getCashReceiptsByLease = useCallback((leaseId: string) => cashReceipts.filter(cr => cr.leaseId === leaseId), [cashReceipts]);
  const getCashReceiptsByTenant = useCallback((tenantId: string) => cashReceipts.filter(cr => cr.tenantId === tenantId), [cashReceipts]);
  const getAllocationsByReceipt = useCallback((receiptId: string) => allocationsState.filter(a => a.cashReceiptId === receiptId), [allocationsState]);
  const getAllocationsByReceivableItem = useCallback((itemId: string) => allocationsState.filter(a => a.receivableItemId === itemId), [allocationsState]);

  // ===== Financial Aggregates =====
  const getLeaseOutstanding = useCallback((leaseId: string) => {
    const items = receivableItems.filter(ri => ri.leaseId === leaseId);
    const today = now();
    let outstanding = 0;
    let overdue = 0;
    for (const ri of items) {
      outstanding += ri.outstandingAmount;
      if (ri.outstandingAmount > 0 && ri.dueDate < today) overdue += ri.outstandingAmount;
    }
    return { outstanding, overdue };
  }, [receivableItems]);

  const getTenantOutstanding = useCallback((tenantId: string) => {
    const items = receivableItems.filter(ri => ri.tenantId === tenantId);
    const today = now();
    let outstanding = 0;
    let overdue = 0;
    for (const ri of items) {
      outstanding += ri.outstandingAmount;
      if (ri.outstandingAmount > 0 && ri.dueDate < today) overdue += ri.outstandingAmount;
    }
    return { outstanding, overdue };
  }, [receivableItems]);

  const getTenantUnappliedCredit = useCallback((tenantId: string) => {
    return cashReceipts
      .filter(cr => cr.tenantId === tenantId && cr.unmatchedAmount > 0)
      .reduce((sum, cr) => sum + cr.unmatchedAmount, 0);
  }, [cashReceipts]);

  const getReceiptMatchingStatus = useCallback((receiptId: string) => {
    const receipt = cashReceipts.find(r => r.id === receiptId);
    if (!receipt) return "unmatched" as const;
    return computeReceiptStatus(receipt);
  }, [cashReceipts]);

  const getTicketsByUnit = useCallback((unitId: string) => tickets.filter(t => t.unitId === unitId), [tickets]);
  const getTicketsByProperty = useCallback((propertyId: string) => tickets.filter(t => t.propertyId === propertyId), [tickets]);
  const getTicketsByVendor = useCallback((vendorId: string) => tickets.filter(t => t.assignedVendorId === vendorId), [tickets]);
  const getVendorById = useCallback((id: string) => vendors.find(v => v.id === id), [vendors]);

  // ===== Cost Queries =====
  const getCostEntriesByProperty = useCallback((propertyId: string) => costEntries.filter(e => e.propertyId === propertyId), [costEntries]);
  const getCostEntriesByUnit = useCallback((unitId: string) => costEntries.filter(e => e.unitId === unitId), [costEntries]);
  const getAllocationResultsByUnit = useCallback((unitId: string) => costAllocationResults.filter(r => r.unitId === unitId), [costAllocationResults]);
  const getAllocationResultsByProperty = useCallback((propertyId: string) => costAllocationResults.filter(r => r.propertyId === propertyId), [costAllocationResults]);
  const getCostCategoryById = useCallback((id: string) => costCategories.find(c => c.id === id), [costCategories]);
  const getAllocationRuleById = useCallback((id: string) => allocationRules.find(r => r.id === id), [allocationRules]);
  const getUnitSharesByRule = useCallback((ruleId: string) => allocationRuleUnitShares.filter(s => s.allocationRuleId === ruleId), [allocationRuleUnitShares]);

  // ===== Charges reconciliation =====
  const getChargesReconciliationsByLease = useCallback(
    (leaseId: string) => chargesReconciliations
      .filter(r => r.leaseId === leaseId)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)),
    [chargesReconciliations],
  );

  const previewChargesReconciliation = useCallback(
    (leaseId: string, window: ReconciliationWindow): ReconciliationBreakdown | null => {
      const lease = leases.find(l => l.id === leaseId);
      if (!lease) return null;
      return engineComputeReconciliation(lease, window, receivableItems, costAllocationResults, costEntries);
    },
    [leases, receivableItems, costAllocationResults, costEntries],
  );

  const applyChargesReconciliation = useCallback(
    ({ leaseId, window, resolution, notes }: {
      leaseId: string;
      window: ReconciliationWindow;
      resolution: ReconciliationResolution;
      notes?: string;
    }): ChargesReconciliation | null => {
      const lease = leases.find(l => l.id === leaseId);
      if (!lease) return null;
      const breakdown = engineComputeReconciliation(lease, window, receivableItems, costAllocationResults, costEntries);
      const ts = now();
      const property = properties.find(p => p.id === lease.propertyId);
      const currencyCode = property?.currencyCode ?? "EUR";

      // Build the resulting receivable (if any).
      // Convention: receivable.expectedAmount > 0 means tenant owes more (debit).
      //             expectedAmount < 0 means refund / credit to tenant.
      //             For carry-forward we still emit a negative receivable so it
      //             auto-allocates against the next open charges items.
      let receivable: ReceivableItem | null = null;
      const delta = breakdown.delta;
      if (resolution !== "none" && Math.abs(delta) >= 0.01) {
        const owe = resolution === "owe";
        // owe → tenant owes |delta| → positive receivable
        // refund / carry-forward → surplus of |delta| → negative receivable
        const amount = owe ? Math.abs(delta) : -Math.abs(delta);
        const label = owe
          ? `Charges adjustment ${window.start} → ${window.end} (tenant owes)`
          : resolution === "refund"
            ? `Charges refund ${window.start} → ${window.end}`
            : `Charges carry-forward ${window.start} → ${window.end}`;
        const ri: ReceivableItem = {
          id: genId("ri"),
          leaseId: lease.id,
          tenantId: lease.primaryTenantId,
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          itemType: "charges-adjustment",
          label,
          periodMonth: window.end.slice(0, 7),
          dueDate: ts,
          currencyCode,
          expectedAmount: amount,
          allocatedAmount: 0,
          outstandingAmount: amount,
          status: "open",
          priority: 25,
          origin: "adjustment",
          notes: notes ?? "",
          createdAt: ts,
          updatedAt: ts,
        };
        // For carry-forward / refund the outstanding is negative — flag it
        // straight as "open" credit; the operator can manually allocate later.
        ri.status = amount === 0 ? "paid" : "open";
        receivable = ri;
        setReceivableItems(prev => [...prev, ri]);
        if (currentPortfolioId) mirror.insert(TABLES.receivableItems, ri, currentPortfolioId);
      }

      const reconciliation: ChargesReconciliation = {
        id: genId("crec"),
        leaseId: lease.id,
        portfolioId: currentPortfolioId ?? undefined,
        periodStart: window.start,
        periodEnd: window.end,
        provisionsCollected: breakdown.provisionsCollected,
        actualRecoverable: breakdown.actualRecoverable,
        delta,
        resolution,
        receivableItemId: receivable?.id ?? null,
        notes: notes ?? "",
        createdAt: ts,
        updatedAt: ts,
      };
      setChargesReconciliations(prev => [...prev, reconciliation]);
      if (currentPortfolioId) mirror.insert(TABLES.chargesReconciliations, reconciliation, currentPortfolioId);
      return reconciliation;
    },
    [leases, receivableItems, costAllocationResults, costEntries, properties, currentPortfolioId],
  );

  const deleteChargesReconciliation = useCallback((id: string) => {
    setChargesReconciliations(prev => prev.filter(r => r.id !== id));
    mirror.remove(TABLES.chargesReconciliations, id);
  }, []);

  // ===== Portfolio scoping ============================================
  // All exposed collections are filtered to the active portfolio. Internal
  // state stays unscoped so cross-portfolio bookkeeping (CRUD, receivable
  // generation, amendments) keeps working without rewrites.
  const scoped = useMemo(() => {
    const pid = currentPortfolioId;
    if (!pid) {
      const empty = {
        properties: [] as Property[], units: [] as Unit[], tenants: [] as Tenant[],
        leases: [] as Lease[], guarantees: [] as Guarantee[],
        leaseUnitAssignments: [] as LeaseUnitAssignment[],
        amendments: [] as LeaseAmendment[], amendmentChanges: [] as LeaseAmendmentChange[],
        receivableItems: [] as ReceivableItem[], cashReceipts: [] as CashReceipt[],
        allocations: [] as ReceiptAllocation[],
        tickets: [] as MaintenanceTicket[], vendors: [] as Vendor[],
        costCategories: [] as CostCategory[], costEntries: [] as CostEntry[],
        allocationRules: [] as AllocationRule[],
        allocationRuleUnitShares: [] as AllocationRuleUnitShare[],
        costAllocationResults: [] as CostAllocationResult[],
        chargesReconciliations: [] as ChargesReconciliation[],
      };
      return empty;
    }
    const sProperties = properties.filter(p => p.portfolioId === pid);
    const propIds = new Set(sProperties.map(p => p.id));
    const sUnits = units.filter(u => propIds.has(u.propertyId));
    const unitIds = new Set(sUnits.map(u => u.id));
    const sTenants = tenants.filter(t => t.portfolioId === pid);
    const tenantIds = new Set(sTenants.map(t => t.id));
    const sLeases = leases.filter(l => propIds.has(l.propertyId));
    const leaseIds = new Set(sLeases.map(l => l.id));
    const sGuarantees = guarantees.filter(g => leaseIds.has(g.leaseId));
    const sLUA = leaseUnitAssignments.filter(a => leaseIds.has(a.leaseId));
    const sAmendments = amendments.filter(a => leaseIds.has(a.leaseId));
    const amendmentIds = new Set(sAmendments.map(a => a.id));
    const sAmendmentChanges = amendmentChanges.filter(c => amendmentIds.has(c.amendmentId));
    const sReceivableItems = receivableItems.filter(ri => leaseIds.has(ri.leaseId) || tenantIds.has(ri.tenantId));
    const receivableIds = new Set(sReceivableItems.map(ri => ri.id));
    const sCashReceipts = cashReceipts.filter(cr =>
      (cr.leaseId && leaseIds.has(cr.leaseId)) ||
      (cr.tenantId && tenantIds.has(cr.tenantId)) ||
      (cr.propertyId && propIds.has(cr.propertyId)),
    );
    const receiptIds = new Set(sCashReceipts.map(cr => cr.id));
    const sAllocations = allocationsState.filter(a =>
      receiptIds.has(a.cashReceiptId) || receivableIds.has(a.receivableItemId),
    );
    const sVendors = vendors.filter(v => v.portfolioId === pid);
    const vendorIds = new Set(sVendors.map(v => v.id));
    const sTickets = tickets.filter(t =>
      propIds.has(t.propertyId) || (t.assignedVendorId && vendorIds.has(t.assignedVendorId)),
    );
    const sCostCategories = costCategories.filter(c => c.portfolioId === pid);
    const sCostEntries = costEntries.filter(e => propIds.has(e.propertyId));
    const sAllocationRules = allocationRules.filter(r => propIds.has(r.propertyId));
    const ruleIds = new Set(sAllocationRules.map(r => r.id));
    const sAllocationRuleUnitShares = allocationRuleUnitShares.filter(s => ruleIds.has(s.allocationRuleId));
    const sCostAllocationResults = costAllocationResults.filter(r => propIds.has(r.propertyId));
    const sChargesReconciliations = chargesReconciliations.filter(r => leaseIds.has(r.leaseId));
    return {
      properties: sProperties, units: sUnits, tenants: sTenants,
      leases: sLeases, guarantees: sGuarantees,
      leaseUnitAssignments: sLUA,
      amendments: sAmendments, amendmentChanges: sAmendmentChanges,
      receivableItems: sReceivableItems, cashReceipts: sCashReceipts,
      allocations: sAllocations,
      tickets: sTickets, vendors: sVendors,
      costCategories: sCostCategories, costEntries: sCostEntries,
      allocationRules: sAllocationRules,
      allocationRuleUnitShares: sAllocationRuleUnitShares,
      costAllocationResults: sCostAllocationResults,
      chargesReconciliations: sChargesReconciliations,
    };
  }, [
    currentPortfolioId,
    properties, units, tenants, leases, guarantees, leaseUnitAssignments,
    amendments, amendmentChanges, receivableItems, cashReceipts, allocationsState,
    tickets, vendors, costCategories, costEntries, allocationRules,
    allocationRuleUnitShares, costAllocationResults, chargesReconciliations,
  ]);

  const value = useMemo(() => ({
    loading,
    properties: scoped.properties,
    units: scoped.units,
    tenants: scoped.tenants,
    leases: scoped.leases,
    guarantees: scoped.guarantees,
    leaseUnitAssignments: scoped.leaseUnitAssignments,
    amendments: scoped.amendments,
    amendmentChanges: scoped.amendmentChanges,
    receivableItems: scoped.receivableItems,
    cashReceipts: scoped.cashReceipts,
    allocations: scoped.allocations,
    tickets: scoped.tickets,
    vendors: scoped.vendors,
    costCategories: scoped.costCategories,
    costEntries: scoped.costEntries,
    allocationRules: scoped.allocationRules,
    allocationRuleUnitShares: scoped.allocationRuleUnitShares,
    costAllocationResults: scoped.costAllocationResults,
    chargesReconciliations: scoped.chargesReconciliations,
    addProperty, updateProperty, deleteProperty,
    addUnit, updateUnit, deleteUnit,
    addTenant, updateTenant, deleteTenant,
    addLease, updateLease, deleteLease, confirmMoveOut,
    setLeaseUnits: setLeaseUnitsFn,
    getLeaseAssignments,
    getActiveLeaseAssignmentForUnit,
    getLeaseAssignedUnits: getLeaseAssignedUnitsFn,
    getPrimaryLeaseUnit: getPrimaryLeaseUnitFn,
    getAncillaryLeaseUnits: getAncillaryLeaseUnitsFn,
    isUnitAssignedToActiveLease: isUnitAssignedToActiveLeaseFn,
    addAmendment, updateAmendment, deleteAmendment, setAmendmentStatus,
    activateAmendment, scheduleAmendment, terminateAmendment, revertAmendmentToDraft,
    getLeaseAmendments: getLeaseAmendmentsFn,
    getAmendmentChanges: getAmendmentChangesFn,
    addGuarantee, updateGuarantee, deleteGuarantee,
    createReceivableItem, updateReceivableItem, deleteReceivableItem,
    createCashReceipt, allocateCashReceipt, autoAllocateCashReceipt,
    quickPayReceivable,
    addTicket, updateTicket, deleteTicket,
    addVendor, updateVendor, deleteVendor,
    addCostCategory, updateCostCategory, deleteCostCategory,
    addCostEntry, updateCostEntry, deleteCostEntry,
    addAllocationRule, updateAllocationRule, deleteAllocationRule,
    setAllocationRuleUnitShares: setAllocationRuleUnitSharesFn,
    runAllocation,
    getPropertyStats, getPropertyById, getUnitById, getTenantById,
    getActiveLease, getLeasesByTenant, getLeasesByProperty, getGuaranteeByLease,
    getReceivableItemsByLease, getReceivableItemsByTenant,
    getCashReceiptsByLease, getCashReceiptsByTenant,
    getAllocationsByReceipt, getAllocationsByReceivableItem,
    getLeaseOutstanding, getTenantOutstanding, getTenantUnappliedCredit,
    getReceiptMatchingStatus,
    getTicketsByUnit, getTicketsByProperty, getTicketsByVendor, getVendorById,
    getCostEntriesByProperty, getCostEntriesByUnit,
    getAllocationResultsByUnit, getAllocationResultsByProperty,
    getCostCategoryById, getAllocationRuleById, getUnitSharesByRule,
    getChargesReconciliationsByLease, previewChargesReconciliation, applyChargesReconciliation, deleteChargesReconciliation,
  }), [
    loading,
    scoped,
    addProperty, updateProperty, deleteProperty,
    addUnit, updateUnit, deleteUnit,
    addTenant, updateTenant, deleteTenant,
    addLease, updateLease, deleteLease, confirmMoveOut,
    setLeaseUnitsFn, getLeaseAssignments, getActiveLeaseAssignmentForUnit,
    getLeaseAssignedUnitsFn, getPrimaryLeaseUnitFn, getAncillaryLeaseUnitsFn, isUnitAssignedToActiveLeaseFn,
    addAmendment, updateAmendment, deleteAmendment, setAmendmentStatus,
    activateAmendment, scheduleAmendment, terminateAmendment, revertAmendmentToDraft,
    getLeaseAmendmentsFn, getAmendmentChangesFn,
    addGuarantee, updateGuarantee, deleteGuarantee,
    createReceivableItem, updateReceivableItem, deleteReceivableItem,
    createCashReceipt, allocateCashReceipt, autoAllocateCashReceipt,
    quickPayReceivable,
    addTicket, updateTicket, deleteTicket,
    addVendor, updateVendor, deleteVendor,
    addCostCategory, updateCostCategory, deleteCostCategory,
    addCostEntry, updateCostEntry, deleteCostEntry,
    addAllocationRule, updateAllocationRule, deleteAllocationRule,
    setAllocationRuleUnitSharesFn,
    runAllocation,
    getPropertyStats, getPropertyById, getUnitById, getTenantById,
    getActiveLease, getLeasesByTenant, getLeasesByProperty, getGuaranteeByLease,
    getReceivableItemsByLease, getReceivableItemsByTenant,
    getCashReceiptsByLease, getCashReceiptsByTenant,
    getAllocationsByReceipt, getAllocationsByReceivableItem,
    getLeaseOutstanding, getTenantOutstanding, getTenantUnappliedCredit,
    getReceiptMatchingStatus,
    getTicketsByUnit, getTicketsByProperty, getTicketsByVendor, getVendorById,
    getCostEntriesByProperty, getCostEntriesByUnit,
    getAllocationResultsByUnit, getAllocationResultsByProperty,
    getCostCategoryById, getAllocationRuleById, getUnitSharesByRule,
    getChargesReconciliationsByLease, previewChargesReconciliation, applyChargesReconciliation, deleteChargesReconciliation,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
}
