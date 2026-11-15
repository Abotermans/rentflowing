import type { CostEntry, AllocationRule } from "@/types/costs";
import type { Property, Unit } from "@/types";
import { DEFAULT_MILLIEME_KEY, getUnitMillieme } from "@/types";
import { Decimal } from "./decimal.ts";
import { prorateMoney } from "@/lib/money";

export { roundMoney } from "@/lib/money";

export const MILLIEME_BASE_OPTIONS = [1000, 10000, 100000] as const;

export function parseMilliemeShareInput(raw: string): { valid: true; value: number | null } | { valid: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { valid: true, value: null };
  const normalized = trimmed.replace(",", ".");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return { valid: false };
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? { valid: true, value } : { valid: false };
}

export function formatMilliemeBase(base: number, locale?: string): string {
  return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 0 }).format(base);
}

export function multiplyMilliemeShare(share: number, count: number): number {
  return new Decimal(share).times(count).toNumber();
}

export function displayMilliemeMaxPerUnit(capacity: number, count: number): number {
  return new Decimal(capacity).div(Math.max(1, count))
    .toSignificantDigits(8, Decimal.ROUND_DOWN).toNumber();
}

export interface OwnershipShare {
  ownedShares: number;
  base: number;
  ratio: number;
}

function sumMilliemeShares(units: readonly Pick<Unit, "milliemeShares">[], key: string): Decimal {
  return units.reduce((sum, unit) => sum.plus(getUnitMillieme(unit, key)), new Decimal(0));
}

export function getManagedOwnershipShare(
  property: Pick<Property, "milliemeBase"> | null | undefined,
  units: readonly Pick<Unit, "propertyId" | "milliemeShares">[],
  propertyId: string,
  key: string = DEFAULT_MILLIEME_KEY,
): OwnershipShare {
  const base = Math.max(1, property?.milliemeBase ?? 1000);
  const ownedShares = sumMilliemeShares(units.filter(unit => unit.propertyId === propertyId), key).toNumber();
  return {
    ownedShares,
    base,
    ratio: Math.max(0, Math.min(1, ownedShares / base)),
  };
}

export function getEffectivePropertyCostAmount(
  costEntry: Pick<CostEntry, "amount" | "propertyId" | "unitId">,
  property: Pick<Property, "isPartiallyOwned" | "milliemeBase"> | null | undefined,
  units: readonly Pick<Unit, "propertyId" | "milliemeShares">[],
  key: string = DEFAULT_MILLIEME_KEY,
): number {
  if (costEntry.unitId || !property?.isPartiallyOwned) return costEntry.amount;
  const ownership = getManagedOwnershipShare(property, units, costEntry.propertyId, key);
  return prorateMoney(costEntry.amount, ownership.ownedShares, ownership.base);
}

export function getAllocationBaseAmount(
  costEntry: Pick<CostEntry, "amount" | "propertyId" | "unitId">,
  rule: Pick<AllocationRule, "method" | "milliemeAllocationMode">,
  property: Pick<Property, "isPartiallyOwned" | "milliemeBase"> | null | undefined,
  units: readonly Pick<Unit, "propertyId" | "milliemeShares">[],
): number {
  if (costEntry.unitId || !property?.isPartiallyOwned) return costEntry.amount;
  if (rule.method === "millieme" && rule.milliemeAllocationMode === "absolute") {
    return costEntry.amount;
  }
  return getEffectivePropertyCostAmount(costEntry, property, units);
}

export interface MilliemeCapacity {
  key: string;
  base: number;
  otherShares: number;
  maxForUnit: number;
}

function capacityForUnit(
  property: Pick<Property, "milliemeBase"> | null | undefined,
  units: readonly Pick<Unit, "id" | "propertyId" | "milliemeShares">[],
  propertyId: string,
  unitId: string | null | undefined,
  key: string,
): { capacity: MilliemeCapacity; otherSharesExact: Decimal } {
  const base = Math.max(1, property?.milliemeBase ?? 1000);
  const otherSharesExact = sumMilliemeShares(
    units.filter(unit => unit.propertyId === propertyId && unit.id !== unitId), key,
  );
  const remaining = new Decimal(base).minus(otherSharesExact);
  return {
    capacity: {
      key,
      base,
      otherShares: otherSharesExact.toNumber(),
      maxForUnit: remaining.greaterThan(0) ? remaining.toNumber() : 0,
    },
    otherSharesExact,
  };
}

export function getMilliemeCapacityForUnit(
  property: Pick<Property, "milliemeBase"> | null | undefined,
  units: readonly Pick<Unit, "id" | "propertyId" | "milliemeShares">[],
  propertyId: string,
  unitId: string | null | undefined,
  key: string = DEFAULT_MILLIEME_KEY,
): MilliemeCapacity {
  return capacityForUnit(property, units, propertyId, unitId, key).capacity;
}

export function getUnitMilliemeCapacityViolations(
  unit: Pick<Unit, "propertyId" | "milliemeShares">,
  property: Pick<Property, "milliemeBase" | "milliemeKeys"> | null | undefined,
  units: readonly Pick<Unit, "id" | "propertyId" | "milliemeShares">[],
  unitId?: string | null,
): MilliemeCapacity[] {
  const keys = property?.milliemeKeys?.length ? property.milliemeKeys : [DEFAULT_MILLIEME_KEY];
  return keys.flatMap(key => {
    const value = getUnitMillieme(unit, key);
    const { capacity, otherSharesExact } = capacityForUnit(property, units, unit.propertyId, unitId, key);
    return otherSharesExact.plus(value).greaterThan(capacity.base) ? [capacity] : [];
  });
}

export interface PropertyMilliemeBaseViolation {
  key: string;
  base: number;
  totalShares: number;
  excess: number;
}

export function getPropertyMilliemeBaseViolations(
  property: Pick<Property, "milliemeBase" | "milliemeKeys">,
  units: readonly Pick<Unit, "propertyId" | "milliemeShares">[],
  propertyId: string,
): PropertyMilliemeBaseViolation[] {
  const base = Math.max(1, property.milliemeBase ?? 1000);
  const keys = property.milliemeKeys?.length ? property.milliemeKeys : [DEFAULT_MILLIEME_KEY];
  return keys.flatMap(key => {
    const totalShares = sumMilliemeShares(units.filter(unit => unit.propertyId === propertyId), key);
    const excess = totalShares.minus(base);
    return excess.greaterThan(0) ? [{
      key,
      base,
      totalShares: totalShares.toNumber(),
      excess: excess.toNumber(),
    }] : [];
  });
}
