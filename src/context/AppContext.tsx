import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Property, Unit, UnitStatus, Tenant, Lease, LedgerLine, Payment, Guarantee } from "@/types";
import { MaintenanceTicket, Vendor } from "@/types/maintenance";
import { initialProperties, initialUnits, initialTenants, initialLeases, initialLedgerLines, initialPayments, initialGuarantees } from "@/data/mockData";
import { initialTickets, initialVendors } from "@/data/maintenanceMockData";

interface PropertyStats {
  total: number;
  occupied: number;
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
  ledgerLines: LedgerLine[];
  payments: Payment[];
  guarantees: Guarantee[];
  tickets: MaintenanceTicket[];
  vendors: Vendor[];
  addProperty: (p: Omit<Property, "id" | "createdAt" | "updatedAt">) => void;
  updateProperty: (p: Property) => void;
  deleteProperty: (id: string) => void;
  addUnit: (u: Omit<Unit, "id" | "createdAt" | "updatedAt">) => void;
  updateUnit: (u: Unit) => void;
  deleteUnit: (id: string) => void;
  addTenant: (t: Omit<Tenant, "id" | "createdAt" | "updatedAt">) => void;
  updateTenant: (t: Tenant) => void;
  deleteTenant: (id: string) => void;
  addLease: (l: Omit<Lease, "id" | "createdAt" | "updatedAt">) => void;
  updateLease: (l: Lease) => void;
  deleteLease: (id: string) => void;
  confirmMoveOut: (lease: Lease) => void;
  addPayment: (p: Omit<Payment, "id">) => void;
  addGuarantee: (g: Omit<Guarantee, "id">) => void;
  updateGuarantee: (g: Guarantee) => void;
  deleteGuarantee: (id: string) => void;
  addTicket: (t: Omit<MaintenanceTicket, "id">) => void;
  updateTicket: (t: MaintenanceTicket) => void;
  deleteTicket: (id: string) => void;
  addVendor: (v: Omit<Vendor, "id">) => void;
  updateVendor: (v: Vendor) => void;
  deleteVendor: (id: string) => void;
  getPropertyStats: (propertyId: string) => PropertyStats;
  getPropertyById: (id: string) => Property | undefined;
  getUnitById: (id: string) => Unit | undefined;
  getTenantById: (id: string) => Tenant | undefined;
  getActiveLease: (unitId: string) => Lease | undefined;
  getLeasesByTenant: (tenantId: string) => Lease[];
  getLeasesByProperty: (propertyId: string) => Lease[];
  getLedgerByLease: (leaseId: string) => LedgerLine[];
  getPaymentsByLease: (leaseId: string) => Payment[];
  getPaymentsByTenant: (tenantId: string) => Payment[];
  getLeaseOutstanding: (leaseId: string) => { outstanding: number; overdue: number };
  getTenantOutstanding: (tenantId: string) => { outstanding: number; overdue: number };
  getGuaranteeByLease: (leaseId: string) => Guarantee | undefined;
  getTicketsByUnit: (unitId: string) => MaintenanceTicket[];
  getTicketsByProperty: (propertyId: string) => MaintenanceTicket[];
  getTicketsByVendor: (vendorId: string) => MaintenanceTicket[];
  getVendorById: (id: string) => Vendor | undefined;
}

const AppContext = createContext<AppState | null>(null);

