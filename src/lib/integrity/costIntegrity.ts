import { CostEntry, AllocationRuleUnitShare } from "@/types/costs";
import { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning, ok, blocked, allowedWithWarnings } from "./types";

export function canDeleteCostEntry(costEntryId: string, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];

  const resultCount = s.costAllocationResults.filter(r => r.costEntryId === costEntryId).length;
  if (resultCount > 0) blockers.push({ code: "COST_HAS_ALLOC_RESULTS", message: `Cost entry has ${resultCount} allocation result(s) — remove them first`, entityType: "cost-allocation-result", count: resultCount });

  if (blockers.length > 0) return blocked(blockers, [], "Cancel the cost entry instead");
  return ok();
}

export function canDeleteAllocationRule(ruleId: string, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];

  const entryCount = s.costEntries.filter(e => e.allocationRuleId === ruleId).length;
  if (entryCount > 0) blockers.push({ code: "RULE_HAS_COST_ENTRIES", message: `Allocation rule is used by ${entryCount} cost entry(ies)`, entityType: "cost-entry", count: entryCount });

  const resultCount = s.costAllocationResults.filter(r => {
    const entry = s.costEntries.find(e => e.id === r.costEntryId);
    return entry?.allocationRuleId === ruleId;
  }).length;
  if (resultCount > 0) blockers.push({ code: "RULE_HAS_ALLOC_RESULTS", message: `Rule has ${resultCount} allocation result(s)`, entityType: "cost-allocation-result", count: resultCount });

  if (blockers.length > 0) return blocked(blockers);
  return ok();
}

export function validateCostEntry(entry: Partial<CostEntry>, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  // Unit-level cost must have a valid unit
  if (entry.unitId) {
    const unit = s.units.find(u => u.id === entry.unitId);
    if (!unit) blockers.push({ code: "COST_INVALID_UNIT", message: "Referenced unit does not exist" });
    else if (entry.propertyId && unit.propertyId !== entry.propertyId) {
      blockers.push({ code: "COST_UNIT_PROPERTY_MISMATCH", message: "Unit does not belong to the specified property" });
    }
  }

  // Allocation rule must belong to the same property
  if (entry.allocationRuleId && entry.propertyId) {
    const rule = s.allocationRules.find(r => r.id === entry.allocationRuleId);
    if (rule && rule.propertyId !== entry.propertyId) {
      blockers.push({ code: "COST_RULE_PROPERTY_MISMATCH", message: "Allocation rule belongs to a different property" });
    }
  }

  if (blockers.length > 0) return blocked(blockers, warnings);
  if (warnings.length > 0) return allowedWithWarnings(warnings);
  return ok();
}

export function validateManualPercentageShares(shares: Pick<AllocationRuleUnitShare, "percentageShare">[]): ValidationResult {
  const total = shares.reduce((sum, s) => sum + (s.percentageShare ?? 0), 0);
  const rounded = Math.round(total * 100) / 100;

  if (rounded !== 100) {
    return blocked([{
      code: "SHARES_NOT_100",
      message: `Manual percentage shares total ${rounded}% — must equal 100%`,
    }]);
  }
  return ok();
}
