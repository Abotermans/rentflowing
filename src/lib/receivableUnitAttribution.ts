import type { Lease, LeaseUnitAssignment, Unit } from "@/types";
import type { ReceivableItem } from "@/types/receivables";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";
import { computeCycles, getRentFormulaSegmentStart, type LeaseCycle } from "@/lib/leaseCycles";
import { cycleDueDate } from "@/lib/leaseReceivables";
import { getIndexedRentTotal } from "@/lib/leaseIndexation";
import { getEffectiveLeaseTerms } from "@/lib/amendments";
import { distributeMoneyByWeights, roundMoney } from "@/lib/money";
import { Decimal } from "./decimal.ts";

type Attribution =
  | { kind: "direct"; unitId: string | null }
  | { kind: "split"; shares: { unitId: string; weight: number }[] }
  | { kind: "unavailable"; unitIds: string[] };

interface AttributionContext {
  leases: readonly Lease[];
  assignments: readonly LeaseUnitAssignment[];
  units: readonly Unit[];
  receivables?: readonly ReceivableItem[];
  amendments?: readonly LeaseAmendment[];
  amendmentChanges?: readonly LeaseAmendmentChange[];
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
}

function sameMoney(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && roundMoney(left) === roundMoney(right);
}

export function expectedScheduledCycleAmount(item: ReceivableItem, lease: Lease, context?: AttributionContext): number | null {
  const match = findScheduledCycle(item, lease, context);
  if (!match) return null;
  return item.itemType === "rent"
    ? getIndexedRentTotal(match.lease, match.cycle.startDate, match.cycle.months)
    : match.cycle.chargesTotal;
}

function findScheduledCycle(item: ReceivableItem, lease: Lease, context?: AttributionContext): { cycle: LeaseCycle; lease: Lease } | null {
  if (!item.periodMonth || !item.cycleEndDate || !["rent", "charges"].includes(item.itemType)) return null;
  let scheduleLease = lease;
  const hasAppliedAmendment = context?.amendments?.some(amendment => amendment.leaseId === lease.id
    && (amendment.status === "active" || amendment.status === "ended"));
  if (hasAppliedAmendment && context?.amendments && context.amendmentChanges) {
    const terms = getEffectiveLeaseTerms(lease.id, item.cycleEndDate, {
      leases: context.leases, units: context.units, leaseUnitAssignments: context.assignments,
      amendments: context.amendments, amendmentChanges: context.amendmentChanges,
    });
    if (!terms) return null;
    scheduleLease = {
      ...lease,
      startDate: getRentFormulaSegmentStart(lease, item.cycleEndDate, context.amendments, context.amendmentChanges),
      endDate: terms.endDate || lease.endDate || item.cycleEndDate,
      rentFormula: terms.rentFormula,
      monthlyRent: terms.monthlyRent,
      monthlyCharges: terms.monthlyCharges,
      indexationEnabled: terms.indexationEnabled ?? lease.indexationEnabled,
      indexationBaseDate: terms.indexationBaseDate ?? lease.indexationBaseDate,
      indexationBaseIndex: terms.indexationBaseIndex ?? lease.indexationBaseIndex,
      indexationCurrentIndex: terms.indexationCurrentIndex ?? lease.indexationCurrentIndex,
      indexationCapPercent: terms.indexationCapPercent ?? lease.indexationCapPercent,
      indexationRoundingMode: terms.indexationRoundingMode ?? lease.indexationRoundingMode,
    };
  }
  const cycles = computeCycles({ ...scheduleLease, endDate: scheduleLease.endDate || item.cycleEndDate });
  const cycle = cycles.find(candidate => {
    const nominalDueDate = cycleDueDate(candidate.startDate, scheduleLease.dueDayOfMonth);
    const dueDate = scheduleLease.startDate > lease.startDate && candidate.index === 1
      && nominalDueDate < scheduleLease.startDate
      ? scheduleLease.startDate
      : nominalDueDate;
    return candidate.startDate.slice(0, 7) === item.periodMonth
      && candidate.endDate === item.cycleEndDate
      && dueDate === item.dueDate;
  }) ?? null;
  return cycle ? { cycle, lease: scheduleLease } : null;
}

