import type { Lease, LeaseUnitAssignment } from "../types/index.ts";
import { distributeMoneyByWeights } from "./money.ts";
import { Decimal } from "./decimal.ts";

export type IndexationRoundingMode = NonNullable<Lease["indexationRoundingMode"]>;

export interface IndexationComputation {
  enabled: boolean;
  applicable: boolean;
  factor: number;
  uncappedFactor: number;
  appliedCapPercent: number | null;
  reason: string | null;
}

function addYearsISO(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

function fullYearsBetween(startISO: string, endISO: string): number {
  if (!startISO || !endISO || endISO < startISO) return 0;
  let years = Number(endISO.slice(0, 4)) - Number(startISO.slice(0, 4));
  const anniversary = addYearsISO(startISO, years);
  if (anniversary > endISO) years -= 1;
  return Math.max(0, years);
}

function roundIndexedRent(amount: Decimal, mode: IndexationRoundingMode | null | undefined): number {
  if (mode === "nearest-euro") return amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (mode === "none") return amount.toNumber();
  return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function getLeaseIndexationBaseDate(lease: Pick<Lease, "indexationBaseDate" | "startDate">): string | null {
  return lease.indexationBaseDate || lease.startDate || null;
}

export function computeLeaseIndexation(
  lease: Pick<
    Lease,
    | "indexationEnabled"
    | "indexationBaseDate"
    | "indexationBaseIndex"
    | "indexationCurrentIndex"
    | "indexationCapPercent"
    | "startDate"
  >,
  asOfDate: string,
): IndexationComputation {
  if (!lease.indexationEnabled) {
    return { enabled: false, applicable: false, factor: 1, uncappedFactor: 1, appliedCapPercent: null, reason: "disabled" };
  }
  const baseDate = getLeaseIndexationBaseDate(lease);
  if (!baseDate) {
    return { enabled: true, applicable: false, factor: 1, uncappedFactor: 1, appliedCapPercent: null, reason: "missing-base-date" };
  }
  if (fullYearsBetween(baseDate, asOfDate) < 1) {
    return { enabled: true, applicable: false, factor: 1, uncappedFactor: 1, appliedCapPercent: null, reason: "before-first-anniversary" };
  }
  const baseIndex = Number(lease.indexationBaseIndex);
  const currentIndex = Number(lease.indexationCurrentIndex);
  if (!Number.isFinite(baseIndex) || baseIndex <= 0 || !Number.isFinite(currentIndex) || currentIndex <= 0) {
    return { enabled: true, applicable: false, factor: 1, uncappedFactor: 1, appliedCapPercent: null, reason: "missing-index-values" };
  }

  const uncapped = new Decimal(currentIndex).div(baseIndex);
  const cap = lease.indexationCapPercent == null || lease.indexationCapPercent === undefined
    ? null
    : Number(lease.indexationCapPercent);
  const capFactor = cap != null && Number.isFinite(cap) && cap >= 0
    ? new Decimal(1).plus(new Decimal(cap).div(100))
    : null;
  const cappedFactor = capFactor && uncapped.greaterThan(capFactor) ? capFactor : uncapped;

  return {
    enabled: true,
    applicable: true,
    factor: cappedFactor.toNumber(),
    uncappedFactor: uncapped.toNumber(),
    appliedCapPercent: capFactor && uncapped.greaterThan(capFactor) ? cap : null,
    reason: null,
  };
}

export function getIndexedMonthlyRent(lease: Pick<
  Lease,
  | "monthlyRent"
  | "indexationEnabled"
  | "indexationFrequency"
  | "indexationBaseDate"
  | "indexationBaseIndex"
  | "indexationCurrentIndex"
  | "indexationCapPercent"
  | "indexationRoundingMode"
  | "startDate"
>, asOfDate: string): number {
  const baseRent = Number(lease.monthlyRent) || 0;
  const computation = computeLeaseIndexation(lease, asOfDate);
  if (!computation.applicable) return baseRent;
  const amount = computation.appliedCapPercent != null
    ? new Decimal(baseRent).times(new Decimal(1).plus(new Decimal(computation.appliedCapPercent).div(100)))
    : new Decimal(baseRent).times(Number(lease.indexationCurrentIndex)).div(Number(lease.indexationBaseIndex));
  return roundIndexedRent(amount, lease.indexationRoundingMode);
}

export function getIndexedRentTotal(lease: Lease, cycleStartDate: string, months: number): number {
  return new Decimal(getIndexedMonthlyRent(lease, cycleStartDate)).times(months)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function getCurrentUnitRentShares(
  lease: Lease,
  assignments: readonly Pick<LeaseUnitAssignment, "unitId" | "rentShare">[],
  asOfDate: string,
): Map<string, number> | null {
  if (assignments.length === 0 || !Number.isFinite(lease.monthlyRent) || lease.monthlyRent < 0) return null;
  const unitIds = assignments.map(assignment => assignment.unitId);
  const weights = assignments.map(assignment => assignment.rentShare);
  if (new Set(unitIds).size !== unitIds.length || weights.some(weight => weight === null || !Number.isFinite(weight) || weight < 0)) return null;
  const shares = weights as number[];
  const totalBaseRent = shares.reduce((total, share) => total.plus(share), new Decimal(0));
  if (!totalBaseRent.eq(lease.monthlyRent)) return null;
  if (totalBaseRent.isZero()) return new Map(unitIds.map(unitId => [unitId, 0]));
  const amounts = distributeMoneyByWeights(getIndexedMonthlyRent(lease, asOfDate), shares);
  return new Map(unitIds.map((unitId, index) => [unitId, amounts[index]]));
}

export function buildIndexationSummary(lease: Lease, asOfDate: string): string | null {
  const computation = computeLeaseIndexation(lease, asOfDate);
  if (!computation.enabled) return null;
  if (!computation.applicable) return computation.reason;
  const percent = (computation.factor - 1) * 100;
  return `${percent.toFixed(2)}%${computation.appliedCapPercent != null ? ` capped at ${computation.appliedCapPercent}%` : ""}`;
}
