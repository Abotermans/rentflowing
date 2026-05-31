import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Property, Unit, UnitStatus, Tenant, Lease, Guarantee } from "@/types";
import type { LeaseUnitAssignment, LeaseUnitAssignmentType } from "@/types";
import { ReceivableItem, CashReceipt, ReceiptAllocation, computeReceivableStatus, computeReceiptStatus } from "@/types/receivables";
import { MaintenanceTicket, Vendor } from "@/types/maintenance";
import { CostCategory, CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult } from "@/types/costs";
import { initialProperties, initialUnits, initialTenants, initialLeases, initialGuarantees, initialLeaseUnitAssignments } from "@/data/mockData";
import { initialReceivableItems, initialCashReceipts, initialAllocations } from "@/data/receivablesMockData";
import { initialTickets, initialVendors } from "@/data/maintenanceMockData";
import { initialCostCategories, initialCostEntries, initialAllocationRules, initialAllocationRuleUnitShares, initialCostAllocationResults } from "@/data/costsMockData";
import { autoAllocate } from "@/lib/reconciliation";
import { computeAllocations } from "@/lib/costAllocation";
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
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  guarantees: Guarantee[];
  leaseUnitAssignments: LeaseUnitAssignment[];
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

  // Property CRUD
  addProperty: (p: Omit<Property, "id" | "createdAt" | "updatedAt">) => void;
  updateProperty: (p: Property) => void;
  deleteProperty: (id: string) => void;

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
}

const AppContext = createContext<AppState | null>(null);

