import type { Property, Unit } from "@/types";
import type { CostAllocationResult, CostEntry } from "@/types/costs";
import { splitCostRecovery } from "@/lib/costRecovery";
import { getEffectivePropertyCostAmount, roundMoney } from "@/lib/propertyOwnership";
import { prorateMoney } from "@/lib/money";
import { sumMoneyByCurrency, type MoneyAmount, type MoneyGroup } from "@/lib/money";

type PropertyAmounts = Record<"charges" | "taxes" | "ownerBorne" | "recoverable" | "total", MoneyAmount[]>;
type UnitAmounts = Record<"directCosts" | "allocatedCosts" | "ownerBorne" | "recoverable" | "total", MoneyAmount[]>;

export interface PropertyCostOverview {
  propertyId: string;
  charges: MoneyGroup[];
  taxes: MoneyGroup[];
  ownerBorne: MoneyGroup[];
  recoverable: MoneyGroup[];
  total: MoneyGroup[];
}

export interface UnitCostOverview {
  unitId: string;
  propertyId: string;
  directCosts: MoneyGroup[];
  allocatedCosts: MoneyGroup[];
  ownerBorne: MoneyGroup[];
  recoverable: MoneyGroup[];
  total: MoneyGroup[];
}

export interface CostAllocationExcess {
  costEntryId: string;
  propertyId: string;
  excessAmount: number;
  currencyCode: string;
}

const emptyProperty = (): PropertyAmounts => ({ charges: [], taxes: [], ownerBorne: [], recoverable: [], total: [] });
const emptyUnit = (): UnitAmounts => ({ directCosts: [], allocatedCosts: [], ownerBorne: [], recoverable: [], total: [] });

function add<K extends string>(bucket: Record<K, MoneyAmount[]>, key: K, amount: number, currencyCode: string, locale?: string) {
  bucket[key].push({ amount, currencyCode, locale });
}

