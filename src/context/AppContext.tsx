import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Property, Unit, UnitStatus, Tenant, Lease, Guarantee, getTenantFullName } from "@/types";
import type { LeaseUnitAssignment, PropertyOwner, PropertyOwnerLink, PropertyOwnerType } from "@/types";
import { ReceivableItem, CashReceipt, ReceiptAllocation, computeReceivableStatus, computeReceiptStatus, isReceiptAllocatable } from "@/types/receivables";
import { groupReceivableBalances } from "@/lib/receivableBalances";
import { MaintenanceTicket, Vendor } from "@/types/maintenance";
import { CostCategory, CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult } from "@/types/costs";
import type { ChargesReconciliation, ReconciliationResolution } from "@/types/chargesReconciliation";
import { computeReconciliation as engineComputeReconciliation, type ReconciliationBreakdown, type ReconciliationWindow } from "@/lib/chargesReconciliation";
import type { LeaseAmendment, LeaseAmendmentChange, AmendmentStatus, AmendmentFieldName, AmendmentChangeType, AmendmentChangeMetadata } from "@/types/amendments";
import { nextAmendmentNumber } from "@/lib/amendments";
import { planAmendmentActivation } from "@/lib/amendmentActivationPlan";
import { autoAllocate, isReceivableAllocatable, receiptMatchesReceivable, receiptScopeError } from "@/lib/reconciliation";
import {
  generateHistoricalPaidLeaseReceivables,
  generateLeaseReceivables,
  reconcileActivatedAmendmentReceivables,
  getOpenEndedReceivableThroughDate,
  getLeaseBillingSlotKey,
} from "@/lib/leaseReceivables";
import { computeAllocations } from "@/lib/costAllocation";
import { validRecoverablePercentage } from "@/lib/costRecovery";
import { positiveMoneyCents } from "@/lib/validation";
import { GuaranteeAlreadyExistsError } from "@/lib/guaranteeValidation";
import { usePortfolio } from "@/context/PortfolioContext";
import { useSettings } from "@/context/SettingsContext";
import { loadPortfolio, loadLeaseReceivables, mirror, newId, TABLES, createLeaseWithSchedule, saveLeaseWithTenantStatuses, saveLeaseWithAssignments, closeLeaseAtomically, deleteLeaseAtomically, deleteDraftAmendment, changeAmendmentStatus, saveAllocationRuleWithShares, saveCostEntryWithAllocations, saveReceiptAllocations, createChargesReconciliation, deleteChargesReconciliation as deleteChargesReconciliationPersisted, saveAmendmentWithChanges, activateAmendmentWithSchedule, setPropertyOwnerLinksPersisted, savePropertyWithOwnersPersisted as savePropertyWithOwnersRpc } from "@/lib/repo";
import { useToast } from "@/hooks/use-toast";
import { canWritePortfolioData } from "@/hooks/use-portfolio-write-access";
import { deriveTenantStatusFromLeases } from "@/lib/tenantStatus";
import { localTodayISO } from "@/lib/calendarToday";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { classifyUnitOccupancy, getOccupancyRate } from "@/lib/occupancy";
import {
  migrateLegacyLeaseAssignments,
  getActiveLeaseForUnit as findActiveLeaseForUnit,
  assignmentIsActiveOn,
  leaseOccupiesOn,
  receivableHasPlausibleAssignment,
  getLeaseAssignedUnits as libGetLeaseAssignedUnits,
  getPrimaryLeaseUnit as libGetPrimaryLeaseUnit,
  getAncillaryLeaseUnits as libGetAncillaryLeaseUnits,
  isUnitAssignedToActiveLease as libIsUnitAssignedToActiveLease,
} from "@/lib/leaseAssignments";

function reconcileTenantStatuses(
  tenantIds: string[], leases: Lease[], tenants: Tenant[], preserveVersion = false,
): Tenant[] {
  const affected = new Set(tenantIds.filter(Boolean));
  if (affected.size === 0) return tenants;
  const ts = new Date().toISOString();
  return tenants.map(t => {
    if (!affected.has(t.id)) return t;
    const tenantLeases = leases.filter(l => l.primaryTenantId === t.id || l.coTenantIds.includes(t.id));
    const target = deriveTenantStatusFromLeases(tenantLeases);
    if (!target || target === t.status) return t;
    return { ...t, status: target, updatedAt: preserveVersion ? t.updatedAt : ts };
  });
}

function businessDateForLease(leaseId: string, leases: Lease[], properties: Property[]): string | null {
  const lease = leases.find(item => item.id === leaseId);
  const property = properties.find(item => item.id === lease?.propertyId);
  return property ? propertyBusinessDateISO(property) : null;
}

function businessDateForUnit(unitId: string, units: Unit[], properties: Property[]): string | null {
  const unit = units.find(item => item.id === unitId);
  const property = properties.find(item => item.id === unit?.propertyId);
  return property ? propertyBusinessDateISO(property) : null;
}

type LeaseReceivableGenerationAssignment = Pick<LeaseUnitAssignment, "unitId" | "startDate" | "endDate" | "rentShare" | "chargesShare">;

interface AddLeaseOptions {
  receivableAssignments?: readonly LeaseReceivableGenerationAssignment[];
  historicalPaidBackfill?: boolean;
}

type LeaseAssignmentDraft = {
  unitId: string;
  rentShare: number | null;
  chargesShare: number | null;
  startDate?: string;
  endDate?: string | null;
};

interface PropertyStats {
  total: number;
  occupied: number;
  /** Units leased only as ancillary (parking, cellar, …). Not a primary home. */
  ancillaryLeased: number;
  vacant: number;
  reserved: number;
  unavailable: number;
  archived: number;
  occupancyRate: number;
}

interface AppState {
  loading: boolean;
  loadError: string | null;
  retryLoad: () => void;
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
  addPropertyPersisted: (p: Omit<Property, "id" | "createdAt" | "updatedAt">) => Promise<Property>;
  updatePropertyPersisted: (p: Property) => Promise<void>;
  savePropertyWithOwnersPersisted: (p: Property | Omit<Property, "id" | "createdAt" | "updatedAt">, ownerIds: string[]) => Promise<Property>;
  deleteProperty: (id: string) => Promise<void>;

  // Property Owners
  createPropertyOwnerPersisted: (data: { name: string; type: PropertyOwnerType }) => Promise<PropertyOwner>;
  setPropertyOwners: (propertyId: string, ownerIds: string[]) => Promise<void>;
  getOwnersForProperty: (propertyId: string) => PropertyOwner[];

  // Unit CRUD
  addUnitPersisted: (u: Omit<Unit, "id" | "createdAt" | "updatedAt">) => Promise<Unit>;
  addUnitsPersisted: (units: Omit<Unit, "id" | "createdAt" | "updatedAt">[]) => Promise<Unit[]>;
  updateUnitPersisted: (u: Unit) => Promise<void>;
  deleteUnitPersisted: (id: string) => Promise<void>;

  // Tenant CRUD
  addTenantPersisted: (t: Omit<Tenant, "id" | "createdAt" | "updatedAt">) => Promise<Tenant>;
  updateTenantPersisted: (t: Tenant) => Promise<void>;
  deleteTenantPersisted: (id: string) => Promise<void>;

  // Lease CRUD
  addLease: (l: Omit<Lease, "id" | "createdAt" | "updatedAt">, options?: AddLeaseOptions) => Promise<Lease>;
  updateLeasePersisted: (l: Lease, statusReason?: string | null, statusNotes?: string | null) => Promise<void>;
  updateLeaseWithAssignmentsPersisted: (l: Lease, units: LeaseAssignmentDraft[]) => Promise<void>;
  finalizeLeasePersisted: (lease: Lease, options?: { freeUnits?: boolean; vacancyDate?: string; historyReason?: string; historyNotes?: string }) => Promise<void>;
  deleteLease: (id: string) => Promise<void>;
  confirmMoveOut: (lease: Lease) => Promise<void>;

  // Lease unit assignments
  getLeaseAssignments: (leaseId: string) => LeaseUnitAssignment[];
  getActiveLeaseAssignmentForUnit: (unitId: string, onDate?: string) => { lease: Lease; assignment: LeaseUnitAssignment } | undefined;
  getLeaseAssignedUnits: (leaseId: string, opts?: { activeOnly?: boolean; onDate?: string }) => { unit: Unit; assignment: LeaseUnitAssignment }[];
  getPrimaryLeaseUnit: (leaseId: string) => Unit | undefined;
  getAncillaryLeaseUnits: (leaseId: string, opts?: { activeOnly?: boolean }) => { unit: Unit; assignment: LeaseUnitAssignment }[];
  isUnitAssignedToActiveLease: (unitId: string) => boolean;

  // Amendments
  addAmendment: (
    a: Omit<LeaseAmendment, "id" | "amendmentNumber" | "status" | "createdAt" | "updatedAt"> & { status?: AmendmentStatus },
    changes: Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">[],
  ) => Promise<{ amendment: LeaseAmendment; changes: LeaseAmendmentChange[] }>;
  updateAmendment: (a: LeaseAmendment, changes: Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">[]) => Promise<{ amendment: LeaseAmendment; changes: LeaseAmendmentChange[] }>;
  deleteAmendment: (id: string) => Promise<void>;
  activateAmendment: (id: string, pending?: { amendment: LeaseAmendment; changes: LeaseAmendmentChange[] }) => Promise<{ ok: boolean; reason?: string }>;
  scheduleAmendment: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  revertAmendmentToDraft: (id: string) => Promise<void>;
  getLeaseAmendments: (leaseId: string) => LeaseAmendment[];
  getAmendmentChanges: (amendmentId: string) => LeaseAmendmentChange[];

  // Guarantee
  addGuarantee: (g: Omit<Guarantee, "id">) => Promise<void>;
  updateGuarantee: (g: Guarantee) => Promise<void>;

  // Cash Receipts
  createCashReceiptPersisted: (r: Omit<CashReceipt, "id" | "createdAt" | "updatedAt">, autoAllocateFlag?: boolean) => Promise<CashReceipt>;
  
  // Allocation
  allocateCashReceipt: (receiptId: string, manualAllocations: { receivableItemId: string; amount: number; notes?: string }[]) => Promise<void>;
  autoAllocateCashReceipt: (receiptId: string) => Promise<void>;

  // Quick-pay a single receivable with acknowledged persistence
  quickPayReceivable: (params: {
    receivableItemId: string;
    amountReceived: number;
    paymentDate: string;
    sourceType: CashReceipt["sourceType"];
    payerName?: string | null;
    reference?: string | null;
    tenantIdOverride?: string | null;
    leaseIdOverride?: string | null;
  }) => Promise<void>;

  // Maintenance
  addTicketPersisted: (t: Omit<MaintenanceTicket, "id">) => Promise<MaintenanceTicket>;
  updateTicket: (t: MaintenanceTicket) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;

  // Vendors
  addVendorPersisted: (v: Omit<Vendor, "id">) => Promise<Vendor>;
  updateVendor: (v: Vendor) => Promise<void>;
  deleteVendor: (id: string) => Promise<void>;

  // Cost Categories CRUD
  addCostCategoryPersisted: (c: Omit<CostCategory, "id" | "createdAt" | "updatedAt">) => Promise<CostCategory>;
  updateCostCategory: (c: CostCategory) => Promise<void>;
  deleteCostCategory: (id: string) => Promise<void>;

  // Cost Entries CRUD
  addCostEntryPersisted: (e: Omit<CostEntry, "id" | "createdAt" | "updatedAt">) => Promise<CostEntry>;
  updateCostEntry: (e: CostEntry) => Promise<void>;
  deleteCostEntry: (id: string) => Promise<void>;

  // Allocation Rules CRUD
  saveAllocationRuleWithSharesPersisted: (r: AllocationRule | Omit<AllocationRule, "id" | "createdAt" | "updatedAt">, shares: Omit<AllocationRuleUnitShare, "id">[]) => Promise<AllocationRule>;
  addAllocationRulePersisted: (r: Omit<AllocationRule, "id" | "createdAt" | "updatedAt">) => Promise<AllocationRule>;
  updateAllocationRule: (r: AllocationRule) => Promise<void>;
  deleteAllocationRule: (id: string) => Promise<void>;

  // Allocation Rule Unit Shares
  setAllocationRuleUnitShares: (ruleId: string, shares: Omit<AllocationRuleUnitShare, "id">[]) => Promise<void>;

  // Queries
  getPropertyStats: (propertyId: string) => PropertyStats;
  getPropertyById: (id: string) => Property | undefined;
  getUnitById: (id: string) => Unit | undefined;
  getTenantById: (id: string) => Tenant | undefined;
  getActiveLease: (unitId: string, onDate?: string) => Lease | undefined;
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
  getLeaseOutstanding: (leaseId: string) => ReturnType<typeof groupReceivableBalances>;
  getTenantOutstanding: (tenantId: string) => ReturnType<typeof groupReceivableBalances>;
  getTenantUnappliedCredit: (tenantId: string, currencyCode: string, leaseId?: string) => number;
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
  }) => Promise<ChargesReconciliation | null>;
  deleteChargesReconciliation: (id: string) => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const genId = (_prefix?: string) => newId();