export function getReceivableUnitAttribution(item: ReceivableItem, context: AttributionContext): Attribution {
  const direct: Attribution = { kind: "direct", unitId: item.unitId };
  if (item.origin !== "lease-schedule" || !item.leaseId || !["rent", "charges"].includes(item.itemType)) return direct;

  const month = item.periodMonth ?? item.dueDate.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { kind: "unavailable", unitIds: item.unitId ? [item.unitId] : [] };
  }
  const monthStart = `${month}-01`;
  const serviceEnd = item.cycleEndDate ?? lastDayOfMonth(month);
  const overlapping = context.assignments.filter(assignment => assignment.leaseId === item.leaseId
    && assignment.startDate <= serviceEnd
    && (!assignment.endDate || assignment.endDate >= monthStart));
  const unitIds = [...new Set(overlapping.map(assignment => assignment.unitId))].sort();
  const unavailable: Attribution = { kind: "unavailable", unitIds: unitIds.length ? unitIds : item.unitId ? [item.unitId] : [] };
  const lease = context.leases.find(candidate => candidate.id === item.leaseId);
  if (!lease) return unavailable;
  const match = findScheduledCycle(item, lease, context);
  if (!match) return unavailable;
  const { cycle, lease: scheduleLease } = match;

  const stable = overlapping.filter(assignment => assignment.startDate <= cycle.startDate
    && (!assignment.endDate || assignment.endDate >= cycle.endDate));
  if (stable.length !== overlapping.length || stable.length !== unitIds.length) return unavailable;
  if (stable.some(assignment => context.units.find(unit => unit.id === assignment.unitId)?.propertyId !== lease.propertyId)) {
    return unavailable;
  }

  const field = item.itemType === "rent" ? "rentShare" : "chargesShare";
  const shares = stable.map(assignment => ({ unitId: assignment.unitId, weight: assignment[field] }))
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
  if (shares.some(share => share.weight === null || !Number.isFinite(share.weight) || share.weight < 0)) return unavailable;
  const totalWeight = shares.reduce((sum, share) => sum.plus(share.weight ?? 0), new Decimal(0)).toNumber();
  const contractualMonthly = item.itemType === "rent" ? scheduleLease.monthlyRent : scheduleLease.monthlyCharges;
  const expectedCycle = item.itemType === "rent"
    ? getIndexedRentTotal(scheduleLease, cycle.startDate, cycle.months)
    : cycle.chargesTotal;
  if (totalWeight <= 0 || !sameMoney(totalWeight, contractualMonthly)) return unavailable;
  const sameCycleRows = context.receivables?.filter(row => row.status !== "cancelled"
    && row.origin === "lease-schedule"
    && row.leaseId === item.leaseId
    && row.itemType === item.itemType
    && row.periodMonth === item.periodMonth
    && row.cycleEndDate === item.cycleEndDate
    && row.dueDate === item.dueDate) ?? [item];
  if (sameCycleRows.length > 1) {
    const expectedShares = distributeMoneyByWeights(expectedCycle, shares.map(share => share.weight ?? 0));
    const seen = new Set<string>();
    if (!sameMoney(sameCycleRows.reduce((sum, row) => sum + row.expectedAmount, 0), expectedCycle)
      || sameCycleRows.some(row => {
        const index = shares.findIndex(share => share.unitId === row.unitId);
        if (!row.unitId || index < 0 || seen.has(row.unitId)
          || !sameMoney(row.expectedAmount, expectedShares[index])) return true;
        seen.add(row.unitId);
        return false;
      })) return unavailable;
    return direct;
  }
  if (!sameMoney(item.expectedAmount, expectedCycle)) return unavailable;
  if (shares.length === 1) {
    return item.unitId === shares[0].unitId ? direct : unavailable;
  }
  return { kind: "split", shares: shares.map(share => ({ unitId: share.unitId, weight: share.weight ?? 0 })) };
}

export function receivableAmountForUnit(
  item: ReceivableItem,
  amount: number,
  unitId: string,
  context: AttributionContext,
): number {
  const attribution = getReceivableUnitAttribution(item, context);
  if (attribution.kind === "direct") return attribution.unitId === unitId ? amount : 0;
  if (attribution.kind === "unavailable") return 0;
  const index = attribution.shares.findIndex(share => share.unitId === unitId);
  if (index < 0) return 0;
  return distributeMoneyByWeights(amount, attribution.shares.map(share => share.weight))[index] ?? 0;
}
