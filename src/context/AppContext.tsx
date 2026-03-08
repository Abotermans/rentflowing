import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Property, Unit, UnitStatus, Tenant, Lease, LedgerLine, Payment, LedgerLineStatus } from "@/types";
import { initialProperties, initialUnits, initialTenants, initialLeases, initialLedgerLines, initialPayments } from "@/data/mockData";

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
  addPayment: (p: Omit<Payment, "id">) => void;
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

  // Property CRUD
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

  // Unit CRUD
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

  // Tenant CRUD
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

  // Lease CRUD
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

  // Payment — allocates to oldest open ledger lines first
  const addPayment = useCallback((p: Omit<Payment, "id">) => {
    const newPayment = { ...p, id: genId("pay") };
    setPayments(prev => [...prev, newPayment]);

    // Allocate to oldest open lines for this lease
    setLedgerLines(prev => {
      const updated = [...prev];
      let remaining = p.amount;
      const today = now();

      // Get open lines for this lease, sorted by dueDate asc
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

  // Helpers
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

  const getLeaseOutstanding = useCallback((leaseId: string) => {
    const lines = ledgerLines.filter(ll => ll.leaseId === leaseId);
    const today = now();
    let outstanding = 0;
    let overdue = 0;
    for (const ll of lines) {
      outstanding += ll.remainingBalance;
      if (ll.remainingBalance > 0 && ll.dueDate < today) {
        overdue += ll.remainingBalance;
      }
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
        if (ll.remainingBalance > 0 && ll.dueDate < today) {
          overdue += ll.remainingBalance;
        }
      }
    }
    return { outstanding, overdue };
  }, [leases, ledgerLines]);

  const value = useMemo(() => ({
    properties, units, tenants, leases, ledgerLines, payments,
    addProperty, updateProperty, deleteProperty,
    addUnit, updateUnit, deleteUnit,
    addTenant, updateTenant, deleteTenant,
    addLease, updateLease, deleteLease,
    addPayment,
    getPropertyStats, getPropertyById, getUnitById, getTenantById,
    getActiveLease, getLeasesByTenant, getLeasesByProperty,
    getLedgerByLease, getPaymentsByLease, getPaymentsByTenant,
    getLeaseOutstanding, getTenantOutstanding,
  }), [properties, units, tenants, leases, ledgerLines, payments, addProperty, updateProperty, deleteProperty, addUnit, updateUnit, deleteUnit, addTenant, updateTenant, deleteTenant, addLease, updateLease, deleteLease, addPayment, getPropertyStats, getPropertyById, getUnitById, getTenantById, getActiveLease, getLeasesByTenant, getLeasesByProperty, getLedgerByLease, getPaymentsByLease, getPaymentsByTenant, getLeaseOutstanding, getTenantOutstanding]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
}
