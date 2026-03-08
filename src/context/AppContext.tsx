import React, { createContext, useContext, useState, useCallback } from "react";
import { Property, Unit, Tenant, Lease, Payment } from "@/types";
import { initialProperties, initialUnits, initialTenants, initialLeases, initialPayments } from "@/data/mockData";

interface AppState {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  payments: Payment[];
  addProperty: (p: Omit<Property, "id" | "createdAt">) => void;
  updateProperty: (p: Property) => void;
  deleteProperty: (id: string) => void;
  addUnit: (u: Omit<Unit, "id">) => void;
  updateUnit: (u: Unit) => void;
  deleteUnit: (id: string) => void;
  addTenant: (t: Omit<Tenant, "id" | "createdAt">) => void;
  updateTenant: (t: Tenant) => void;
  deleteTenant: (id: string) => void;
  addLease: (l: Omit<Lease, "id">) => void;
  updateLease: (l: Lease) => void;
  deleteLease: (id: string) => void;
  addPayment: (p: Omit<Payment, "id">) => void;
  updatePayment: (p: Payment) => void;
}

const AppContext = createContext<AppState | null>(null);

let counter = 100;
const genId = (prefix: string) => `${prefix}${++counter}`;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [leases, setLeases] = useState<Lease[]>(initialLeases);
  const [payments, setPayments] = useState<Payment[]>(initialPayments);

  const addProperty = useCallback((p: Omit<Property, "id" | "createdAt">) => {
    setProperties(prev => [...prev, { ...p, id: genId("p"), createdAt: new Date().toISOString().split("T")[0] }]);
  }, []);
  const updateProperty = useCallback((p: Property) => {
    setProperties(prev => prev.map(x => x.id === p.id ? p : x));
  }, []);
  const deleteProperty = useCallback((id: string) => {
    setProperties(prev => prev.filter(x => x.id !== id));
  }, []);

  const addUnit = useCallback((u: Omit<Unit, "id">) => {
    setUnits(prev => [...prev, { ...u, id: genId("u") }]);
  }, []);
  const updateUnit = useCallback((u: Unit) => {
    setUnits(prev => prev.map(x => x.id === u.id ? u : x));
  }, []);
  const deleteUnit = useCallback((id: string) => {
    setUnits(prev => prev.filter(x => x.id !== id));
  }, []);

  const addTenant = useCallback((t: Omit<Tenant, "id" | "createdAt">) => {
    setTenants(prev => [...prev, { ...t, id: genId("t"), createdAt: new Date().toISOString().split("T")[0] }]);
  }, []);
  const updateTenant = useCallback((t: Tenant) => {
    setTenants(prev => prev.map(x => x.id === t.id ? t : x));
  }, []);
  const deleteTenant = useCallback((id: string) => {
    setTenants(prev => prev.filter(x => x.id !== id));
  }, []);

  const addLease = useCallback((l: Omit<Lease, "id">) => {
    setLeases(prev => [...prev, { ...l, id: genId("l") }]);
  }, []);
  const updateLease = useCallback((l: Lease) => {
    setLeases(prev => prev.map(x => x.id === l.id ? l : x));
  }, []);
  const deleteLease = useCallback((id: string) => {
    setLeases(prev => prev.filter(x => x.id !== id));
  }, []);

  const addPayment = useCallback((p: Omit<Payment, "id">) => {
    setPayments(prev => [...prev, { ...p, id: genId("pay") }]);
  }, []);
  const updatePayment = useCallback((p: Payment) => {
    setPayments(prev => prev.map(x => x.id === p.id ? p : x));
  }, []);

  return (
    <AppContext.Provider value={{
      properties, units, tenants, leases, payments,
      addProperty, updateProperty, deleteProperty,
      addUnit, updateUnit, deleteUnit,
      addTenant, updateTenant, deleteTenant,
      addLease, updateLease, deleteLease,
      addPayment, updatePayment,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
}
