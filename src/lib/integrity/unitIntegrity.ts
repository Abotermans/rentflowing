import { UnitStatus } from "@/types";
import { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning, ok, blocked, allowedWithWarnings } from "./types";
import { assignmentIsActiveOn } from "@/lib/leaseAssignments";

function activeLeasesForUnit(unitId: string, s: IntegrityState) {
  const today = new Date().toISOString().slice(0, 10);
  const activeLeaseIds = new Set(
    s.leaseUnitAssignments
      .filter(a => a.unitId === unitId && assignmentIsActiveOn(a, today))
      .map(a => a.leaseId),
  );
  // Defensive fallback: include legacy lease.unitId so unmigrated data and tests
  // that don't seed assignment rows still resolve correctly.
  s.leases.forEach(l => {
    if (l.unitId === unitId && l.lifecycleStage === "active") activeLeaseIds.add(l.id);
  });
  return s.leases.filter(l => activeLeaseIds.has(l.id) && l.lifecycleStage === "active");
}

function allLeasesTouchingUnit(unitId: string, s: IntegrityState) {
  const leaseIds = new Set(s.leaseUnitAssignments.filter(a => a.unitId === unitId).map(a => a.leaseId));
  // include legacy lease.unitId for safety
  s.leases.forEach(l => { if (l.unitId === unitId) leaseIds.add(l.id); });
  return s.leases.filter(l => leaseIds.has(l.id));
}

export function canDeleteUnit(unitId: string, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];

  const leaseCount = allLeasesTouchingUnit(unitId, s).length;
  if (leaseCount > 0) blockers.push({ code: "UNIT_HAS_LEASES", message: `Unit has ${leaseCount} lease(s)`, entityType: "lease", count: leaseCount });

  const receivableCount = s.receivableItems.filter(r => r.unitId === unitId).length;
  if (receivableCount > 0) blockers.push({ code: "UNIT_HAS_RECEIVABLES", message: `Unit has ${receivableCount} receivable(s)`, entityType: "receivable", count: receivableCount });

  const receiptCount = s.cashReceipts.filter(r => r.unitId === unitId).length;
  if (receiptCount > 0) blockers.push({ code: "UNIT_HAS_RECEIPTS", message: `Unit has ${receiptCount} cash receipt(s)`, entityType: "cash-receipt", count: receiptCount });

  const costCount = s.costEntries.filter(c => c.unitId === unitId).length;
  if (costCount > 0) blockers.push({ code: "UNIT_HAS_COSTS", message: `Unit has ${costCount} cost entry(ies)`, entityType: "cost-entry", count: costCount });

  const allocResultCount = s.costAllocationResults.filter(r => r.unitId === unitId).length;
  if (allocResultCount > 0) blockers.push({ code: "UNIT_HAS_ALLOC_RESULTS", message: `Unit has ${allocResultCount} allocation result(s)`, entityType: "cost-allocation-result", count: allocResultCount });

  const ticketCount = s.tickets.filter(t => t.unitId === unitId).length;
  if (ticketCount > 0) blockers.push({ code: "UNIT_HAS_TICKETS", message: `Unit has ${ticketCount} maintenance ticket(s)`, entityType: "ticket", count: ticketCount });

  if (blockers.length > 0) return blocked(blockers, [], "Mark the unit as unavailable instead");
  return ok();
}

export function canChangeUnitStatus(unitId: string, targetStatus: UnitStatus, s: IntegrityState): ValidationResult {
  const activeLeases = activeLeasesForUnit(unitId, s);
  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  switch (targetStatus) {
    case "occupied":
      if (activeLeases.length === 0) {
        blockers.push({ code: "UNIT_NO_ACTIVE_LEASE", message: "Unit cannot be occupied without an active lease" });
        // Allow override for pre-import / legacy data scenarios
        if (blockers.length === 1) {
          return { allowed: false, blockers, warnings, overrideAllowed: true, recommendedAction: "Only override if lease data is pending import" };
        }
      }
      if (activeLeases.length > 1) {
        blockers.push({ code: "UNIT_MULTIPLE_ACTIVE_LEASES", message: `Unit has ${activeLeases.length} active leases — resolve before occupying`, count: activeLeases.length });
      }
      break;

    case "vacant":
      if (activeLeases.length > 0) {
        blockers.push({ code: "UNIT_ACTIVE_LEASE_EXISTS", message: "Unit has an active lease — complete move-out flow first" });
        return { allowed: false, blockers, warnings, overrideAllowed: true, recommendedAction: "Use the move-out workflow to vacate this unit" };
      }
      break;

    case "unavailable":
      if (activeLeases.length > 0) {
        warnings.push({ code: "UNIT_ACTIVE_LEASE_WARNING", message: "Active lease exists on this unit", severity: "high" });
      }
      break;

    case "reserved":
      if (activeLeases.length > 0) {
        warnings.push({ code: "UNIT_ALREADY_LEASED", message: "Unit already has an active lease", severity: "medium" });
      }
      break;

    case "archived":
      if (activeLeases.length > 0) {
        blockers.push({ code: "UNIT_ACTIVE_LEASE_EXISTS", message: "Cannot archive a unit with an active lease — vacate first" });
        return { allowed: false, blockers, warnings, overrideAllowed: false, recommendedAction: "Complete the move-out flow before archiving" };
      }
      const openReceivables = s.receivableItems.filter(r => r.unitId === unitId && r.outstandingAmount > 0);
      if (openReceivables.length > 0) {
        blockers.push({ code: "UNIT_OPEN_BALANCES", message: `Unit has ${openReceivables.length} open receivable(s)`, count: openReceivables.length });
        return { allowed: false, blockers, warnings, overrideAllowed: true, recommendedAction: "Resolve open balances before archiving" };
      }
      break;
  }

  if (blockers.length > 0) return blocked(blockers, warnings);
  if (warnings.length > 0) return allowedWithWarnings(warnings, true);
  return ok();
}

export function getUnitIntegrityWarnings(unitId: string, s: IntegrityState): IntegrityWarning[] {
  const warnings: IntegrityWarning[] = [];
  const activeLeases = activeLeasesForUnit(unitId, s);
  if (activeLeases.length > 1) {
    warnings.push({ code: "UNIT_MULTIPLE_ACTIVE_LEASES", message: `Unit has ${activeLeases.length} active leases`, severity: "high" });
  }
  const openReceivables = s.receivableItems.filter(r => r.unitId === unitId && r.outstandingAmount > 0);
  if (openReceivables.length > 0) {
    warnings.push({ code: "UNIT_OPEN_BALANCES", message: `${openReceivables.length} open receivable(s)`, severity: "medium" });
  }
  return warnings;
}
