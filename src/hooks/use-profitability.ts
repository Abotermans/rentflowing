import { useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import {
  getPropertyProfitability, getUnitProfitability,
  type Period, type ProfitabilityInputs,
} from "@/lib/profitability";

function useInputs(): ProfitabilityInputs {
  const ctx = useAppData();
  return useMemo<ProfitabilityInputs>(() => ({
    units: ctx.units,
    leases: ctx.leases,
    assignments: ctx.leaseUnitAssignments,
    receivables: ctx.receivableItems,
    receipts: ctx.cashReceipts,
    allocations: ctx.allocations,
    costEntries: ctx.costEntries,
    costAllocations: ctx.costAllocationResults,
  }), [ctx.units, ctx.leases, ctx.leaseUnitAssignments, ctx.receivableItems, ctx.cashReceipts, ctx.allocations, ctx.costEntries, ctx.costAllocationResults]);
}

export function usePropertyProfitability(propertyId: string, period?: Period) {
  const inputs = useInputs();
  const { properties } = useAppData();
  const property = properties.find(p => p.id === propertyId) ?? null;
  return useMemo(() => getPropertyProfitability(propertyId, inputs, property, period),
    [propertyId, inputs, property, period?.start, period?.end]);
}

export function useUnitProfitability(unitId: string, period?: Period) {
  const inputs = useInputs();
  const { units, properties } = useAppData();
  const unit = units.find(u => u.id === unitId);
  const property = unit ? (properties.find(p => p.id === unit.propertyId) ?? null) : null;
  return useMemo(() => getUnitProfitability(unitId, inputs, property, period),
    [unitId, inputs, property, period?.start, period?.end]);
}

export function useProfitabilityInputs() { return useInputs(); }