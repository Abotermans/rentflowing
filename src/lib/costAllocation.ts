import { CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult, RecoveryType } from "@/types/costs";
import { Unit, DEFAULT_MILLIEME_KEY, getUnitMillieme } from "@/types";

function computeRecoverySplit(amount: number, recoveryType: RecoveryType) {
  switch (recoveryType) {
    case "owner-only":
      return { recoverableAmount: 0, ownerBurdenAmount: amount };
    case "tenant-recoverable":
      return { recoverableAmount: amount, ownerBurdenAmount: 0 };
    case "partially-recoverable":
      // Placeholder: 50/50 split
      const half = Math.round((amount / 2) * 100) / 100;
      return { recoverableAmount: half, ownerBurdenAmount: Math.round((amount - half) * 100) / 100 };
    case "informational":
      return { recoverableAmount: 0, ownerBurdenAmount: 0 };
  }
}

export function computeAllocations(
  costEntry: CostEntry,
  rule: AllocationRule,
  allUnits: Unit[],
  unitShares?: AllocationRuleUnitShare[],
): Omit<CostAllocationResult, "id" | "createdAt" | "updatedAt">[] {
  // Filter units for this property
  let units = allUnits.filter(u => u.propertyId === rule.propertyId);

  // Apply occupied-only filter
  if (rule.applyOnlyToOccupiedUnits) {
    units = units.filter(u => u.currentStatus === "occupied");
  }

  // Exclude unavailable unless explicitly included
  if (!rule.includeUnavailableUnits) {
    units = units.filter(u => u.currentStatus !== "unavailable");
  }

  if (units.length === 0) return [];

  const amount = costEntry.amount;
  const results: Omit<CostAllocationResult, "id" | "createdAt" | "updatedAt">[] = [];

  switch (rule.method) {
    case "equal": {
      const share = Math.round((amount / units.length) * 100) / 100;
      let remainder = Math.round((amount - share * units.length) * 100) / 100;
      units.forEach((unit, i) => {
        let unitShare = share;
        if (i === 0) { unitShare += remainder; remainder = 0; }
        const split = computeRecoverySplit(unitShare, costEntry.recoveryType);
        results.push({
          costEntryId: costEntry.id,
          propertyId: costEntry.propertyId,
          unitId: unit.id,
          allocatedAmount: unitShare,
          recoveryType: costEntry.recoveryType,
          ...split,
          periodStart: costEntry.startDate,
          periodEnd: costEntry.endDate,
        });
      });
      break;
    }

    case "surface-area": {
      const unitsWithArea = units.filter(u => u.surfaceArea && u.surfaceArea > 0);
      if (unitsWithArea.length === 0) return [];
      const totalArea = unitsWithArea.reduce((sum, u) => sum + (u.surfaceArea ?? 0), 0);

      let allocated = 0;
      unitsWithArea.forEach((unit, i) => {
        const ratio = (unit.surfaceArea ?? 0) / totalArea;
        let unitShare = i === unitsWithArea.length - 1
          ? Math.round((amount - allocated) * 100) / 100
          : Math.round(amount * ratio * 100) / 100;
        allocated += unitShare;
        const split = computeRecoverySplit(unitShare, costEntry.recoveryType);
        results.push({
          costEntryId: costEntry.id,
          propertyId: costEntry.propertyId,
          unitId: unit.id,
          allocatedAmount: unitShare,
          recoveryType: costEntry.recoveryType,
          ...split,
          periodStart: costEntry.startDate,
          periodEnd: costEntry.endDate,
        });
      });
      break;
    }

    case "manual-percentage": {
      if (!unitShares || unitShares.length === 0) return [];
      const shares = unitShares.filter(s => s.allocationRuleId === rule.id);
      let allocated = 0;
      shares.forEach((share, i) => {
        const pct = share.percentageShare ?? 0;
        let unitAmount = i === shares.length - 1
          ? Math.round((amount - allocated) * 100) / 100
          : Math.round(amount * (pct / 100) * 100) / 100;
        allocated += unitAmount;
        const split = computeRecoverySplit(unitAmount, costEntry.recoveryType);
        results.push({
          costEntryId: costEntry.id,
          propertyId: costEntry.propertyId,
          unitId: share.unitId,
          allocatedAmount: unitAmount,
          recoveryType: costEntry.recoveryType,
          ...split,
          periodStart: costEntry.startDate,
          periodEnd: costEntry.endDate,
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

      let allocated = 0;
      unitsWithShare.forEach(({ unit, share }, i) => {
        const unitShare = i === unitsWithShare.length - 1
          ? Math.round((amount - allocated) * 100) / 100
          : Math.round(amount * (share / totalShares) * 100) / 100;
        allocated += unitShare;
        const split = computeRecoverySplit(unitShare, costEntry.recoveryType);
        results.push({
          costEntryId: costEntry.id,
          propertyId: costEntry.propertyId,
          unitId: unit.id,
          allocatedAmount: unitShare,
          recoveryType: costEntry.recoveryType,
          ...split,
          periodStart: costEntry.startDate,
          periodEnd: costEntry.endDate,
        });
      });
      break;
    }
  }

  return results;
}