let counter = 200;
const genId = (prefix: string) => `${prefix}${++counter}`;
const now = () => new Date().toISOString().split("T")[0];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [leases, setLeases] = useState<Lease[]>(initialLeases);
  const [ledgerLines, setLedgerLines] = useState<LedgerLine[]>(initialLedgerLines);
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [guarantees, setGuarantees] = useState<Guarantee[]>(initialGuarantees);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>(initialTickets);
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);

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

  const addTenant = useCallback((t: Omit<Tenant, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    setTenants(prev => [...prev, { ...t, id: genId("t"), createdAt: ts, updatedAt: ts }]);
  }, []);
  const updateTenant = useCallback((t: Tenant) => {
    setTenants(prev => prev.map(x => x.id === t.id ? { ...t, updatedAt: now() } : x));
  }, []);
  const deleteTenant = useCallback((id: string) => {
    setTenants(prev => prev.filter(x => x.id !== id));
  }, []);

  const addLease = useCallback((l: Omit<Lease, "id" | "createdAt" | "updatedAt">) => {
    const ts = now();
    setLeases(prev => [...prev, { ...l, id: genId("l"), createdAt: ts, updatedAt: ts }]);
  }, []);
  const updateLease = useCallback((l: Lease) => {
    setLeases(prev => prev.map(x => x.id === l.id ? { ...l, updatedAt: now() } : x));
  }, []);
  const deleteLease = useCallback((id: string) => {
    setLeases(prev => prev.filter(x => x.id !== id));
  }, []);

  const confirmMoveOut = useCallback((lease: Lease) => {
    const ts = now();
    setLeases(prev => prev.map(x => x.id === lease.id ? { ...lease, leaseStatus: "ended" as const, moveOutActualDate: ts, updatedAt: ts } : x));
    setUnits(prev => prev.map(x => x.id === lease.unitId ? { ...x, currentStatus: "vacant" as const, availableFrom: ts, updatedAt: ts } : x));
  }, []);

  const addPayment = useCallback((p: Omit<Payment, "id">) => {
    const newPayment = { ...p, id: genId("pay") };
    setPayments(prev => [...prev, newPayment]);
    setLedgerLines(prev => {
      const updated = [...prev];
      let remaining = p.amount;
      const today = now();
      const openIndices = updated
        .map((ll, i) => ({ ll, i }))
        .filter(({ ll }) => ll.leaseId === p.leaseId && ll.remainingBalance > 0)
        .sort((a, b) => a.ll.dueDate.localeCompare(b.ll.dueDate));
      for (const { i } of openIndices) {
        if (remaining <= 0) break;
        const line = { ...updated[i] };
        const allocate = Math.min(remaining, line.remainingBalance);
        line.amountPaid += allocate;
        line.remainingBalance -= allocate;
        remaining -= allocate;
        if (line.remainingBalance === 0) {
          line.status = "paid";
        } else if (line.amountPaid > 0) {
          line.status = line.dueDate < today ? "overdue" : "partially-paid";
        }
        updated[i] = line;
      }
      return updated;
    });
  }, []);

  const addGuarantee = useCallback((g: Omit<Guarantee, "id">) => {
    setGuarantees(prev => [...prev, { ...g, id: genId("g") }]);
  }, []);
  const updateGuarantee = useCallback((g: Guarantee) => {
    setGuarantees(prev => prev.map(x => x.id === g.id ? g : x));
  }, []);
  const deleteGuarantee = useCallback((id: string) => {
    setGuarantees(prev => prev.filter(x => x.id !== id));
  }, []);

  // Maintenance
  const addTicket = useCallback((t: Omit<MaintenanceTicket, "id">) => {
    setTickets(prev => [...prev, { ...t, id: genId("mt") }]);
  }, []);
  const updateTicket = useCallback((t: MaintenanceTicket) => {
    setTickets(prev => prev.map(x => x.id === t.id ? t : x));
  }, []);
  const deleteTicket = useCallback((id: string) => {
    setTickets(prev => prev.filter(x => x.id !== id));
  }, []);

  // Vendors
  const addVendor = useCallback((v: Omit<Vendor, "id">) => {
    setVendors(prev => [...prev, { ...v, id: genId("v") }]);
  }, []);
  const updateVendor = useCallback((v: Vendor) => {
    setVendors(prev => prev.map(x => x.id === v.id ? v : x));
  }, []);
  const deleteVendor = useCallback((id: string) => {
    setVendors(prev => prev.filter(x => x.id !== id));
  }, []);

  const getPropertyStats = useCallback((propertyId: string): PropertyStats => {
    const propUnits = units.filter(u => u.propertyId === propertyId);
    const total = propUnits.length;
    const counts: Record<UnitStatus, number> = { occupied: 0, vacant: 0, reserved: 0, unavailable: 0 };
    propUnits.forEach(u => { counts[u.currentStatus]++; });
    return { total, ...counts, occupancyRate: total > 0 ? Math.round((counts.occupied / total) * 100) : 0 };
  }, [units]);

  const getPropertyById = useCallback((id: string) => properties.find(p => p.id === id), [properties]);
  const getUnitById = useCallback((id: string) => units.find(u => u.id === id), [units]);
  const getTenantById = useCallback((id: string) => tenants.find(t => t.id === id), [tenants]);
  const getActiveLease = useCallback((unitId: string) => leases.find(l => l.unitId === unitId && l.leaseStatus === "active"), [leases]);
  const getLeasesByTenant = useCallback((tenantId: string) => leases.filter(l => l.primaryTenantId === tenantId || l.coTenantIds.includes(tenantId)), [leases]);
  const getLeasesByProperty = useCallback((propertyId: string) => leases.filter(l => l.propertyId === propertyId), [leases]);
  const getLedgerByLease = useCallback((leaseId: string) => ledgerLines.filter(ll => ll.leaseId === leaseId), [ledgerLines]);
  const getPaymentsByLease = useCallback((leaseId: string) => payments.filter(p => p.leaseId === leaseId), [payments]);
  const getPaymentsByTenant = useCallback((tenantId: string) => payments.filter(p => p.tenantId === tenantId), [payments]);
  const getGuaranteeByLease = useCallback((leaseId: string) => guarantees.find(g => g.leaseId === leaseId), [guarantees]);

  const getTicketsByUnit = useCallback((unitId: string) => tickets.filter(t => t.unitId === unitId), [tickets]);
  const getTicketsByProperty = useCallback((propertyId: string) => tickets.filter(t => t.propertyId === propertyId), [tickets]);
  const getTicketsByVendor = useCallback((vendorId: string) => tickets.filter(t => t.assignedVendorId === vendorId), [tickets]);
  const getVendorById = useCallback((id: string) => vendors.find(v => v.id === id), [vendors]);

  const getLeaseOutstanding = useCallback((leaseId: string) => {
    const lines = ledgerLines.filter(ll => ll.leaseId === leaseId);
    const today = now();
    let outstanding = 0;
    let overdue = 0;
    for (const ll of lines) {
      outstanding += ll.remainingBalance;
      if (ll.remainingBalance > 0 && ll.dueDate < today) overdue += ll.remainingBalance;
    }
    return { outstanding, overdue };
  }, [ledgerLines]);

  const getTenantOutstanding = useCallback((tenantId: string) => {
    const tenantLeases = leases.filter(l => l.primaryTenantId === tenantId || l.coTenantIds.includes(tenantId));
    let outstanding = 0;
    let overdue = 0;
    const today = now();
    for (const lease of tenantLeases) {
      const lines = ledgerLines.filter(ll => ll.leaseId === lease.id);
      for (const ll of lines) {
        outstanding += ll.remainingBalance;
        if (ll.remainingBalance > 0 && ll.dueDate < today) overdue += ll.remainingBalance;
      }
    }
    return { outstanding, overdue };
  }, [leases, ledgerLines]);

  const value = useMemo(() => ({
    properties, units, tenants, leases, ledgerLines, payments, guarantees, tickets, vendors,
    addProperty, updateProperty, deleteProperty,
    addUnit, updateUnit, deleteUnit,
    addTenant, updateTenant, deleteTenant,
    addLease, updateLease, deleteLease, confirmMoveOut,
    addPayment,
    addGuarantee, updateGuarantee, deleteGuarantee,
    addTicket, updateTicket, deleteTicket,
    addVendor, updateVendor, deleteVendor,
    getPropertyStats, getPropertyById, getUnitById, getTenantById,
    getActiveLease, getLeasesByTenant, getLeasesByProperty,
    getLedgerByLease, getPaymentsByLease, getPaymentsByTenant,
    getLeaseOutstanding, getTenantOutstanding, getGuaranteeByLease,
    getTicketsByUnit, getTicketsByProperty, getTicketsByVendor, getVendorById,
  }), [properties, units, tenants, leases, ledgerLines, payments, guarantees, tickets, vendors, addProperty, updateProperty, deleteProperty, addUnit, updateUnit, deleteUnit, addTenant, updateTenant, deleteTenant, addLease, updateLease, deleteLease, confirmMoveOut, addPayment, addGuarantee, updateGuarantee, deleteGuarantee, addTicket, updateTicket, deleteTicket, addVendor, updateVendor, deleteVendor, getPropertyStats, getPropertyById, getUnitById, getTenantById, getActiveLease, getLeasesByTenant, getLeasesByProperty, getLedgerByLease, getPaymentsByLease, getPaymentsByTenant, getLeaseOutstanding, getTenantOutstanding, getGuaranteeByLease, getTicketsByUnit, getTicketsByProperty, getTicketsByVendor, getVendorById]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
}
