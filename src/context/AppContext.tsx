import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Property, Unit, UnitStatus } from "@/types";
import { initialProperties, initialUnits } from "@/data/mockData";

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
  addProperty: (p: Omit<Property, "id" | "createdAt" | "updatedAt">) => void;
  updateProperty: (p: Property) => void;
  deleteProperty: (id: string) => void;
  addUnit: (u: Omit<Unit, "id" | "createdAt" | "updatedAt">) => void;
  updateUnit: (u: Unit) => void;
  deleteUnit: (id: string) => void;
  getPropertyStats: (propertyId: string) => PropertyStats;
  getPropertyById: (id: string) => Property | undefined;
  getUnitById: (id: string) => Unit | undefined;
}

const AppContext = createContext<AppState | null>(null);

let counter = 200;
const genId = (prefix: string) => `${prefix}${++counter}`;
const now = () => new Date().toISOString().split("T")[0];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [units, setUnits] = useState<Unit[]>(initialUnits);

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

  const getPropertyStats = useCallback((propertyId: string): PropertyStats => {
    const propUnits = units.filter(u => u.propertyId === propertyId);
    const total = propUnits.length;
    const counts: Record<UnitStatus, number> = { occupied: 0, vacant: 0, reserved: 0, unavailable: 0 };
    propUnits.forEach(u => { counts[u.currentStatus]++; });
    return {
      total,
      ...counts,
      occupancyRate: total > 0 ? Math.round((counts.occupied / total) * 100) : 0,
    };
  }, [units]);

  const getPropertyById = useCallback((id: string) => properties.find(p => p.id === id), [properties]);
  const getUnitById = useCallback((id: string) => units.find(u => u.id === id), [units]);

  const value = useMemo(() => ({
    properties, units,
    addProperty, updateProperty, deleteProperty,
    addUnit, updateUnit, deleteUnit,
    getPropertyStats, getPropertyById, getUnitById,
  }), [properties, units, addProperty, updateProperty, deleteProperty, addUnit, updateUnit, deleteUnit, getPropertyStats, getPropertyById, getUnitById]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
}