export function buildCostOverview(
  entries: readonly CostEntry[],
  allocations: readonly CostAllocationResult[],
  properties: readonly Property[],
  units: readonly Unit[],
): { properties: PropertyCostOverview[]; units: UnitCostOverview[]; allocationExcesses: CostAllocationExcess[] } {
  const propertyById = new Map(properties.map(property => [property.id, property]));
  const unitById = new Map(units.map(unit => [unit.id, unit]));
  const activeEntries = entries.filter(entry => entry.status === "active");
  const activeById = new Map(activeEntries.map(entry => [entry.id, entry]));
  const allocationsByEntry = new Map<string, CostAllocationResult[]>();
  for (const allocation of allocations) {
    const entry = activeById.get(allocation.costEntryId);
    if (!entry || entry.unitId || allocation.propertyId !== entry.propertyId ||
        unitById.get(allocation.unitId)?.propertyId !== entry.propertyId) continue;
    const rows = allocationsByEntry.get(entry.id) ?? [];
    rows.push(allocation);
    allocationsByEntry.set(entry.id, rows);
  }

  const propertyBuckets = new Map<string, PropertyAmounts>();
  const unitBuckets = new Map<string, { propertyId: string; amounts: UnitAmounts }>();
  const allocationExcesses: CostAllocationExcess[] = [];
  const getUnitBucket = (unitId: string, propertyId: string) => {
    const current = unitBuckets.get(unitId) ?? { propertyId, amounts: emptyUnit() };
    unitBuckets.set(unitId, current);
    return current.amounts;
  };

  for (const entry of activeEntries) {
    const property = propertyById.get(entry.propertyId);
    const currencyCode = entry.currencyCode || property?.currencyCode || "EUR";
    const locale = property?.locale;
    const rows = allocationsByEntry.get(entry.id) ?? [];
    const amount = entry.unitId ? entry.amount : getEffectivePropertyCostAmount(entry, property, units);
    const propertyAmounts = propertyBuckets.get(entry.propertyId) ?? emptyProperty();
    propertyBuckets.set(entry.propertyId, propertyAmounts);
    add(propertyAmounts, entry.isTax ? "taxes" : "charges", amount, currencyCode, locale);
    add(propertyAmounts, "total", amount, currencyCode, locale);

    if (entry.unitId) {
      const split = splitCostRecovery(amount, entry.recoveryType, entry.recoverablePercentage);
      add(propertyAmounts, "ownerBorne", split.ownerBurdenAmount, currencyCode, locale);
      add(propertyAmounts, "recoverable", split.recoverableAmount, currencyCode, locale);
      const unitAmounts = getUnitBucket(entry.unitId, entry.propertyId);
      add(unitAmounts, "directCosts", amount, currencyCode, locale);
      add(unitAmounts, "total", amount, currencyCode, locale);
      add(unitAmounts, "ownerBorne", split.ownerBurdenAmount, currencyCode, locale);
      add(unitAmounts, "recoverable", split.recoverableAmount, currencyCode, locale);
    } else if (rows.length) {
      const allocatedAmount = roundMoney(rows.reduce((sum, row) => sum + row.allocatedAmount, 0));
      const unallocatedAmount = roundMoney(Math.max(0, amount - allocatedAmount));
      const rawOwnerBorne = roundMoney(rows.reduce((sum, row) => sum + row.ownerBurdenAmount, 0));
      const rawRecoverable = roundMoney(rows.reduce((sum, row) => sum + row.recoverableAmount, 0));
      if (allocatedAmount > Math.max(0, amount) + 0.01 && allocatedAmount > 0) {
        allocationExcesses.push({
          costEntryId: entry.id, propertyId: entry.propertyId,
          excessAmount: roundMoney(allocatedAmount - amount), currencyCode,
        });
        const recoverable = Math.min(amount, Math.max(0, prorateMoney(rawRecoverable, amount, allocatedAmount)));
        const ownerBorne = entry.recoveryType === "informational" ? 0 : roundMoney(amount - recoverable);
        add(propertyAmounts, "ownerBorne", ownerBorne, currencyCode, locale);
        add(propertyAmounts, "recoverable", recoverable, currencyCode, locale);
      } else {
        const ownerBorne = entry.recoveryType === "informational" ? 0 : roundMoney(rawOwnerBorne + unallocatedAmount);
        add(propertyAmounts, "ownerBorne", ownerBorne, currencyCode, locale);
        add(propertyAmounts, "recoverable", rawRecoverable, currencyCode, locale);
      }
      for (const row of rows) {
        const unitAmounts = getUnitBucket(row.unitId, entry.propertyId);
        add(unitAmounts, "allocatedCosts", row.allocatedAmount, currencyCode, locale);
        add(unitAmounts, "total", row.allocatedAmount, currencyCode, locale);
        add(unitAmounts, "ownerBorne", row.ownerBurdenAmount, currencyCode, locale);
        add(unitAmounts, "recoverable", row.recoverableAmount, currencyCode, locale);
      }
    } else {
      const split = splitCostRecovery(amount, entry.recoveryType, entry.recoverablePercentage);
      add(propertyAmounts, "ownerBorne", split.ownerBurdenAmount, currencyCode, locale);
      add(propertyAmounts, "recoverable", split.recoverableAmount, currencyCode, locale);
    }
  }

  return {
    allocationExcesses,
    properties: [...propertyBuckets].map(([propertyId, amounts]) => ({
      propertyId,
      charges: sumMoneyByCurrency(amounts.charges),
      taxes: sumMoneyByCurrency(amounts.taxes),
      ownerBorne: sumMoneyByCurrency(amounts.ownerBorne),
      recoverable: sumMoneyByCurrency(amounts.recoverable),
      total: sumMoneyByCurrency(amounts.total),
    })),
    units: [...unitBuckets].map(([unitId, { propertyId, amounts }]) => ({
      unitId, propertyId,
      directCosts: sumMoneyByCurrency(amounts.directCosts),
      allocatedCosts: sumMoneyByCurrency(amounts.allocatedCosts),
      ownerBorne: sumMoneyByCurrency(amounts.ownerBorne),
      recoverable: sumMoneyByCurrency(amounts.recoverable),
      total: sumMoneyByCurrency(amounts.total),
    })),
  };
}
