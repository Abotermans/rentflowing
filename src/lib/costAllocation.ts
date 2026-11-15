import { CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult } from "@/types/costs";
import { Property, Unit, Lease, LeaseUnitAssignment, DEFAULT_MILLIEME_KEY, getUnitMillieme } from "@/types";
import { getAllocationBaseAmount, roundMoney } from "@/lib/propertyOwnership";
import { getCostRecognitionWindow } from "@/lib/costRecognition";
import { splitCostRecovery } from "@/lib/costRecovery";
import { isUnitOccupiedOn } from "@/lib/occupancy";
import { distributeMoneyByWeights, prorateMoney } from "@/lib/money";

type OccupancyContext = {
  leases: readonly Lease[];
  assignments: readonly LeaseUnitAssignment[];
};

export function computeAllocations(
  costEntry: CostEntry,
  rule: AllocationRule,
  allUnits: Unit[],
  unitShares?: AllocationRuleUnitShare[],
  property?: Property | null,
  occupancy?: OccupancyContext,
): Omit<CostAllocationResult, "id" | "createdAt" | "updatedAt">[] {
  // Filter units for this property
  let units = allUnits.filter(u => u.propertyId === rule.propertyId);

  // Apply occupied-only filter
  if (rule.applyOnlyToOccupiedUnits) {
    if (!occupancy) {
      throw new Error("Occupied-only cost allocation requires lease assignments and leases.");
    }
    units = units.filter(u => isUnitOccupiedOn(u.id, costEntry.startDate, occupancy.leases, occupancy.assignments));
  }

  // Exclude unavailable unless explicitly included
  if (!rule.includeUnavailableUnits) {
    units = units.filter(u => u.currentStatus !== "unavailable");
  }

  if (units.length === 0) return [];

  const amount = getAllocationBaseAmount(costEntry, rule, property, allUnits);
  const recognitionWindow = getCostRecognitionWindow(costEntry);
  const results: Omit<CostAllocationResult, "id" | "createdAt" | "updatedAt">[] = [];

  switch (rule.method) {
    case "equal": {
      const amounts = distributeMoneyByWeights(amount, units.map(() => 1));
      units.forEach((unit, i) => {
        const unitShare = amounts[i];
        const split = splitCostRecovery(unitShare, costEntry.recoveryType, costEntry.recoverablePercentage);
        results.push({
          costEntryId: costEntry.id,
          propertyId: costEntry.propertyId,
          unitId: unit.id,
          allocatedAmount: unitShare,
          recoveryType: costEntry.recoveryType,
          ...split,
          periodStart: recognitionWindow.start,
          periodEnd: recognitionWindow.end,
        });
      });
      break;
    }

    case "surface-area": {
      const unitsWithArea = units.filter(u => u.surfaceArea && u.surfaceArea > 0);
      if (unitsWithArea.length === 0) return [];
      const amounts = distributeMoneyByWeights(amount, unitsWithArea.map(u => u.surfaceArea ?? 0));
      unitsWithArea.forEach((unit, i) => {
        const unitShare = amounts[i];
        const split = splitCostRecovery(unitShare, costEntry.recoveryType, costEntry.recoverablePercentage);
        results.push({
          costEntryId: costEntry.id,
          propertyId: costEntry.propertyId,
          unitId: unit.id,
          allocatedAmount: unitShare,
          recoveryType: costEntry.recoveryType,
          ...split,
          periodStart: recognitionWindow.start,
          periodEnd: recognitionWindow.end,
        });
      });
      break;
    }

    case "manual-percentage": {
      if (!unitShares || unitShares.length === 0) return [];
      const eligibleUnitIds = new Set(units.map(unit => unit.id));
      const shares = unitShares.filter(s => s.allocationRuleId === rule.id && eligibleUnitIds.has(s.unitId) && (s.percentageShare ?? 0) > 0);
      const amounts = distributeMoneyByWeights(amount, shares.map(share => share.percentageShare ?? 0));
      shares.forEach((share, i) => {
        const unitAmount = amounts[i];
        const split = splitCostRecovery(unitAmount, costEntry.recoveryType, costEntry.recoverablePercentage);
        results.push({
          costEntryId: costEntry.id,
          propertyId: costEntry.propertyId,
          unitId: share.unitId,
          allocatedAmount: unitAmount,
          recoveryType: costEntry.recoveryType,
          ...split,
          periodStart: recognitionWindow.start,
          periodEnd: recognitionWindow.end,
        });
      });
      break;
    }

    case "millieme": {
      const key = (rule.shareKey ?? DEFAULT_MILLIEME_KEY) || DEFAULT_MILLIEME_KEY;
      const unitsWithShare = units
        .map(u => ({ unit: u, share: getUnitMillieme(u, key) }))
        .filter(x => x.share > 0);
      if (unitsWithShare.length === 0) return [];
      const totalShares = unitsWithShare.reduce((sum, x) => sum + x.share, 0);
      if (totalShares <= 0) return [];
      const absoluteMode = property?.isPartiallyOwned && rule.milliemeAllocationMode === "absolute";
      const divisor = absoluteMode ? Math.max(1, property.milliemeBase ?? 1000) : totalShares;
      const targetAmount = absoluteMode ? prorateMoney(costEntry.amount, totalShares, divisor) : amount;
      const amounts = distributeMoneyByWeights(targetAmount, unitsWithShare.map(({ share }) => share));
      unitsWithShare.forEach(({ unit }, i) => {
        const unitShare = amounts[i];
        const split = splitCostRecovery(unitShare, costEntry.recoveryType, costEntry.recoverablePercentage);
        results.push({
          costEntryId: costEntry.id,
          propertyId: costEntry.propertyId,
          unitId: unit.id,
          allocatedAmount: unitShare,
          recoveryType: costEntry.recoveryType,
          ...split,
          periodStart: recognitionWindow.start,
          periodEnd: recognitionWindow.end,
        });
      });
      break;
    }
  }

  if (costEntry.recoveryType === "partially-recoverable") {
    const allocatedTotal = results.reduce((sum, result) => sum + result.allocatedAmount, 0);
    const recoverableTotal = splitCostRecovery(allocatedTotal, costEntry.recoveryType, costEntry.recoverablePercentage).recoverableAmount;
    const recoverableShares = distributeMoneyByWeights(recoverableTotal, results.map(result => Math.abs(result.allocatedAmount)));
    results.forEach((result, index) => {
      result.recoverableAmount = recoverableShares[index] ?? 0;
      result.ownerBurdenAmount = roundMoney(result.allocatedAmount - result.recoverableAmount);
    });
  }

  return results;
}