const now = localTodayISO;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { currentPortfolioId, currentPortfolio, loading: portfolioLoading } = usePortfolio();
  const { receivableLeadDays, t } = useSettings();
  const { toast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedPortfolioId, setLoadedPortfolioId] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingAmendmentActivations = useRef(new Set<string>());
  const reportedAmendmentActivationErrors = useRef(new Set<string>());
  const activePortfolioId = useRef(currentPortfolioId);
  activePortfolioId.current = currentPortfolioId;
  const retryLoad = useCallback(() => setLoadAttempt(attempt => attempt + 1), []);

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
      setLoadedPortfolioId(null);
      setLoadError(null);
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
    setLoadError(null);
    loadPortfolio(currentPortfolioId).then(snap => {
      if (cancelled) return;
      setProperties(snap.properties);
      setPropertyOwnersState(snap.propertyOwners);
      setPropertyOwnerLinks(snap.propertyOwnerLinks);
      setUnits(snap.units);
      setTenants(reconcileTenantStatuses(snap.tenants.map(t => t.id), snap.leases, snap.tenants, true));
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
      setLoadedPortfolioId(currentPortfolioId);
      setLoading(false);
    }).catch(err => {
      console.error("[AppContext] loadPortfolio failed:", err);
      if (!cancelled) {
        setLoadedPortfolioId(null);
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [currentPortfolioId, portfolioLoading, loadAttempt]);

  // ===== Property CRUD =====
  const addPropertyPersisted = useCallback(async (p: Omit<Property, "id" | "createdAt" | "updatedAt">) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a property.");
    const ts = now();
    const created: Property = {
      ...p,
      portfolioId: p.portfolioId ?? currentPortfolioId ?? undefined,
      id: genId("p"), createdAt: ts, updatedAt: ts,
    };
    const error = await mirror.insertAsync(TABLES.properties, created, currentPortfolioId);
    if (error) throw error;
    setProperties(prev => [...prev, created]);
    return created;
  }, [currentPortfolioId]);
  const updatePropertyPersisted = useCallback(async (p: Property) => {
    const next = { ...p, updatedAt: now() };
    const error = await mirror.updateAsync(TABLES.properties, p.id, next);
    if (error) throw error;
    setProperties(prev => prev.map(x => x.id === p.id ? next : x));
  }, []);
  const savePropertyWithOwnersPersisted = useCallback(async (
    p: Property | Omit<Property, "id" | "createdAt" | "updatedAt">,
    ownerIds: string[],
  ): Promise<Property> => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before saving a property.");
    const existing = "id" in p ? properties.find(item => item.id === p.id) : undefined;
    if ("id" in p && !existing) throw new Error("Property changed since this form was loaded. Reload and retry.");
    const ts = now();
    const draft: Property = "id" in p
      ? { ...p, portfolioId: currentPortfolioId }
      : { ...p, id: genId("p"), portfolioId: currentPortfolioId, createdAt: ts, updatedAt: ts };
    const expectedLinks = existing ? propertyOwnerLinks.filter(link => link.propertyId === existing.id) : [];
    let saved: { property: Property; links: PropertyOwnerLink[] };
    try {
      saved = await savePropertyWithOwnersRpc(draft, ownerIds, "id" in p ? p.updatedAt : null, expectedLinks, currentPortfolioId);
    } catch (error) {
      retryLoad();
      throw error;
    }
    setProperties(prev => existing
      ? prev.map(item => item.id === saved.property.id ? saved.property : item)
      : [...prev, saved.property]);
    setPropertyOwnerLinks(prev => [...prev.filter(link => link.propertyId !== saved.property.id), ...saved.links]);
    return saved.property;
  }, [currentPortfolioId, properties, propertyOwnerLinks, retryLoad]);
  const deleteProperty = useCallback(async (id: string) => {
    const hasRelatedData = units.some(x => x.propertyId === id)
      || leases.some(x => x.propertyId === id)
      || costEntries.some(x => x.propertyId === id)
      || allocationRules.some(x => x.propertyId === id)
      || costAllocationResults.some(x => x.propertyId === id)
      || receivableItems.some(x => x.propertyId === id)
      || cashReceipts.some(x => x.propertyId === id)
      || tickets.some(x => x.propertyId === id);
    if (hasRelatedData) throw new Error("Archive this property or remove its linked records before deleting it.");
    const error = await mirror.removeAsync(TABLES.properties, id);
    if (error) throw error;
    const unitIds = new Set(units.filter(x => x.propertyId === id).map(x => x.id));
    const propertyLeases = leases.filter(x => x.propertyId === id);
    const leaseIds = new Set(propertyLeases.map(x => x.id));
    const amendmentIds = new Set(amendments.filter(x => leaseIds.has(x.leaseId)).map(x => x.id));
    const receivableIds = new Set(receivableItems
      .filter(x => x.propertyId === id || (x.leaseId != null && leaseIds.has(x.leaseId)))
      .map(x => x.id));
    const receiptIds = new Set(cashReceipts
      .filter(x => x.propertyId === id || (x.leaseId != null && leaseIds.has(x.leaseId)))
      .map(x => x.id));
    const costEntryIds = new Set(costEntries.filter(x => x.propertyId === id).map(x => x.id));
    const allocationRuleIds = new Set(allocationRules.filter(x => x.propertyId === id).map(x => x.id));
    setProperties(prev => prev.filter(x => x.id !== id));
    setUnits(prev => prev.filter(x => !unitIds.has(x.id)));
    setPropertyOwnerLinks(prev => prev.filter(x => x.propertyId !== id));
    setLeases(prev => prev.filter(x => !leaseIds.has(x.id)));
    setGuarantees(prev => prev.filter(x => !leaseIds.has(x.leaseId)));
    setLeaseUnitAssignments(prev => prev.filter(x => !leaseIds.has(x.leaseId) && !unitIds.has(x.unitId)));
    setAmendments(prev => prev.filter(x => !leaseIds.has(x.leaseId)));
    setAmendmentChanges(prev => prev.filter(x => !amendmentIds.has(x.amendmentId)));
    setReceivableItems(prev => prev.filter(x => !receivableIds.has(x.id)));
    setCashReceipts(prev => prev.filter(x => !receiptIds.has(x.id)));
    setAllocations(prev => prev.filter(x => !receiptIds.has(x.cashReceiptId) && !receivableIds.has(x.receivableItemId)));
    setTickets(prev => prev.filter(x => x.propertyId !== id));
    setCostEntries(prev => prev.filter(x => !costEntryIds.has(x.id)));
    setAllocationRules(prev => prev.filter(x => !allocationRuleIds.has(x.id)));
    setAllocationRuleUnitShares(prev => prev.filter(x => !allocationRuleIds.has(x.allocationRuleId)));
    setCostAllocationResults(prev => prev.filter(x => x.propertyId !== id && !costEntryIds.has(x.costEntryId)));
    setChargesReconciliations(prev => prev.filter(x => !leaseIds.has(x.leaseId)));
    // FK ON DELETE CASCADE handles units/leases/etc. in the DB.
  }, [units, leases, amendments, receivableItems, cashReceipts, costEntries, allocationRules, costAllocationResults, tickets]);

  // ===== Property Owners =====
  const createPropertyOwnerPersisted = useCallback(async (data: { name: string; type: PropertyOwnerType }) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a property owner.");
    const ts = now();
    const created: PropertyOwner = {
      id: genId("po"), name: data.name.trim(), type: data.type,
      portfolioId: currentPortfolioId, createdAt: ts, updatedAt: ts,
    };
    const error = await mirror.insertAsync(TABLES.propertyOwners, created, currentPortfolioId);
    if (error) throw error;
    setPropertyOwnersState(prev => [...prev, created]);
    return created;
  }, [currentPortfolioId]);

  const setPropertyOwners = useCallback(async (propertyId: string, ownerIds: string[]) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before changing property owners.");
    const existingForProp = propertyOwnerLinks.filter(l => l.propertyId === propertyId);
    let saved: PropertyOwnerLink[];
    try {
      saved = await setPropertyOwnerLinksPersisted(propertyId, ownerIds, existingForProp, currentPortfolioId);
    } catch (error) {
      retryLoad();
      throw error;
    }
    setPropertyOwnerLinks(prev => [...prev.filter(l => l.propertyId !== propertyId), ...saved]);
  }, [currentPortfolioId, propertyOwnerLinks, retryLoad]);

  const getOwnersForProperty = useCallback((propertyId: string): PropertyOwner[] => {
    const ownerIds = propertyOwnerLinks
      .filter(l => l.propertyId === propertyId)
      .map(l => l.ownerId);
    const byId = new Map(propertyOwners.map(o => [o.id, o] as const));
    return ownerIds.map(id => byId.get(id)).filter((x): x is PropertyOwner => !!x);
  }, [propertyOwners, propertyOwnerLinks]);

  // ===== Unit CRUD =====
  const addUnitPersisted = useCallback(async (u: Omit<Unit, "id" | "createdAt" | "updatedAt">) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a unit.");
    const ts = now();
    const created: Unit = {
      ...u,
      id: genId("u"), createdAt: ts, updatedAt: ts,
    };
    const error = await mirror.insertAsync(TABLES.units, created, currentPortfolioId);
    if (error) throw error;
    setUnits(prev => [...prev, created]);
    return created;
  }, [currentPortfolioId]);
  const addUnitsPersisted = useCallback(async (newUnits: Omit<Unit, "id" | "createdAt" | "updatedAt">[]) => {
    if (newUnits.length === 0) return [];
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding units.");
    const ts = now();
    const created = newUnits.map(u => ({ ...u, id: genId("u"), createdAt: ts, updatedAt: ts }));
    const error = await mirror.insertManyAsync(TABLES.units, created, currentPortfolioId);
    if (error) throw error;
    setUnits(prev => [...prev, ...created]);
    return created;
  }, [currentPortfolioId]);
  const updateUnitPersisted = useCallback(async (u: Unit) => {
    const next = { ...u, updatedAt: now() };
    const error = await mirror.updateAsync(TABLES.units, u.id, next);
    if (error) throw error;
    setUnits(prev => prev.map(x => x.id === u.id ? next : x));
  }, []);
  const deleteUnitPersisted = useCallback(async (id: string) => {
    const hasRelatedData = leaseUnitAssignments.some(item => item.unitId === id)
      || leases.some(item => item.unitId === id)
      || receivableItems.some(item => item.unitId === id)
      || cashReceipts.some(item => item.unitId === id)
      || costEntries.some(item => item.unitId === id)
      || costAllocationResults.some(item => item.unitId === id)
      || tickets.some(item => item.unitId === id);
    if (hasRelatedData) throw new Error("Mark this unit unavailable or remove its linked records before deleting it.");
    const error = await mirror.removeAsync(TABLES.units, id);
    if (error) throw error;
    const receivableIds = new Set(receivableItems.filter(x => x.unitId === id).map(x => x.id));
    setUnits(prev => prev.filter(x => x.id !== id));
    setLeaseUnitAssignments(prev => prev.filter(x => x.unitId !== id));
    setReceivableItems(prev => prev.filter(x => x.unitId !== id));
    setAllocations(prev => prev.filter(x => !receivableIds.has(x.receivableItemId)));
    setTickets(prev => prev.filter(x => x.unitId !== id));
    setCostEntries(prev => prev.filter(x => x.unitId !== id));
    setCostAllocationResults(prev => prev.filter(x => x.unitId !== id));
  }, [leaseUnitAssignments, leases, receivableItems, cashReceipts, costEntries, costAllocationResults, tickets]);

  // ===== Tenant CRUD =====
  const addTenantPersisted = useCallback(async (t: Omit<Tenant, "id" | "createdAt" | "updatedAt">): Promise<Tenant> => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a tenant.");
    const ts = now();
    const created: Tenant = {
      ...t,
      portfolioId: t.portfolioId ?? currentPortfolioId ?? undefined,
      id: genId("t"), createdAt: ts, updatedAt: ts,
    };
    const saved = await mirror.insertReturningAsync<Tenant>(TABLES.tenants, created, currentPortfolioId);
    setTenants(prev => [...prev, saved]);
    return saved;
  }, [currentPortfolioId]);
  const updateTenantPersisted = useCallback(async (t: Tenant) => {
    const saved = await mirror.updateReturningAsync<Tenant>(TABLES.tenants, t.id, t, t.updatedAt);
    setTenants(prev => prev.map(x => x.id === t.id ? saved : x));
  }, []);
  const deleteTenantPersisted = useCallback(async (id: string) => {
    if (leases.some(item => item.primaryTenantId === id || item.coTenantIds.includes(id))
      || receivableItems.some(item => item.tenantId === id)
      || cashReceipts.some(item => item.tenantId === id)) {
      throw new Error("Mark this tenant as former or remove linked leases and payments before deleting it.");
    }
    const error = await mirror.removeAsync(TABLES.tenants, id);
    if (error) throw error;
    setTenants(prev => prev.filter(x => x.id !== id));
  }, [leases, receivableItems, cashReceipts]);

  // ===== Lease CRUD =====
  const persistTenantStatuses = useCallback(async (tenantIds: string[], nextLeases: Lease[]): Promise<Tenant[]> => {
    const next = reconcileTenantStatuses(tenantIds, nextLeases, tenants);
    const changed = next
      .map((after, index) => ({ before: tenants[index], after }))
      .filter(({ before, after }) => before !== after);
    const saved: Array<{ before: Tenant; after: Tenant }> = [];
    try {
      for (const change of changed) {
        const after = await mirror.updateReturningAsync<Tenant>(TABLES.tenants, change.after.id, change.after, change.before.updatedAt);
        saved.push({ before: change.before, after });
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const { before } of saved.reverse()) {
        const restoreError = await mirror.updateAsync(TABLES.tenants, before.id, before);
        if (restoreError) rollbackErrors.push(restoreError.message);
      }
      if (saved.length) retryLoad();
      if (rollbackErrors.length) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}; tenant rollback failed: ${rollbackErrors.join("; ")}`);
      }
      throw error;
    }
    const savedById = new Map(saved.map(({ after }) => [after.id, after]));
    return next.map(item => savedById.get(item.id) ?? item);
  }, [tenants, retryLoad]);
  const addLease = useCallback(async (l: Omit<Lease, "id" | "createdAt" | "updatedAt">, options: AddLeaseOptions = {}) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a lease.");
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
    const assignmentDrafts = options.receivableAssignments?.length
      ? options.receivableAssignments
      : created.unitId
        ? [{ unitId: created.unitId, startDate: created.startDate, endDate: null,
            rentShare: created.monthlyRent, chargesShare: created.monthlyCharges }]
        : [];
    if (assignmentDrafts.length === 0) throw new Error("Add at least one unit to the lease.");
    const assignments: LeaseUnitAssignment[] = assignmentDrafts.map(draft => ({
      id: genId("lua"), leaseId: created.id, unitId: draft.unitId,
      startDate: draft.startDate || created.startDate, endDate: draft.endDate ?? null,
      rentShare: draft.rentShare, chargesShare: draft.chargesShare, notes: "",
      createdAt: ts, updatedAt: ts,
    }));
    // Auto-generate the monthly rent/charges receivables, plus a prepayment
    // CashReceipt + allocations if the lease carries an advance. This is what
    // makes "Rent paid until X" real — the prepayment satisfies actual receivables
    // instead of being a phantom discount on the lease record.
    const property = properties.find(p => p.id === created.propertyId);
    if (!property) throw new Error("Lease property was not found. Reload before creating the lease.");
    const currencyCode = property.currencyCode;
    const billingToday = propertyBusinessDateISO(property);
    const receivableAssignments = assignments;
    const historicalResult = options.historicalPaidBackfill
      ? generateHistoricalPaidLeaseReceivables(created, {
          currencyCode,
          genId,
          today: billingToday,
          assignments: receivableAssignments,
          units,
          existingReceivables: receivableItems,
        })
      : null;
    if (historicalResult?.unassignedCycleStarts.length) {
      throw new Error(`No main unit is assigned for historical billing cycle ${historicalResult.unassignedCycleStarts[0]}. Check the unit dates.`);
    }
    const historical = historicalResult?.receivables ?? [];
    const generatedKeys = new Set([
      ...receivableItems.filter(item => item.origin === "lease-schedule").map(getLeaseBillingSlotKey),
      ...historical.map(getLeaseBillingSlotKey),
    ]);
    const scheduledResult = generateLeaseReceivables(created, {
      currencyCode,
      genId,
      today: billingToday,
      leadDays: receivableLeadDays,
      assignments: receivableAssignments,
      units,
      openEndedThroughDate: created.endDate ? undefined : getOpenEndedReceivableThroughDate(billingToday, created.rentFormula, created.startDate, receivableLeadDays, created.dueDayOfMonth),
    });
    if (scheduledResult.unassignedCycleStarts.length) {
      throw new Error(`No main unit is assigned for billing cycle ${scheduledResult.unassignedCycleStarts[0]}. Check the unit dates.`);
    }
    const scheduled = scheduledResult.receivables;
    const receivables = [
      ...historical,
      ...scheduled.filter(receivable => {
        const key = getLeaseBillingSlotKey(receivable);
        if (generatedKeys.has(key)) return false;
        generatedKeys.add(key);
        return true;
      }),
    ];
    const nextTenants = reconcileTenantStatuses(
      [created.primaryTenantId, ...created.coTenantIds], [...leases, created], tenants,
    );
    const changedTenants = nextTenants
      .map((tenant, index) => ({ tenant, original: tenants[index] }))
      .filter(({ tenant, original }) => tenant !== original)
      .map(({ tenant, original }) => {
        if (!original.updatedAt) throw new Error("Tenant version is missing. Reload before creating this lease.");
        return { tenant, expectedUpdatedAt: original.updatedAt };
      });
    const saved = await createLeaseWithSchedule(created, assignments, receivables, changedTenants, currentPortfolioId);
    const savedTenants = new Map(saved.tenants.map(tenant => [tenant.id, tenant]));
    setLeases(prev => [...prev, saved.lease]);
    setTenants(nextTenants.map(tenant => savedTenants.get(tenant.id) ?? tenant));
    setLeaseUnitAssignments(prev => [...prev, ...saved.assignments]);
    if (saved.receivables.length > 0) setReceivableItems(prev => [...prev, ...saved.receivables]);
    return saved.lease;
  }, [properties, tenants, leases, units, currentPortfolioId, receivableLeadDays, receivableItems]);
  const applyLeaseUpdate = useCallback((lease: Lease) => {
    setLeases(prev => prev.map(item => item.id === lease.id ? lease : item));
  }, []);
  const updateLeasePersisted = useCallback(async (l: Lease, statusReason: string | null = null, statusNotes: string | null = null) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before editing a lease.");
    const patched = { ...l, updatedAt: now() };
    const old = leases.find(item => item.id === l.id);
    if (!old) throw new Error("Lease not found");
    if (old.lifecycleStage !== patched.lifecycleStage && (patched.lifecycleStage === "ended" || patched.lifecycleStage === "terminated")) {
      throw new Error("Use the lease end or termination action to close a lease.");
    }
    const affected = [old.primaryTenantId, ...old.coTenantIds, patched.primaryTenantId, ...patched.coTenantIds];
    const nextTenants = reconcileTenantStatuses(affected, leases.map(item => item.id === l.id ? patched : item), tenants);
    const changedTenants = nextTenants
      .map((item, index) => ({ item, expectedUpdatedAt: tenants[index].updatedAt, changed: item !== tenants[index] }))
      .filter(item => item.changed);
    const saved = await saveLeaseWithTenantStatuses(patched, changedTenants, currentPortfolioId, old.updatedAt, statusReason, statusNotes);
    const persistedTenants = new Map(saved.tenants.map(item => [item.id, item]));
    applyLeaseUpdate(saved.lease);
    setTenants(nextTenants.map(item => persistedTenants.get(item.id) ?? item));
  }, [leases, tenants, currentPortfolioId, applyLeaseUpdate]);
  const updateLeaseWithAssignmentsPersisted = useCallback(async (l: Lease, draft: LeaseAssignmentDraft[]) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before editing a lease.");
    const old = leases.find(item => item.id === l.id);
    if (!old || !l.updatedAt) throw new Error("Lease version is missing. Reload before editing it.");
    if (old.lifecycleStage !== l.lifecycleStage && (l.lifecycleStage === "ended" || l.lifecycleStage === "terminated")) {
      throw new Error("Use the lease end or termination action to close a lease.");
    }
    if (draft.length === 0 || new Set(draft.map(item => item.unitId)).size !== draft.length) {
      throw new Error("Select at least one unique unit before saving this lease.");
    }
    const today = businessDateForLease(l.id, leases, properties);
    if (!today) throw new Error("Lease property not found. Reload before editing.");
    const ts = now();
    const existing = leaseUnitAssignments.filter(item => item.leaseId === l.id);
    const matched = new Set<string>();
    const edited = draft.map(item => {
      const match = existing.find(row => row.unitId === item.unitId &&
        item.startDate === row.startDate && !matched.has(row.id))
        ?? existing.find(row => row.unitId === item.unitId &&
          (!row.endDate || row.endDate >= today) && !matched.has(row.id));
      if (match) {
        matched.add(match.id);
        return {
          ...match,
          startDate: item.startDate ?? match.startDate,
          endDate: item.endDate === undefined ? match.endDate : item.endDate,
          rentShare: item.rentShare,
          chargesShare: item.chargesShare,
        };
      }
      return {
        id: genId("lua"), leaseId: l.id, unitId: item.unitId,
        startDate: item.startDate ?? l.startDate,
        endDate: item.endDate ?? null,
        rentShare: item.rentShare, chargesShare: item.chargesShare,
        notes: "", createdAt: ts, updatedAt: ts,
      } satisfies LeaseUnitAssignment;
    });
    const retained = existing.filter(item => !matched.has(item.id)).map(item => {
      if (item.endDate && item.endDate < today) return item;
      return { ...item, endDate: item.startDate > today ? item.startDate : today };
    });
    const assignments = [...edited, ...retained];
    const scheduleFields = [
      "lifecycleStage", "startDate", "endDate", "monthlyRent", "monthlyCharges",
      "rentFormula", "pricingMode", "chargesBillingMode", "dueDayOfMonth",
      "billingTenantId", "primaryTenantId", "indexationEnabled", "indexationFrequency",
      "indexationBaseDate", "indexationBaseIndex", "indexationCurrentIndex",
      "indexationCapPercent", "indexationRoundingMode", "noticeGiven",
      "intendedMoveOutDate", "moveOutScheduledDate", "moveOutActualDate",
    ] as const;
    const oldAssignmentsById = new Map(existing.map(item => [item.id, item]));
    const assignmentsChanged = assignments.some(item => {
      const prior = oldAssignmentsById.get(item.id);
      return !prior || prior.unitId !== item.unitId || prior.startDate !== item.startDate ||
        prior.endDate !== item.endDate || prior.rentShare !== item.rentShare ||
        prior.chargesShare !== item.chargesShare;
    });
    const billingChanged = assignmentsChanged || scheduleFields.some(key => old[key] !== l[key]);
    const oldScheduled = receivableItems.filter(item => item.leaseId === l.id && item.origin === "lease-schedule");
    const changedLeaseDates = (["startDate", "endDate", "intendedMoveOutDate", "moveOutScheduledDate", "moveOutActualDate"] as const)
      .flatMap(key => old[key] === l[key] ? [] : [old[key], l[key]]);
    const changedAssignmentDates = assignments.flatMap(item => {
      const prior = oldAssignmentsById.get(item.id);
      if (!prior) return [item.startDate, item.endDate];
      return [
        ...(prior.startDate !== item.startDate ? [prior.startDate, item.startDate] : []),
        ...(prior.endDate !== item.endDate ? [prior.endDate, item.endDate] : []),
      ];
    });
    const earlierCutoff = [...changedLeaseDates, ...changedAssignmentDates]
      .filter((date): date is string => !!date && date < today)
      .sort()[0];
    const scheduleFrom = earlierCutoff ?? today;
    const protectedFutureReceivables = billingChanged && oldScheduled.some(item =>
      item.dueDate >= scheduleFrom && (
        item.status !== "open" && item.status !== "overdue" ||
        item.allocatedAmount > 0 || allocationsState.some(allocation => allocation.receivableItemId === item.id)
      ),
    );
    let unassignedCycleStarts: string[] = [];
    const schedule = billingChanged ? (() => {
      const property = properties.find(item => item.id === l.propertyId);
      if (!property) throw new Error("Lease property was not found. Reload before editing.");
      const regeneratedResult = generateLeaseReceivables(l, {
        currencyCode: property.currencyCode, genId, today,
        leadDays: receivableLeadDays, assignments,
        units,
        openEndedThroughDate: l.endDate ? undefined : getOpenEndedReceivableThroughDate(
          today, l.rentFormula, l.startDate, receivableLeadDays, l.dueDayOfMonth,
        ),
      });
      unassignedCycleStarts = regeneratedResult.unassignedCycleStarts;
      const regenerated = regeneratedResult.receivables;
      const planned = reconcileActivatedAmendmentReceivables(
        receivableItems, regenerated, l.id, scheduleFrom,
        new Set(allocationsState.map(item => item.receivableItemId)),
      );
      return {
        fromDate: scheduleFrom,
        expected: oldScheduled.filter(item => item.dueDate >= scheduleFrom),
        removed: planned.removedReceivables,
        fresh: planned.freshReceivables,
      };
    })() : null;
    const removedScheduleIds = new Set(schedule?.removed.map(item => item.id) ?? []);
    const newlyOrphaned = oldScheduled.find(item => item.status !== "cancelled"
      && !removedScheduleIds.has(item.id)
      && receivableHasPlausibleAssignment(item, existing)
      && !receivableHasPlausibleAssignment(item, assignments));
    if (newlyOrphaned) {
      const unitCode = units.find(item => item.id === newlyOrphaned.unitId)?.unitCode ?? newlyOrphaned.unitId;
      throw new Error(t("leases.assignmentReceivableConflict")
        .replace("{unit}", unitCode ?? "unknown")
        .replace("{date}", newlyOrphaned.dueDate));
    }
    if (unassignedCycleStarts.length) {
      throw new Error(`No main unit is assigned for billing cycle ${unassignedCycleStarts[0]}. Check the unit dates.`);
    }
    const affected = [old.primaryTenantId, ...old.coTenantIds, l.primaryTenantId, ...l.coTenantIds];
    const nextTenants = reconcileTenantStatuses(affected, leases.map(item => item.id === l.id ? l : item), tenants);
    const changedTenants = nextTenants
      .map((item, index) => ({ item, expectedUpdatedAt: tenants[index].updatedAt, changed: item !== tenants[index] }))
      .filter(item => item.changed);
    const saved = await saveLeaseWithAssignments(l, changedTenants, existing, assignments, currentPortfolioId, l.updatedAt, schedule);
    applyLeaseUpdate(saved.lease);
    const persistedTenants = new Map(saved.tenants.map(item => [item.id, item]));
    setTenants(nextTenants.map(item => persistedTenants.get(item.id) ?? item));
    setLeaseUnitAssignments(prev => [...prev.filter(item => item.leaseId !== l.id), ...saved.assignments]);
    if (schedule) {
      const removedIds = new Set(saved.removedReceivableIds);
      setReceivableItems(prev => [...prev.filter(item => !removedIds.has(item.id)), ...saved.receivables]);
      if (protectedFutureReceivables) {
        toast({ title: t("leases.futureReceivablesReview"), description: t("leases.futureReceivablesPreserved") });
      }
    }
  }, [leases, tenants, leaseUnitAssignments, receivableItems, allocationsState, properties, units, receivableLeadDays, currentPortfolioId, applyLeaseUpdate, toast, t]);
  const finalizeLeasePersisted = useCallback(async (
    lease: Lease,
    options: { freeUnits?: boolean; vacancyDate?: string; historyReason?: string; historyNotes?: string } = {},
  ) => {
    if (lease.lifecycleStage !== "ended" && lease.lifecycleStage !== "terminated") {
      throw new Error("Only ended or terminated leases can be finalized");
    }
    const priorLease = leases.find(item => item.id === lease.id);
    if (!priorLease) throw new Error("Lease not found");
    const vacancyDate = options.vacancyDate ?? lease.moveOutActualDate ?? lease.endDate;
    if (!vacancyDate) throw new Error("An end date is required");
    if (vacancyDate < lease.startDate) throw new Error("The end date cannot precede the lease start date");
    const today = businessDateForLease(lease.id, leases, properties);
    if (!today) throw new Error("Lease property not found. Reload before closing.");
    if (vacancyDate > today) throw new Error("A lease cannot be ended or terminated before its end date");
    if (!currentPortfolioId) throw new Error("Select a portfolio before closing a lease.");
    if (!priorLease.updatedAt) throw new Error("Lease version is missing. Reload before closing it.");
    const saved = await closeLeaseAtomically(
      lease, currentPortfolioId, priorLease.updatedAt, vacancyDate, options.freeUnits !== false,
      options.historyReason ?? null, options.historyNotes ?? null,
    );
    applyLeaseUpdate(saved.lease);
    const savedTenants = new Map(saved.tenants.map(item => [item.id, item]));
    setTenants(prev => prev.map(item => savedTenants.get(item.id) ?? item));
    setLeaseUnitAssignments(prev => [...prev.filter(item => item.leaseId !== lease.id), ...saved.assignments]);
    setAmendments(prev => [...prev.filter(item => item.leaseId !== lease.id), ...saved.amendments]);
    const savedUnits = new Map(saved.units.map(item => [item.id, item]));
    setUnits(prev => prev.map(item => savedUnits.get(item.id) ?? item));
    try {
      if (!currentPortfolioId) throw new Error("No portfolio selected");
      const confirmedReceivables = await loadLeaseReceivables(lease.id, currentPortfolioId);
      setReceivableItems(prev => [
        ...prev.filter(item => item.leaseId !== lease.id),
        ...confirmedReceivables,
      ]);
    } catch {
      retryLoad();
    }
  }, [leases, properties, currentPortfolioId, applyLeaseUpdate, retryLoad]);
  const deleteLease = useCallback(async (id: string) => {
    const old = leases.find(item => item.id === id);
    if (!old) throw new Error("Lease not found");
    if (!currentPortfolioId) throw new Error("Select a portfolio before deleting a lease.");
    if (!old.updatedAt) throw new Error("Lease version is missing. Reload before deleting it.");
    const savedTenants = await deleteLeaseAtomically(id, currentPortfolioId, old.updatedAt);
    const tenantsById = new Map(savedTenants.map(item => [item.id, item]));
    const amendmentIds = new Set(amendments.filter(a => a.leaseId === id).map(a => a.id));
    setLeases(prev => prev.filter(x => x.id !== id));
    setTenants(prev => prev.map(item => tenantsById.get(item.id) ?? item));
    setLeaseUnitAssignments(prev => prev.filter(a => a.leaseId !== id));
    setGuarantees(prev => prev.filter(g => g.leaseId !== id));
    setAmendments(prev => prev.filter(a => a.leaseId !== id));
    setAmendmentChanges(prev => prev.filter(c => !amendmentIds.has(c.amendmentId)));
    setReceivableItems(prev => prev.map(r => r.leaseId === id ? { ...r, leaseId: null } : r));
    setCashReceipts(prev => prev.map(r => r.leaseId === id ? { ...r, leaseId: null } : r));
    setChargesReconciliations(prev => prev.filter(r => r.leaseId !== id));
    // Lease-linked financial rows use ON DELETE SET NULL, while contractual children cascade.
  }, [amendments, leases, currentPortfolioId]);

  const confirmMoveOut = useCallback(async (lease: Lease) => {
    const ts = now();
    const moveOutDate = lease.moveOutActualDate ?? ts;
    const patched: Lease = {
      ...lease,
      lifecycleStage: "ended" as const,
      moveOutActualDate: moveOutDate,
      endDate: lease.endDate && lease.endDate < moveOutDate ? lease.endDate : moveOutDate,
      updatedAt: ts,
    };
    await finalizeLeasePersisted(patched, { vacancyDate: moveOutDate });
  }, [finalizeLeasePersisted]);

  // ===== Lease Unit Assignments =====
  const getLeaseAssignments = useCallback(
    (leaseId: string) => leaseUnitAssignments.filter(a => a.leaseId === leaseId),
    [leaseUnitAssignments],
  );

  const getActiveLeaseAssignmentForUnit = useCallback(
    (unitId: string, onDate?: string) => findActiveLeaseForUnit(
      unitId, leases, leaseUnitAssignments,
      onDate ?? businessDateForUnit(unitId, units, properties) ?? propertyBusinessDateISO(null),
    ),
    [leases, leaseUnitAssignments, units, properties],
  );

  const getLeaseAssignedUnitsFn = useCallback(
    (leaseId: string, opts: { activeOnly?: boolean; onDate?: string } = {}) =>
      libGetLeaseAssignedUnits(leaseId, leaseUnitAssignments, units, {
        ...opts, onDate: opts.onDate ?? businessDateForLease(leaseId, leases, properties) ?? propertyBusinessDateISO(null),
      }),
    [leaseUnitAssignments, units, leases, properties],
  );
  const getPrimaryLeaseUnitFn = useCallback(
    (leaseId: string) => libGetPrimaryLeaseUnit(leaseId, leaseUnitAssignments, units),
    [leaseUnitAssignments, units],
  );
  const getAncillaryLeaseUnitsFn = useCallback(
    (leaseId: string, opts: { activeOnly?: boolean } = {}) =>
      libGetAncillaryLeaseUnits(leaseId, leaseUnitAssignments, units, {
        ...opts, onDate: businessDateForLease(leaseId, leases, properties) ?? propertyBusinessDateISO(null),
      }),
    [leaseUnitAssignments, units, leases, properties],
  );
  const isUnitAssignedToActiveLeaseFn = useCallback(
    (unitId: string) => libIsUnitAssignedToActiveLease(
      unitId, leases, leaseUnitAssignments,
      businessDateForUnit(unitId, units, properties) ?? propertyBusinessDateISO(null),
    ),
    [leases, leaseUnitAssignments, units, properties],
  );

  // ===== Amendments =====
  const buildChanges = (amendmentId: string, draft: Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">[], ts: string): LeaseAmendmentChange[] =>
    draft.map(d => ({ ...d, id: genId("amc"), amendmentId, createdAt: ts, updatedAt: ts }));

  const addAmendment = useCallback(
    async (a: Omit<LeaseAmendment, "id" | "amendmentNumber" | "status" | "createdAt" | "updatedAt"> & { status?: AmendmentStatus }, changesDraft) => {
      if (!currentPortfolioId) throw new Error("Select a portfolio before adding an amendment.");
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
      const saved = await saveAmendmentWithChanges(created, builtChanges, currentPortfolioId);
      setAmendments(prev => [...prev, saved.amendment]);
      setAmendmentChanges(prev => [...prev, ...saved.changes]);
      return saved;
    },
    [amendments, currentPortfolioId],
  );

  const updateAmendment = useCallback(
    async (a: LeaseAmendment, changesDraft: Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">[]) => {
      if (!currentPortfolioId) throw new Error("Select a portfolio before editing an amendment.");
      const originalAmendment = amendments.find(row => row.id === a.id);
      if (!originalAmendment) throw new Error("Amendment not found");
      const ts = now();
      const patched = { ...a, updatedAt: ts };
      const builtChanges = buildChanges(a.id, changesDraft, ts);
      const saved = await saveAmendmentWithChanges(patched, builtChanges, currentPortfolioId, originalAmendment.updatedAt);
      setAmendments(prev => prev.map(x => x.id === a.id ? saved.amendment : x));
      setAmendmentChanges(prev => [
        ...prev.filter(c => c.amendmentId !== a.id),
        ...saved.changes,
      ]);
      return saved;
    },
    [currentPortfolioId, amendments],
  );

  const deleteAmendment = useCallback(async (id: string) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before deleting an amendment.");
    const amendment = amendments.find(item => item.id === id);
    if (!amendment) throw new Error("Amendment not found. Reload before retrying.");
    if (amendment.status !== "draft") throw new Error("Only draft amendments can be deleted.");
    await deleteDraftAmendment(amendment, currentPortfolioId);
    setAmendments(prev => prev.filter(a => a.id !== id));
    setAmendmentChanges(prev => prev.filter(c => c.amendmentId !== id));
  }, [amendments, currentPortfolioId]);

  /** Activate an amendment and persist its lease, assignment, and schedule effects. */
  const activateAmendment = useCallback(async (id: string, pending?: { amendment: LeaseAmendment; changes: LeaseAmendmentChange[] }): Promise<{ ok: boolean; reason?: string }> => {
    if (!currentPortfolioId) return { ok: false, reason: "Portfolio not found" };
    const amendment = pending?.amendment ?? amendments.find(item => item.id === id);
    const businessDate = amendment && businessDateForLease(amendment.leaseId, leases, properties);
    if (!businessDate) return { ok: false, reason: "Amendment property not found. Reload before activating." };
    const result = planAmendmentActivation(id, {
      properties, units, tenants, leases, guarantees, leaseUnitAssignments,
      amendments, amendmentChanges, receivableItems, cashReceipts,
      allocations: allocationsState, tickets, costCategories, costEntries,
      allocationRules, allocationRuleUnitShares, costAllocationResults,
    }, {
      businessDate,
      timestamp: now(),
      genId,
      receivableLeadDays,
      pending,
    });
    if (result.ok === false) return { ok: false, reason: result.reason };
    const plan = result.plan;
    try {
      const saved = await activateAmendmentWithSchedule(
        id, plan.lease, plan.changedAssignments, plan.changedAmendments,
        plan.removedReceivables, plan.freshReceivables, plan.changedTenants,
        currentPortfolioId, plan.originalLeaseUpdatedAt,
      );
      const persistedAssignments = new Map(saved.assignments.map(item => [item.id, item]));
      const persistedAmendments = new Map(saved.amendments.map(item => [item.id, item]));
      const persistedReceivables = new Map(saved.receivables.map(item => [item.id, item]));
      const persistedTenants = new Map(saved.tenants.map(item => [item.id, item]));
      setLeaseUnitAssignments(plan.assignments.map(item => persistedAssignments.get(item.id) ?? item));
      setAmendments(plan.amendments.map(item => persistedAmendments.get(item.id) ?? item));
      setLeases(prev => prev.map(item => item.id === saved.lease.id ? saved.lease : item));
      setTenants(plan.tenants.map(item => persistedTenants.get(item.id) ?? item));
      setReceivableItems(plan.receivables.map(item => persistedReceivables.get(item.id) ?? item));
    } catch (error) {
      retryLoad();
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true };
  }, [
    amendments, amendmentChanges, leases, leaseUnitAssignments, properties, units, tenants,
    guarantees, receivableItems, cashReceipts, allocationsState, tickets,
    costCategories, costEntries, allocationRules, allocationRuleUnitShares,
    costAllocationResults, currentPortfolioId, receivableLeadDays, retryLoad,
  ]);
  const setAmendmentStatus = useCallback(async (id: string, status: AmendmentStatus) => {
    const existing = amendments.find(item => item.id === id);
    if (!existing) throw new Error("Amendment not found");
    if (!currentPortfolioId) throw new Error("No active portfolio");
    if (status !== "draft" && status !== "scheduled") {
      throw new Error("Applied amendments can only change status through lease lifecycle transactions.");
    }
    const saved = await changeAmendmentStatus(existing, currentPortfolioId, status);
    setAmendments(prev => prev.map(item => item.id === id ? saved : item));
  }, [amendments, currentPortfolioId]);

  const scheduleAmendment = useCallback(async (id: string): Promise<{ ok: boolean; reason?: string }> => {
    const am = amendments.find(a => a.id === id);
    if (!am) return { ok: false, reason: "Amendment not found" };
    if (!am.effectiveDate) return { ok: false, reason: "Effective date is required" };
    const todayISO = businessDateForLease(am.leaseId, leases, properties);
    if (!todayISO) return { ok: false, reason: "Amendment property not found. Reload before scheduling." };
    if (am.effectiveDate <= todayISO) {
      // Date already reached — go straight to active.
      return activateAmendment(id);
    }
    try {
      await setAmendmentStatus(id, "scheduled");
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true };
  }, [amendments, leases, properties, setAmendmentStatus, activateAmendment]);

  const revertAmendmentToDraft = useCallback(async (id: string) => {
    await setAmendmentStatus(id, "draft");
  }, [setAmendmentStatus]);

  // Auto-activate scheduled amendments once their effectiveDate is reached.
  useEffect(() => {
    if (!currentPortfolioId || loadedPortfolioId !== currentPortfolioId || loadError || !canWritePortfolioData(currentPortfolio?.role)) return;
    const tick = () => {
      const dueAmendments = amendments
        .filter(a => {
          const today = businessDateForLease(a.leaseId, leases, properties);
          return a.status === "scheduled" && !!today && a.effectiveDate <= today;
        })
        .sort((x, y) => {
          if (x.effectiveDate !== y.effectiveDate) return x.effectiveDate.localeCompare(y.effectiveDate);
          return x.amendmentNumber - y.amendmentNumber;
        });
      const seenLeases = new Set<string>();
      for (const nextDue of dueAmendments) {
        if (seenLeases.has(nextDue.leaseId)) continue;
        seenLeases.add(nextDue.leaseId);
        if (pendingAmendmentActivations.current.has(nextDue.id)) continue;
        pendingAmendmentActivations.current.add(nextDue.id);
        void activateAmendment(nextDue.id).then(result => {
          if (!result.ok) {
            const key = `${nextDue.id}:${result.reason ?? "unknown"}`;
            if (!reportedAmendmentActivationErrors.current.has(key)) {
              reportedAmendmentActivationErrors.current.add(key);
              toast({
                title: t("amendments.scheduledActivationFailed"),
                description: `${nextDue.title}: ${result.reason ?? "Unknown error"}`,
                variant: "destructive",
              });
            }
          }
        }).catch(error => {
          const reason = error instanceof Error ? error.message : String(error);
          const key = `${nextDue.id}:${reason}`;
          if (!reportedAmendmentActivationErrors.current.has(key)) {
            reportedAmendmentActivationErrors.current.add(key);
            toast({ title: t("amendments.scheduledActivationFailed"), description: `${nextDue.title}: ${reason}`, variant: "destructive" });
          }
        }).finally(() => pendingAmendmentActivations.current.delete(nextDue.id));
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [amendments, leases, properties, activateAmendment, currentPortfolioId, currentPortfolio?.role, loadedPortfolioId, loadError, toast, t]);

  const getLeaseAmendmentsFn = useCallback(
    (leaseId: string) => amendments.filter(a => a.leaseId === leaseId),
    [amendments],
  );
  const getAmendmentChangesFn = useCallback(
    (amendmentId: string) => amendmentChanges.filter(c => c.amendmentId === amendmentId),
    [amendmentChanges],
  );

  // ===== Guarantee =====
  const addGuarantee = useCallback(async (g: Omit<Guarantee, "id">) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a guarantee.");
    if (guarantees.some(existing => existing.leaseId === g.leaseId)) {
      throw new GuaranteeAlreadyExistsError();
    }
    const created: Guarantee = { ...g, id: genId("g") };
    const error = await mirror.insertAsync(TABLES.guarantees, created, currentPortfolioId);
    if (error?.code === "23505" && error.message.includes("guarantees_one_per_lease_idx")) {
      throw new GuaranteeAlreadyExistsError();
    }
    if (error) throw error;
    setGuarantees(prev => [...prev, created]);
  }, [currentPortfolioId, guarantees]);
  const updateGuarantee = useCallback(async (g: Guarantee) => {
    const error = await mirror.updateAsync(TABLES.guarantees, g.id, g);
    if (error) throw error;
    setGuarantees(prev => prev.map(x => x.id === g.id ? g : x));
  }, []);

  // ===== Cash Receipts =====
  const createCashReceiptPersisted = useCallback(async (r: Omit<CashReceipt, "id" | "createdAt" | "updatedAt">, autoAllocateFlag = false) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before recording a receipt.");
    if (!Number.isFinite(r.amountReceived) || r.amountReceived <= 0 || !r.paymentDate) {
      throw new Error("Receipt requires a positive amount and a payment date.");
    }
    if (positiveMoneyCents(r.amountReceived) === null) {
      throw new Error("Receipt amount must use at most two decimal places.");
    }
    const scopeError = receiptScopeError(r, leases, properties, units);
    if (scopeError) throw new Error(scopeError);
    const ts = now();
    const newReceipt: CashReceipt = { ...r, id: genId("cr"), createdAt: ts, updatedAt: ts };

    if (autoAllocateFlag) {
      const openItems = receivableItems.filter(ri => {
        if (!isReceivableAllocatable(ri)) return false;
        return receiptMatchesReceivable(newReceipt, ri);
      });

      const result = autoAllocate(newReceipt, openItems);
      const newAllocs = result.allocations.map(a => ({ ...a, id: genId("al"), createdAt: ts, updatedAt: ts }));
      const allocatedIds = new Set(newAllocs.map(row => row.receivableItemId));
      const updates = result.updatedReceivables
        .filter(item => allocatedIds.has(item.id))
        .map(item => {
          const original = receivableItems.find(row => row.id === item.id);
          if (!original) throw new Error("Receivable changed. Reload payments before retrying.");
          return { item, expectedUpdatedAt: original.updatedAt };
        });
      const saved = await saveReceiptAllocations(result.updatedReceipt, updates, newAllocs, currentPortfolioId);
      setCashReceipts(prev => [...prev, saved.receipt]);
      const savedItems = new Map(saved.receivables.map(item => [item.id, item]));
      setReceivableItems(prev => prev.map(item => savedItems.get(item.id) ?? item));
      setAllocations(prev => [...prev, ...saved.allocations]);
      return saved.receipt;
    }

    const saved = await saveReceiptAllocations(newReceipt, [], [], currentPortfolioId);
    setCashReceipts(prev => [...prev, saved.receipt]);
    return saved.receipt;
  }, [receivableItems, currentPortfolioId, leases, properties, units]);

  const persistReceiptAllocation = useCallback(async (
    originalReceipt: CashReceipt | null,
    updatedReceipt: CashReceipt,
    updatedReceivables: ReceivableItem[],
    newAllocations: ReceiptAllocation[],
  ) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before recording a payment.");
    const updates = updatedReceivables.map(item => {
      const original = receivableItems.find(row => row.id === item.id);
      if (!original) throw new Error("Receivable changed. Reload payments before retrying.");
      return { item, expectedUpdatedAt: original.updatedAt };
    });
    const saved = await saveReceiptAllocations(
      updatedReceipt, updates, newAllocations, currentPortfolioId, originalReceipt?.updatedAt,
    );
    setCashReceipts(prev => originalReceipt
      ? prev.map(row => row.id === saved.receipt.id ? saved.receipt : row)
      : [...prev, saved.receipt]);
    const itemUpdates = new Map(saved.receivables.map(item => [item.id, item]));
    setReceivableItems(prev => prev.map(item => itemUpdates.get(item.id) ?? item));
    setAllocations(prev => [...prev, ...saved.allocations]);
  }, [currentPortfolioId, receivableItems]);

  // ===== Manual Allocation =====
  const allocateCashReceipt = useCallback(async (receiptId: string, manualAllocations: { receivableItemId: string; amount: number; notes?: string }[]) => {
    const ts = now();
    const receipt = cashReceipts.find(r => r.id === receiptId);
    if (!receipt) throw new Error("Receipt no longer exists. Refresh payments before allocating it.");
    if (!isReceiptAllocatable(receipt)) throw new Error("This receipt is not available for allocation. Refresh payments before retrying.");
    if (manualAllocations.some(allocation => !Number.isFinite(allocation.amount) || allocation.amount <= 0)) {
      throw new Error("Each allocation must have a positive, finite amount.");
    }
    if (new Set(manualAllocations.map(allocation => allocation.receivableItemId)).size !== manualAllocations.length) {
      throw new Error("Each receivable can appear only once in an allocation request.");
    }

    let remainingCents = Math.round(receipt.unmatchedAmount * 100);
    const newAllocations: ReceiptAllocation[] = [];
    const riUpdates = new Map<string, ReceivableItem>();

    for (const ma of manualAllocations) {
      const ri = receivableItems.find(r => r.id === ma.receivableItemId);
      if (!ri || !isReceivableAllocatable(ri) || !receiptMatchesReceivable(receipt, ri)) {
        throw new Error("A selected receivable is no longer eligible for this receipt. Refresh payments and try again.");
      }
      const requestedCents = Math.round(ma.amount * 100);
      if (Math.abs(ma.amount * 100 - requestedCents) > 0.000001) {
        throw new Error("Allocation amounts must use at most two decimal places.");
      }
      if (requestedCents > remainingCents || requestedCents > Math.round(ri.outstandingAmount * 100)) {
        throw new Error("An allocation exceeds the available receipt or receivable balance. Refresh payments and try again.");
      }
      const allocAmount = requestedCents / 100;
      remainingCents -= requestedCents;
      const updatedRi: ReceivableItem = {
        ...ri,
        allocatedAmount: (Math.round(ri.allocatedAmount * 100) + requestedCents) / 100,
        outstandingAmount: (Math.round(ri.outstandingAmount * 100) - requestedCents) / 100,
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
      unmatchedAmount: remainingCents / 100,
      updatedAt: ts,
    };
    updatedReceipt.status = computeReceiptStatus(updatedReceipt);

    if (newAllocations.length === 0) {
      throw new Error("Select at least one receivable to allocate this receipt.");
    }
    await persistReceiptAllocation(receipt, updatedReceipt, [...riUpdates.values()], newAllocations);
  }, [cashReceipts, receivableItems, persistReceiptAllocation]);

  // ===== Auto-Allocation =====
  const autoAllocateCashReceipt = useCallback(async (receiptId: string) => {
    const receipt = cashReceipts.find(r => r.id === receiptId);
    if (!receipt) throw new Error("Receipt no longer exists. Refresh payments before allocating it.");
    if (!isReceiptAllocatable(receipt)) throw new Error("This receipt is not available for allocation. Refresh payments before retrying.");

    const openItems = receivableItems.filter(ri => {
      if (!isReceivableAllocatable(ri)) return false;
      return receiptMatchesReceivable(receipt, ri);
    });

    const ts = now();
    const result = autoAllocate(receipt, openItems);

    const newAllocs = result.allocations.map(a => ({ ...a, id: genId("al"), createdAt: ts, updatedAt: ts }));
    if (newAllocs.length === 0) return;
    const allocatedIds = new Set(newAllocs.map(allocation => allocation.receivableItemId));
    await persistReceiptAllocation(
      receipt,
      result.updatedReceipt,
      result.updatedReceivables.filter(item => allocatedIds.has(item.id)),
      newAllocs,
    );
  }, [cashReceipts, receivableItems, persistReceiptAllocation]);

  // ===== Quick-pay a single receivable (targeted allocation + surplus auto) =====
  const quickPayReceivable = useCallback(async (params: {
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
    if (!ri) throw new Error("Receivable no longer exists. Refresh payments before recording it.");
    if (!isReceivableAllocatable(ri)) throw new Error("This receivable is no longer open for payment. Refresh payments before retrying.");
    if (!Number.isFinite(params.amountReceived) || params.amountReceived <= 0 || !params.paymentDate) {
      throw new Error("Receipt requires a positive amount and a payment date.");
    }
    const amountCents = positiveMoneyCents(params.amountReceived);
    if (amountCents === null) throw new Error("Receipt amount must use at most two decimal places.");

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
      amountReceived: amountCents / 100,
      currencyCode: ri.currencyCode,
      payerName: params.payerName ?? null,
      payerIban: null,
      payerBic: null,
      reference: params.reference ?? null,
      remittanceInformation: null,
      endToEndReference: null,
      status: "unmatched",
      unmatchedAmount: amountCents / 100,
      notes: "",
      importBatchId: null,
      rawBankTransactionId: null,
      createdAt: ts,
      updatedAt: ts,
    };
    const scopeError = receiptScopeError(receipt, leases, properties, units);
    if (scopeError) throw new Error(scopeError);

    // 1) Targeted allocation to the clicked receivable first.
    const targetedCents = Math.min(amountCents, Math.round(ri.outstandingAmount * 100));
    const riUpdates = new Map<string, ReceivableItem>();
    const newAllocations: ReceiptAllocation[] = [];
    let remainingCents = amountCents;

    if (targetedCents > 0) {
      const updatedRi: ReceivableItem = {
        ...ri,
        allocatedAmount: (Math.round(ri.allocatedAmount * 100) + targetedCents) / 100,
        outstandingAmount: (Math.round(ri.outstandingAmount * 100) - targetedCents) / 100,
        updatedAt: ts,
      };
      updatedRi.status = computeReceivableStatus(updatedRi);
      riUpdates.set(ri.id, updatedRi);
      newAllocations.push({
        id: genId("al"),
        cashReceiptId: receipt.id,
        receivableItemId: ri.id,
        allocatedAmount: targetedCents / 100,
        allocationType: "manual",
        allocationDate: ts,
        notes: "",
        createdAt: ts,
        updatedAt: ts,
      });
      remainingCents -= targetedCents;
    }

    // 2) Surplus → auto-allocate to other open items on same lease, else same tenant, by priority.
    if (remainingCents > 0 && (receipt.leaseId || receipt.tenantId)) {
      const otherOpen = receivableItems
        .filter(o => {
          if (o.id === ri.id) return false;
          if (!isReceivableAllocatable(o)) return false;
          return receiptMatchesReceivable(receipt, o);
        })
        .sort((a, b) => (a.priority - b.priority) || a.dueDate.localeCompare(b.dueDate));

      for (const o of otherOpen) {
        if (remainingCents <= 0) break;
        const allocatedCents = Math.min(remainingCents, Math.round(o.outstandingAmount * 100));
        if (allocatedCents <= 0) continue;
        const updated: ReceivableItem = {
          ...o,
          allocatedAmount: (Math.round(o.allocatedAmount * 100) + allocatedCents) / 100,
          outstandingAmount: (Math.round(o.outstandingAmount * 100) - allocatedCents) / 100,
          updatedAt: ts,
        };
        updated.status = computeReceivableStatus(updated);
        riUpdates.set(o.id, updated);
        newAllocations.push({
          id: genId("al"),
          cashReceiptId: receipt.id,
          receivableItemId: o.id,
          allocatedAmount: allocatedCents / 100,
          allocationType: "automatic",
          allocationDate: ts,
          notes: "",
          createdAt: ts,
          updatedAt: ts,
        });
        remainingCents -= allocatedCents;
      }
    }

    const finalReceipt: CashReceipt = {
      ...receipt,
      unmatchedAmount: remainingCents / 100,
    };
    finalReceipt.status = computeReceiptStatus(finalReceipt);

    await persistReceiptAllocation(null, finalReceipt, [...riUpdates.values()], newAllocations);
  }, [receivableItems, leases, properties, units, persistReceiptAllocation]);

  // ===== Maintenance =====
  const addTicketPersisted = useCallback(async (t: Omit<MaintenanceTicket, "id">) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a maintenance ticket.");
    const created: MaintenanceTicket = { ...t, id: genId("mt") };
    const error = await mirror.insertAsync(TABLES.tickets, created, currentPortfolioId);
    if (error) throw error;
    setTickets(prev => [...prev, created]);
    return created;
  }, [currentPortfolioId]);
  const updateTicket = useCallback(async (t: MaintenanceTicket) => {
    const error = await mirror.updateAsync(TABLES.tickets, t.id, t);
    if (error) throw error;
    setTickets(prev => prev.map(x => x.id === t.id ? t : x));
  }, []);
  const deleteTicket = useCallback(async (id: string) => {
    const error = await mirror.removeAsync(TABLES.tickets, id);
    if (error) throw error;
    setTickets(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Vendors =====
  const addVendorPersisted = useCallback(async (v: Omit<Vendor, "id">) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a vendor.");
    const created: Vendor = {
      ...v,
      portfolioId: v.portfolioId ?? currentPortfolioId ?? undefined,
      id: genId("v"),
    };
    const error = await mirror.insertAsync(TABLES.vendors, created, currentPortfolioId);
    if (error) throw error;
    setVendors(prev => [...prev, created]);
    return created;
  }, [currentPortfolioId]);
  const updateVendor = useCallback(async (v: Vendor) => {
    const error = await mirror.updateAsync(TABLES.vendors, v.id, v);
    if (error) throw error;
    setVendors(prev => prev.map(x => x.id === v.id ? v : x));
  }, []);
  const deleteVendor = useCallback(async (id: string) => {
    const error = await mirror.removeAsync(TABLES.vendors, id);
    if (error) throw error;
    setVendors(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Cost Categories CRUD =====
  const addCostCategoryPersisted = useCallback(async (c: Omit<CostCategory, "id" | "createdAt" | "updatedAt">) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a cost category.");
    const ts = now();
    const created: CostCategory = {
      ...c,
      portfolioId: c.portfolioId ?? currentPortfolioId ?? undefined,
      id: genId("cc"), createdAt: ts, updatedAt: ts,
    };
    const error = await mirror.insertAsync(TABLES.costCategories, created, currentPortfolioId);
    if (error) throw error;
    setCostCategories(prev => [...prev, created]);
    return created;
  }, [currentPortfolioId]);
  const updateCostCategory = useCallback(async (c: CostCategory) => {
    const next = { ...c, updatedAt: now() };
    const error = await mirror.updateAsync(TABLES.costCategories, c.id, next);
    if (error) throw error;
    setCostCategories(prev => prev.map(x => x.id === c.id ? next : x));
  }, []);
  const deleteCostCategory = useCallback(async (id: string) => {
    const error = await mirror.removeAsync(TABLES.costCategories, id);
    if (error) throw error;
    setCostCategories(prev => prev.filter(x => x.id !== id));
  }, []);

  // ===== Cost Entries CRUD =====
  const addCostEntryPersisted = useCallback(async (e: Omit<CostEntry, "id" | "createdAt" | "updatedAt">) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding a cost entry.");
    if (e.unitId && e.allocationRuleId) {
      throw new Error("A unit-specific cost cannot also use a property allocation rule.");
    }
    if (!validRecoverablePercentage(e.recoveryType, e.recoverablePercentage)) {
      throw new Error("Partial recovery requires a tenant-recoverable percentage greater than 0 and less than 100.");
    }
    const selectedRule = e.allocationRuleId
      ? allocationRules.find(rule => rule.id === e.allocationRuleId)
      : null;
    if (e.allocationRuleId && (!selectedRule || selectedRule.propertyId !== e.propertyId)) {
      throw new Error(t("costs.validation.allocationRuleInvalid"));
    }
    const property = properties.find(item => item.id === e.propertyId);
    if (!property) throw new Error(t("costs.validation.propertyMissing"));
    const ts = now();
    const newEntry: CostEntry = { ...e, id: genId("ce"), createdAt: ts, updatedAt: ts };
    const allocationRows = (() => {
      if (newEntry.unitId || !newEntry.allocationRuleId) return [];
      if (!selectedRule) throw new Error(t("costs.validation.allocationRuleInvalid"));
      return computeAllocations(newEntry, selectedRule, units, allocationRuleUnitShares, property, { leases, assignments: leaseUnitAssignments })
        .map(r => ({ ...r, id: genId("car"), createdAt: ts, updatedAt: ts }));
    })();
    const saved = await saveCostEntryWithAllocations(newEntry, allocationRows, currentPortfolioId);
    setCostEntries(prev => [...prev, saved.entry]);
    if (saved.allocations.length > 0) setCostAllocationResults(prev => [...prev, ...saved.allocations]);
    return saved.entry;
  }, [allocationRules, units, allocationRuleUnitShares, properties, leases, leaseUnitAssignments, currentPortfolioId, t]);

  const updateCostEntry = useCallback(async (e: CostEntry) => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before changing a cost entry.");
    if (e.unitId && e.allocationRuleId) {
      throw new Error("A unit-specific cost cannot also use a property allocation rule.");
    }
    if (!validRecoverablePercentage(e.recoveryType, e.recoverablePercentage)) {
      throw new Error("Partial recovery requires a tenant-recoverable percentage greater than 0 and less than 100.");
    }
    const selectedRule = e.allocationRuleId
      ? allocationRules.find(rule => rule.id === e.allocationRuleId)
      : null;
    if (e.allocationRuleId && (!selectedRule || selectedRule.propertyId !== e.propertyId)) {
      throw new Error(t("costs.validation.allocationRuleInvalid"));
    }
    const property = properties.find(item => item.id === e.propertyId);
    if (!property) throw new Error(t("costs.validation.propertyMissing"));
    const originalEntry = costEntries.find(row => row.id === e.id);
    if (!originalEntry) throw new Error("Cost entry not found");
    const ts = now();
    const next = { ...e, updatedAt: ts };
    const stamped = (() => {
      if (e.unitId || !e.allocationRuleId) return [];
      if (!selectedRule) throw new Error(t("costs.validation.allocationRuleInvalid"));
      return computeAllocations(e, selectedRule, units, allocationRuleUnitShares, property, { leases, assignments: leaseUnitAssignments })
        .map(r => ({ ...r, id: genId("car"), createdAt: ts, updatedAt: ts }));
    })();
    const saved = await saveCostEntryWithAllocations(next, stamped, currentPortfolioId, originalEntry.updatedAt);
    setCostEntries(prev => prev.map(x => x.id === e.id ? saved.entry : x));
    setCostAllocationResults(prev => [...prev.filter(r => r.costEntryId !== e.id), ...saved.allocations]);
  }, [allocationRules, units, allocationRuleUnitShares, properties, leases, leaseUnitAssignments, currentPortfolioId, costEntries, t]);

  const deleteCostEntry = useCallback(async (id: string) => {
    const error = await mirror.removeAsync(TABLES.costEntries, id);
    if (error) throw error;
    setCostEntries(prev => prev.filter(x => x.id !== id));
    setCostAllocationResults(prev => prev.filter(r => r.costEntryId !== id));
  }, []);

  // ===== Allocation Rules CRUD =====
  const saveAllocationRuleWithSharesPersisted = useCallback(async (
    r: AllocationRule | Omit<AllocationRule, "id" | "createdAt" | "updatedAt">,
    shares: Omit<AllocationRuleUnitShare, "id">[],
  ): Promise<AllocationRule> => {
    if (!currentPortfolioId) throw new Error("Select a portfolio before adding an allocation rule.");
    const existing = "id" in r ? allocationRules.find(rule => rule.id === r.id) : undefined;
    if ("id" in r && !existing) throw new Error("Allocation rule no longer exists. Reload before retrying.");
    const ts = now();
    const rule: AllocationRule = existing
      ? { ...r, id: existing.id, createdAt: existing.createdAt, updatedAt: ts }
      : { ...r, id: genId("ar"), createdAt: ts, updatedAt: ts };
    const stamped = shares.map(share => ({ ...share, allocationRuleId: rule.id, id: genId("arus") }));
    const saved = await saveAllocationRuleWithShares(rule, stamped, currentPortfolioId, existing?.updatedAt);
    setAllocationRules(prev => existing
      ? prev.map(item => item.id === saved.rule.id ? saved.rule : item)
      : [...prev, saved.rule]);
    setAllocationRuleUnitShares(prev => [
      ...prev.filter(share => share.allocationRuleId !== rule.id),
      ...saved.shares,
    ]);
    return saved.rule;
  }, [allocationRules, currentPortfolioId]);
  const addAllocationRulePersisted = useCallback(async (r: Omit<AllocationRule, "id" | "createdAt" | "updatedAt">) => {
    return saveAllocationRuleWithSharesPersisted(r, []);
  }, [saveAllocationRuleWithSharesPersisted]);
  const updateAllocationRule = useCallback(async (r: AllocationRule) => {
    const shares = r.method === "manual-percentage"
      ? allocationRuleUnitShares.filter(share => share.allocationRuleId === r.id)
      : [];
    await saveAllocationRuleWithSharesPersisted(r, shares);
  }, [allocationRuleUnitShares, saveAllocationRuleWithSharesPersisted]);
  const deleteAllocationRule = useCallback(async (id: string) => {
    const error = await mirror.removeAsync(TABLES.allocationRules, id);
    if (error) throw error;
    setAllocationRules(prev => prev.filter(x => x.id !== id));
    setAllocationRuleUnitShares(prev => prev.filter(s => s.allocationRuleId !== id));
  }, []);

  // ===== Allocation Rule Unit Shares =====
  const setAllocationRuleUnitSharesFn = useCallback(async (ruleId: string, shares: Omit<AllocationRuleUnitShare, "id">[]) => {
    const rule = allocationRules.find(item => item.id === ruleId);
    if (!rule) throw new Error("Allocation rule no longer exists. Reload before retrying.");
    await saveAllocationRuleWithSharesPersisted(rule, shares);
  }, [allocationRules, saveAllocationRuleWithSharesPersisted]);

  // ===== Queries =====
  const getPropertyStats = useCallback((propertyId: string): PropertyStats => {
    const propUnits = units.filter(u => u.propertyId === propertyId);
    const total = propUnits.length;
    const counts = { occupied: 0, ancillaryLeased: 0, vacant: 0, reserved: 0, unavailable: 0, archived: 0 };
    const todayISO = propertyBusinessDateISO(properties.find(property => property.id === propertyId));
    const activeLeaseIds = new Set(
      leases.filter(l => l.propertyId === propertyId && leaseOccupiesOn(l, todayISO)).map(l => l.id),
    );
    propUnits.forEach(u => {
      const active = leaseUnitAssignments.find(a =>
        a.unitId === u.id &&
        assignmentIsActiveOn(a, todayISO) &&
        activeLeaseIds.has(a.leaseId),
      );
      counts[classifyUnitOccupancy(u, Boolean(active))]++;
    });
    return {
      total,
      ...counts,
      occupancyRate: getOccupancyRate(counts.occupied, counts.ancillaryLeased, total),
    };
  }, [units, leases, leaseUnitAssignments, properties]);

  const getPropertyById = useCallback((id: string) => properties.find(p => p.id === id), [properties]);
  const getUnitById = useCallback((id: string) => units.find(u => u.id === id), [units]);
  const getTenantById = useCallback((id: string) => tenants.find(t => t.id === id), [tenants]);
  const getActiveLease = useCallback((unitId: string, onDate?: string) => {
    const found = findActiveLeaseForUnit(
      unitId, leases, leaseUnitAssignments,
      onDate ?? businessDateForUnit(unitId, units, properties) ?? propertyBusinessDateISO(null),
    );
    return found?.lease;
  }, [leases, leaseUnitAssignments, units, properties]);
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
    const lease = leases.find(item => item.id === leaseId);
    const today = propertyBusinessDateISO(properties.find(property => property.id === lease?.propertyId));
    return groupReceivableBalances(items, () => today);
  }, [receivableItems, leases, properties]);

  const getTenantOutstanding = useCallback((tenantId: string) => {
    const items = receivableItems.filter(ri => ri.tenantId === tenantId);
    return groupReceivableBalances(items, item =>
      propertyBusinessDateISO(properties.find(property => property.id === item.propertyId)));
  }, [receivableItems, properties]);

  const getTenantUnappliedCredit = useCallback((tenantId: string, currencyCode: string, leaseId?: string) => {
    return cashReceipts
      .filter(cr => (cr.tenantId === tenantId || (leaseId && cr.leaseId === leaseId)) && cr.currencyCode === currencyCode
        && (!leaseId || !cr.leaseId || cr.leaseId === leaseId) && isReceiptAllocatable(cr))
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
      return engineComputeReconciliation(lease, window, receivableItems, costAllocationResults, costEntries, {
        assignments: leaseUnitAssignments, units,
      });
    },
    [leases, receivableItems, costAllocationResults, costEntries, leaseUnitAssignments, units],
  );

  const applyChargesReconciliation = useCallback(
    async ({ leaseId, window, resolution, notes }: {
      leaseId: string;
      window: ReconciliationWindow;
      resolution: ReconciliationResolution;
      notes?: string;
    }): Promise<ChargesReconciliation | null> => {
      const lease = leases.find(l => l.id === leaseId);
      if (!lease) return null;
      if (!currentPortfolioId) throw new Error("No portfolio selected");
      const breakdown = engineComputeReconciliation(lease, window, receivableItems, costAllocationResults, costEntries, {
        assignments: leaseUnitAssignments, units,
      });
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
      const saved = await createChargesReconciliation(reconciliation, receivable, currentPortfolioId);
      const savedReceivable = saved.receivable;
      if (savedReceivable) setReceivableItems(prev => [...prev, savedReceivable]);
      setChargesReconciliations(prev => [...prev, saved.reconciliation]);
      return saved.reconciliation;
    },
    [leases, receivableItems, costAllocationResults, costEntries, leaseUnitAssignments, units, properties, currentPortfolioId],
  );

  const deleteChargesReconciliation = useCallback(async (id: string) => {
    const reconciliation = chargesReconciliations.find(r => r.id === id);
    if (!reconciliation) throw new Error("Reconciliation not found");
    if (!currentPortfolioId) throw new Error("No portfolio selected");
    const linkedReceivable = receivableItems.find(r => r.id === reconciliation.receivableItemId);
    if (reconciliation.receivableItemId && (
      allocationsState.some(a => a.receivableItemId === reconciliation.receivableItemId) ||
      (linkedReceivable?.allocatedAmount ?? 0) !== 0 || linkedReceivable?.status === "paid"
    )) {
      throw new Error("reconciliation.deleteAllocated");
    }
    await deleteChargesReconciliationPersisted(reconciliation, currentPortfolioId);
    if (reconciliation.receivableItemId) {
      setReceivableItems(prev => prev.filter(r => r.id !== reconciliation.receivableItemId));
    }
    setChargesReconciliations(prev => prev.filter(r => r.id !== id));
  }, [allocationsState, chargesReconciliations, currentPortfolioId, receivableItems]);

  // ===== Portfolio scoping ============================================
  // All exposed collections are filtered to the active portfolio. Internal
  // state stays unscoped so cross-portfolio bookkeeping (CRUD, receivable
  // generation, amendments) keeps working without rewrites.
  const scoped = useMemo(() => {
    const pid = currentPortfolioId;
    if (!pid) {
      const empty = {
        properties: [] as Property[], units: [] as Unit[], tenants: [] as Tenant[],
        propertyOwners: [] as PropertyOwner[], propertyOwnerLinks: [] as PropertyOwnerLink[],
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
    const sPropertyOwners = propertyOwners.filter(o => o.portfolioId === pid);
    const sPropertyOwnerLinks = propertyOwnerLinks.filter(l => propIds.has(l.propertyId));
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
      propertyOwners: sPropertyOwners, propertyOwnerLinks: sPropertyOwnerLinks,
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
    properties, propertyOwners, propertyOwnerLinks, units, tenants, leases, guarantees, leaseUnitAssignments,
    amendments, amendmentChanges, receivableItems, cashReceipts, allocationsState,
    tickets, vendors, costCategories, costEntries, allocationRules,
    allocationRuleUnitShares, costAllocationResults, chargesReconciliations,
  ]);

  const value = useMemo(() => ({
    loading,
    loadError,
    retryLoad,
    properties: scoped.properties,
    propertyOwners: scoped.propertyOwners,
    propertyOwnerLinks: scoped.propertyOwnerLinks,
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
    addPropertyPersisted, updatePropertyPersisted, savePropertyWithOwnersPersisted, deleteProperty,
    createPropertyOwnerPersisted, setPropertyOwners, getOwnersForProperty,
    addUnitPersisted, addUnitsPersisted, updateUnitPersisted, deleteUnitPersisted,
    addTenantPersisted, updateTenantPersisted, deleteTenantPersisted,
    addLease, updateLeasePersisted, updateLeaseWithAssignmentsPersisted, finalizeLeasePersisted, deleteLease, confirmMoveOut,
    getLeaseAssignments,
    getActiveLeaseAssignmentForUnit,
    getLeaseAssignedUnits: getLeaseAssignedUnitsFn,
    getPrimaryLeaseUnit: getPrimaryLeaseUnitFn,
    getAncillaryLeaseUnits: getAncillaryLeaseUnitsFn,
    isUnitAssignedToActiveLease: isUnitAssignedToActiveLeaseFn,
    addAmendment, updateAmendment, deleteAmendment,
    activateAmendment, scheduleAmendment, revertAmendmentToDraft,
    getLeaseAmendments: getLeaseAmendmentsFn,
    getAmendmentChanges: getAmendmentChangesFn,
    addGuarantee, updateGuarantee,
    createCashReceiptPersisted, allocateCashReceipt, autoAllocateCashReceipt,
    quickPayReceivable,
    addTicketPersisted, updateTicket, deleteTicket,
    addVendorPersisted, updateVendor, deleteVendor,
    addCostCategoryPersisted, updateCostCategory, deleteCostCategory,
    addCostEntryPersisted, updateCostEntry, deleteCostEntry,
    saveAllocationRuleWithSharesPersisted, addAllocationRulePersisted, updateAllocationRule, deleteAllocationRule,
    setAllocationRuleUnitShares: setAllocationRuleUnitSharesFn,
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
    loadError, retryLoad,
    scoped,
    addPropertyPersisted, updatePropertyPersisted, savePropertyWithOwnersPersisted, deleteProperty,
    createPropertyOwnerPersisted, setPropertyOwners, getOwnersForProperty,
    addUnitPersisted, addUnitsPersisted, updateUnitPersisted, deleteUnitPersisted,
    addTenantPersisted, updateTenantPersisted, deleteTenantPersisted,
    addLease, updateLeasePersisted, updateLeaseWithAssignmentsPersisted, finalizeLeasePersisted, deleteLease, confirmMoveOut,
    getLeaseAssignments, getActiveLeaseAssignmentForUnit,
    getLeaseAssignedUnitsFn, getPrimaryLeaseUnitFn, getAncillaryLeaseUnitsFn, isUnitAssignedToActiveLeaseFn,
    addAmendment, updateAmendment, deleteAmendment,
    activateAmendment, scheduleAmendment, revertAmendmentToDraft,
    getLeaseAmendmentsFn, getAmendmentChangesFn,
    addGuarantee, updateGuarantee,
    createCashReceiptPersisted, allocateCashReceipt, autoAllocateCashReceipt,
    quickPayReceivable,
    addTicketPersisted, updateTicket, deleteTicket,
    addVendorPersisted, updateVendor, deleteVendor,
    addCostCategoryPersisted, updateCostCategory, deleteCostCategory,
    addCostEntryPersisted, updateCostEntry, deleteCostEntry,
    saveAllocationRuleWithSharesPersisted, addAllocationRulePersisted, updateAllocationRule, deleteAllocationRule,
    setAllocationRuleUnitSharesFn,
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
