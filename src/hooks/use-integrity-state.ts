import { useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { IntegrityState } from "@/lib/integrity/types";

export function useIntegrityState(): IntegrityState {
  const ctx = useAppData();
  return useMemo<IntegrityState>(() => ({
    properties: ctx.properties,
    units: ctx.units,
    tenants: ctx.tenants,
    leases: ctx.leases,
    guarantees: ctx.guarantees,
    receivableItems: ctx.receivableItems,
    cashReceipts: ctx.cashReceipts,
    allocations: ctx.allocations,
    tickets: ctx.tickets,
    costCategories: ctx.costCategories,
    costEntries: ctx.costEntries,
    allocationRules: ctx.allocationRules,
    allocationRuleUnitShares: ctx.allocationRuleUnitShares,
    costAllocationResults: ctx.costAllocationResults,
  }), [
    ctx.properties, ctx.units, ctx.tenants, ctx.leases, ctx.guarantees,
    ctx.receivableItems, ctx.cashReceipts, ctx.allocations, ctx.tickets,
    ctx.costCategories, ctx.costEntries, ctx.allocationRules,
    ctx.allocationRuleUnitShares, ctx.costAllocationResults,
  ]);
}
