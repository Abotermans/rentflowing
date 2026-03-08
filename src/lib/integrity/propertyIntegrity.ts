import { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning, ok, blocked, allowedWithWarnings } from "./types";

export function canDeleteProperty(propertyId: string, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];

  const unitCount = s.units.filter(u => u.propertyId === propertyId).length;
  if (unitCount > 0) blockers.push({ code: "PROP_HAS_UNITS", message: `Property has ${unitCount} unit(s)`, entityType: "unit", count: unitCount });

  const leaseCount = s.leases.filter(l => l.propertyId === propertyId).length;
  if (leaseCount > 0) blockers.push({ code: "PROP_HAS_LEASES", message: `Property has ${leaseCount} lease(s)`, entityType: "lease", count: leaseCount });

  const costCount = s.costEntries.filter(c => c.propertyId === propertyId).length;
  if (costCount > 0) blockers.push({ code: "PROP_HAS_COSTS", message: `Property has ${costCount} cost entry(ies)`, entityType: "cost-entry", count: costCount });

  const ruleCount = s.allocationRules.filter(r => r.propertyId === propertyId).length;
  if (ruleCount > 0) blockers.push({ code: "PROP_HAS_ALLOC_RULES", message: `Property has ${ruleCount} allocation rule(s)`, entityType: "allocation-rule", count: ruleCount });

  const allocResultCount = s.costAllocationResults.filter(r => r.propertyId === propertyId).length;
  if (allocResultCount > 0) blockers.push({ code: "PROP_HAS_ALLOC_RESULTS", message: `Property has ${allocResultCount} allocation result(s)`, entityType: "cost-allocation-result", count: allocResultCount });

  const receivableCount = s.receivableItems.filter(r => r.propertyId === propertyId).length;
  if (receivableCount > 0) blockers.push({ code: "PROP_HAS_RECEIVABLES", message: `Property has ${receivableCount} receivable(s)`, entityType: "receivable", count: receivableCount });

  const receiptCount = s.cashReceipts.filter(r => r.propertyId === propertyId).length;
  if (receiptCount > 0) blockers.push({ code: "PROP_HAS_RECEIPTS", message: `Property has ${receiptCount} cash receipt(s)`, entityType: "cash-receipt", count: receiptCount });

  if (blockers.length > 0) return blocked(blockers, [], "Archive the property instead of deleting it");
  return ok();
}

export function canArchiveProperty(propertyId: string, s: IntegrityState): ValidationResult {
  const warnings: IntegrityWarning[] = [];

  const activeUnits = s.units.filter(u => u.propertyId === propertyId && u.currentStatus !== "unavailable");
  if (activeUnits.length > 0) warnings.push({ code: "PROP_ACTIVE_UNITS", message: `${activeUnits.length} active unit(s) will become inaccessible`, severity: "medium" });

  const activeLeases = s.leases.filter(l => l.propertyId === propertyId && l.leaseStatus === "active");
  if (activeLeases.length > 0) warnings.push({ code: "PROP_ACTIVE_LEASES", message: `${activeLeases.length} active lease(s) exist on this property`, severity: "high" });

  const openReceivables = s.receivableItems.filter(r => r.propertyId === propertyId && r.outstandingAmount > 0);
  if (openReceivables.length > 0) warnings.push({ code: "PROP_OPEN_BALANCES", message: `${openReceivables.length} open receivable(s) with outstanding balance`, severity: "high" });

  const unmatchedReceipts = s.cashReceipts.filter(r => r.propertyId === propertyId && r.unmatchedAmount > 0);
  if (unmatchedReceipts.length > 0) warnings.push({ code: "PROP_UNMATCHED_RECEIPTS", message: `${unmatchedReceipts.length} unmatched cash receipt(s)`, severity: "medium" });

  if (warnings.length > 0) return allowedWithWarnings(warnings, true, "Resolve active leases and open balances before archiving");
  return ok();
}

export function getPropertyIntegrityWarnings(propertyId: string, s: IntegrityState): IntegrityWarning[] {
  return canArchiveProperty(propertyId, s).warnings;
}