let counter = 500;
const genId = (prefix: string) => `${prefix}${++counter}`;
const now = () => new Date().toISOString().split("T")[0];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [leases, setLeases] = useState<Lease[]>(initialLeases);
  const [guarantees, setGuarantees] = useState<Guarantee[]>(initialGuarantees);
  const [leaseUnitAssignments, setLeaseUnitAssignments] = useState<LeaseUnitAssignment[]>(
    () => migrateLegacyLeaseAssignments(initialLeases, initialLeaseUnitAssignments),
  );
  const [receivableItems, setReceivableItems] = useState<ReceivableItem[]>(initialReceivableItems);
  const [cashReceipts, setCashReceipts] = useState<CashReceipt[]>(initialCashReceipts);
  const [allocationsState, setAllocations] = useState<ReceiptAllocation[]>(initialAllocations);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>(initialTickets);
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);

  // Costs & Taxes state
  const [costCategories, setCostCategories] = useState<CostCategory[]>(initialCostCategories);
  const [costEntries, setCostEntries] = useState<CostEntry[]>(initialCostEntries);
  const [allocationRules, setAllocationRules] = useState<AllocationRule[]>(initialAllocationRules);
  const [allocationRuleUnitShares, setAllocationRuleUnitShares] = useState<AllocationRuleUnitShare[]>(initialAllocationRuleUnitShares);
  const [costAllocationResults, setCostAllocationResults] = useState<CostAllocationResult[]>(initialCostAllocationResults);

  // ===== Property CRUD =====
  const addProperty = useCallback((p: Omit<Property, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    setProperties(prev => [...prev, { ...p, id: genId("p"), createdAt: ts, updatedAt: ts }]);
  }, []);
  const updateProperty = useCallback((p: Property) => {
    setProperties(prev => prev.map(x => x.id === p.id ? { ...p, updatedAt: now() } : x));
  }, []);
  const deleteProperty = useCallback((id: string) => {
    setProperties(prev => prev.filter(x => x.id !== id));
    setUnits(prev => prev.filter(x => x.propertyId !== id));
  }, []);

  // ===== Unit CRUD =====
  const addUnit = useCallback((u: Omit<Unit, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    setUnits(prev => [...prev, { ...u, id: genId("u"), createdAt: ts, updatedAt: ts }]);
  }, []);
  const updateUnit = useCallback((u: Unit) => {
    setUnits(prev => prev.map(x => x.id === u.id ? { ...u, updatedAt: now() } : x));
  }, []);
  const deleteUnit = useCallback((id: string) => {
    setUnits(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Tenant CRUD =====
  const addTenant = useCallback((t: Omit<Tenant, "id" | "createdAt" | "updatedAt">): Tenant => {
    const ts = now();
    const created: Tenant = { ...t, id: genId("t"), createdAt: ts, updatedAt: ts };
    setTenants(prev => [...prev, created]);
    return created;
  }, []);
  const updateTenant = useCallback((t: Tenant) => {
    setTenants(prev => prev.map(x => x.id === t.id ? { ...t, updatedAt: now() } : x));
  }, []);
  const deleteTenant = useCallback((id: string) => {
    setTenants(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Lease CRUD =====
  const addLease = useCallback((l: Omit<Lease, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    const created: Lease = { ...l, id: genId("l"), createdAt: ts, updatedAt: ts };
    setLeases(prev => {
      const next = [...prev, created];
      setTenants(prevT => reconcileTenantStatuses([created.primaryTenantId, ...created.coTenantIds], next, prevT));
      return next;
    });
    // Always seed a primary assignment from the legacy unitId so a lease is never unit-less.
    if (created.unitId) {
      setLeaseUnitAssignments(prev => [
        ...prev,
        {
          id: genId("lua"),
          leaseId: created.id,
          unitId: created.unitId,
          assignmentType: "primary",
          isPrimary: true,
          startDate: created.startDate,
          endDate: null,
          rentShare: null,
          chargesShare: null,
          notes: "",
          createdAt: ts,
          updatedAt: ts,
        },
      ]);
    }
    return created;
  }, []);
  const updateLease = useCallback((l: Lease) => {
    setLeases(prev => {
      const old = prev.find(x => x.id === l.id);
      const next = prev.map(x => x.id === l.id ? { ...l, updatedAt: now() } : x);
      const affected = [
        ...(old ? [old.primaryTenantId, ...old.coTenantIds] : []),
        l.primaryTenantId, ...l.coTenantIds,
      ];
      setTenants(prevT => reconcileTenantStatuses(affected, next, prevT));
      return next;
    });
  }, []);
  const deleteLease = useCallback((id: string) => {
    setLeases(prev => prev.filter(x => x.id !== id));
    setLeaseUnitAssignments(prev => prev.filter(a => a.leaseId !== id));
  }, []);

  const confirmMoveOut = useCallback((lease: Lease) => {
    const ts = now();
    const moveOutDate = lease.moveOutActualDate ?? ts;
    setLeases(prev => {
      const next = prev.map(x => x.id === lease.id ? {
        ...lease,
        lifecycleStage: "ended" as const,
        moveOutActualDate: moveOutDate,
        // Preserve an existing legal end date; only fill it from move-out if missing.
        endDate: lease.endDate || moveOutDate,
        updatedAt: ts,
      } : x);
      setTenants(prevT => reconcileTenantStatuses([lease.primaryTenantId, ...lease.coTenantIds], next, prevT));
      return next;
    });
    setUnits(prev => prev.map(x => x.id === lease.unitId ? { ...x, currentStatus: "vacant" as const, availableFrom: moveOutDate, updatedAt: ts } : x));
    // Close out all open assignments for this lease.
    setLeaseUnitAssignments(prev => prev.map(a =>
      a.leaseId === lease.id && !a.endDate
        ? { ...a, endDate: moveOutDate, updatedAt: ts }
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
      return [...others, ...merged, ...closed];
    });
    // Sync legacy lease.unitId to the new primary so existing call sites keep working.
    const primary = draft.find(d => d.isPrimary);
    if (primary) {
      setLeases(prev => prev.map(l =>
        l.id === leaseId ? { ...l, unitId: primary.unitId, propertyId, updatedAt: ts } : l,
      ));
    }
  }, []);

  const getLeaseAssignments = useCallback(
    (leaseId: string) => leaseUnitAssignments.filter(a => a.leaseId === leaseId),
    [leaseUnitAssignments],
  );

  const getActiveLeaseAssignmentForUnit = useCallback(
    (unitId: string) => findActiveLeaseForUnit(unitId, leases, leaseUnitAssignments),
    [leases, leaseUnitAssignments],
  );

  // ===== Guarantee =====
  const addGuarantee = useCallback((g: Omit<Guarantee, "id">) => {
    setGuarantees(prev => [...prev, { ...g, id: genId("g") }]);
  }, []);
  const updateGuarantee = useCallback((g: Guarantee) => {
    setGuarantees(prev => prev.map(x => x.id === g.id ? g : x));
  }, []);
  const deleteGuarantee = useCallback((id: string) => {
    setGuarantees(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Receivable Items =====
  const createReceivableItem = useCallback((r: Omit<ReceivableItem, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    setReceivableItems(prev => [...prev, { ...r, id: genId("ri"), createdAt: ts, updatedAt: ts }]);
  }, []);
  const updateReceivableItem = useCallback((r: ReceivableItem) => {
    setReceivableItems(prev => prev.map(x => x.id === r.id ? { ...r, updatedAt: now() } : x));
  }, []);
  const deleteReceivableItem = useCallback((id: string) => {
    setReceivableItems(prev => prev.filter(x => x.id !== id));
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
      
      setCashReceipts(prev => [...prev, result.updatedReceipt]);
      setReceivableItems(prev => prev.map(ri => {
        const updated = result.updatedReceivables.find(u => u.id === ri.id);
        return updated ?? ri;
      }));
      setAllocations(prev => [
        ...prev,
        ...result.allocations.map(a => ({ ...a, id: genId("al"), createdAt: ts, updatedAt: ts })),
      ]);
    } else {
      setCashReceipts(prev => [...prev, newReceipt]);
    }
  }, [receivableItems]);

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
  }, [cashReceipts, receivableItems]);

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
    setAllocations(prev => [
      ...prev,
      ...result.allocations.map(a => ({ ...a, id: genId("al"), createdAt: ts, updatedAt: ts })),
    ]);
  }, [cashReceipts, receivableItems]);

  // ===== Maintenance =====
  const addTicket = useCallback((t: Omit<MaintenanceTicket, "id">) => {
    setTickets(prev => [...prev, { ...t, id: genId("mt") }]);
  }, []);
  const updateTicket = useCallback((t: MaintenanceTicket) => {
    setTickets(prev => prev.map(x => x.id === t.id ? t : x));
  }, []);
  const deleteTicket = useCallback((id: string) => {
    setTickets(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Vendors =====
  const addVendor = useCallback((v: Omit<Vendor, "id">) => {
    setVendors(prev => [...prev, { ...v, id: genId("v") }]);
  }, []);
  const updateVendor = useCallback((v: Vendor) => {
    setVendors(prev => prev.map(x => x.id === v.id ? v : x));
  }, []);
  const deleteVendor = useCallback((id: string) => {
    setVendors(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Cost Categories CRUD =====
  const addCostCategory = useCallback((c: Omit<CostCategory, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    setCostCategories(prev => [...prev, { ...c, id: genId("cc"), createdAt: ts, updatedAt: ts }]);
  }, []);
  const updateCostCategory = useCallback((c: CostCategory) => {
    setCostCategories(prev => prev.map(x => x.id === c.id ? { ...c, updatedAt: now() } : x));
  }, []);
  const deleteCostCategory = useCallback((id: string) => {
    setCostCategories(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Cost Entries CRUD =====
  const addCostEntry = useCallback((e: Omit<CostEntry, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    const newEntry: CostEntry = { ...e, id: genId("ce"), createdAt: ts, updatedAt: ts };
    setCostEntries(prev => [...prev, newEntry]);
    // Auto-run allocation if property-level with a rule
    if (!newEntry.unitId && newEntry.allocationRuleId) {
      const rule = allocationRules.find(r => r.id === newEntry.allocationRuleId);
      if (rule) {
        const results = computeAllocations(newEntry, rule, units, allocationRuleUnitShares);
        setCostAllocationResults(prev => [
          ...prev,
          ...results.map(r => ({ ...r, id: genId("car"), createdAt: ts, updatedAt: ts })),
        ]);
      }
    }
  }, [allocationRules, units, allocationRuleUnitShares]);

  const updateCostEntry = useCallback((e: CostEntry) => {
    const ts = now();
    setCostEntries(prev => prev.map(x => x.id === e.id ? { ...e, updatedAt: ts } : x));
    // Re-run allocation
    setCostAllocationResults(prev => prev.filter(r => r.costEntryId !== e.id));
    if (!e.unitId && e.allocationRuleId) {
      const rule = allocationRules.find(r => r.id === e.allocationRuleId);
      if (rule) {
        const results = computeAllocations(e, rule, units, allocationRuleUnitShares);
        setCostAllocationResults(prev => [
          ...prev,
          ...results.map(r => ({ ...r, id: genId("car"), createdAt: ts, updatedAt: ts })),
        ]);
      }
    }
  }, [allocationRules, units, allocationRuleUnitShares]);

  const deleteCostEntry = useCallback((id: string) => {
    setCostEntries(prev => prev.filter(x => x.id !== id));
    setCostAllocationResults(prev => prev.filter(r => r.costEntryId !== id));
  }, []);

  // ===== Allocation Rules CRUD =====
  const addAllocationRule = useCallback((r: Omit<AllocationRule, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    setAllocationRules(prev => [...prev, { ...r, id: genId("ar"), createdAt: ts, updatedAt: ts }]);
  }, []);
  const updateAllocationRule = useCallback((r: AllocationRule) => {
    setAllocationRules(prev => prev.map(x => x.id === r.id ? { ...r, updatedAt: now() } : x));
  }, []);
  const deleteAllocationRule = useCallback((id: string) => {
    setAllocationRules(prev => prev.filter(x => x.id !== id));
    setAllocationRuleUnitShares(prev => prev.filter(s => s.allocationRuleId !== id));
  }, []);

  // ===== Allocation Rule Unit Shares =====
  const setAllocationRuleUnitSharesFn = useCallback((ruleId: string, shares: Omit<AllocationRuleUnitShare, "id">[]) => {
    setAllocationRuleUnitShares(prev => [
      ...prev.filter(s => s.allocationRuleId !== ruleId),
      ...shares.map(s => ({ ...s, id: genId("arus") })),
    ]);
  }, []);

  // ===== Run Allocation =====
  const runAllocation = useCallback((costEntryId: string) => {
    const entry = costEntries.find(e => e.id === costEntryId);
    if (!entry || entry.unitId || !entry.allocationRuleId) return;
    const rule = allocationRules.find(r => r.id === entry.allocationRuleId);
    if (!rule) return;
    const ts = now();
    const results = computeAllocations(entry, rule, units, allocationRuleUnitShares);
    setCostAllocationResults(prev => [
      ...prev.filter(r => r.costEntryId !== costEntryId),
      ...results.map(r => ({ ...r, id: genId("car"), createdAt: ts, updatedAt: ts })),
    ]);
  }, [costEntries, allocationRules, units, allocationRuleUnitShares]);

  // ===== Queries =====
  const getPropertyStats = useCallback((propertyId: string): PropertyStats => {
    const propUnits = units.filter(u => u.propertyId === propertyId);
    const total = propUnits.length;
    const counts = { occupied: 0, vacant: 0, reserved: 0, unavailable: 0 };
    propUnits.forEach(u => {
      // Use derived occupancy: if unit has an active lease, count as occupied regardless of manual status
      const hasActiveLease = leases.some(l => l.unitId === u.id && l.lifecycleStage === "active");
      if (hasActiveLease) {
        counts.occupied++;
      } else if (u.currentStatus === "reserved") {
        counts.reserved++;
      } else if (u.currentStatus === "unavailable") {
        counts.unavailable++;
      } else {
        counts.vacant++;
      }
    });
    return { total, ...counts, occupancyRate: total > 0 ? Math.round((counts.occupied / total) * 100) : 0 };
  }, [units, leases]);

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

  const value = useMemo(() => ({
    properties, units, tenants, leases, guarantees,
    leaseUnitAssignments,
    receivableItems, cashReceipts, allocations: allocationsState,
    tickets, vendors,
    costCategories, costEntries, allocationRules, allocationRuleUnitShares, costAllocationResults,
    addProperty, updateProperty, deleteProperty,
    addUnit, updateUnit, deleteUnit,
    addTenant, updateTenant, deleteTenant,
    addLease, updateLease, deleteLease, confirmMoveOut,
    setLeaseUnits: setLeaseUnitsFn,
    getLeaseAssignments,
    getActiveLeaseAssignmentForUnit,
    addGuarantee, updateGuarantee, deleteGuarantee,
    createReceivableItem, updateReceivableItem, deleteReceivableItem,
    createCashReceipt, allocateCashReceipt, autoAllocateCashReceipt,
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
  }), [
    properties, units, tenants, leases, guarantees,
    leaseUnitAssignments,
    receivableItems, cashReceipts, allocationsState,
    tickets, vendors,
    costCategories, costEntries, allocationRules, allocationRuleUnitShares, costAllocationResults,
    addProperty, updateProperty, deleteProperty,
    addUnit, updateUnit, deleteUnit,
    addTenant, updateTenant, deleteTenant,
    addLease, updateLease, deleteLease, confirmMoveOut,
    setLeaseUnitsFn, getLeaseAssignments, getActiveLeaseAssignmentForUnit,
    addGuarantee, updateGuarantee, deleteGuarantee,
    createReceivableItem, updateReceivableItem, deleteReceivableItem,
    createCashReceipt, allocateCashReceipt, autoAllocateCashReceipt,
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
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
}
