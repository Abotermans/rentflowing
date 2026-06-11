import { LifecycleStage } from "@/types";
import { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning, ok, blocked, allowedWithWarnings } from "./types";
import { assignmentIsActiveOn } from "@/lib/leaseAssignments";

export function canDeleteLease(leaseId: string, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];

  const receivableCount = s.receivableItems.filter(r => r.leaseId === leaseId).length;
  if (receivableCount > 0) blockers.push({ code: "LEASE_HAS_RECEIVABLES", message: `Lease has ${receivableCount} receivable(s)`, entityType: "receivable", count: receivableCount });

  const receiptCount = s.cashReceipts.filter(r => r.leaseId === leaseId).length;
  if (receiptCount > 0) blockers.push({ code: "LEASE_HAS_RECEIPTS", message: `Lease has ${receiptCount} cash receipt(s)`, entityType: "cash-receipt", count: receiptCount });

  // Allocations linked via receipts for this lease
  const leaseReceiptIds = new Set(s.cashReceipts.filter(r => r.leaseId === leaseId).map(r => r.id));
  const allocationCount = s.allocations.filter(a => leaseReceiptIds.has(a.cashReceiptId)).length;
  if (allocationCount > 0) blockers.push({ code: "LEASE_HAS_ALLOCATIONS", message: `Lease has ${allocationCount} receipt allocation(s)`, entityType: "allocation", count: allocationCount });

  const guaranteeCount = s.guarantees.filter(g => g.leaseId === leaseId).length;
  if (guaranteeCount > 0) blockers.push({ code: "LEASE_HAS_GUARANTEES", message: `Lease has ${guaranteeCount} guarantee/deposit(s)`, entityType: "guarantee", count: guaranteeCount });

  const lease = s.leases.find(l => l.id === leaseId);
  if (lease) {
    if (lease.noticeGiven) blockers.push({ code: "LEASE_HAS_NOTICE", message: "Lease has a notice recorded" });
    if (lease.moveInActualDate) blockers.push({ code: "LEASE_HAS_MOVE_IN", message: "Move-in has been completed" });
    if (lease.moveOutActualDate) blockers.push({ code: "LEASE_HAS_MOVE_OUT", message: "Move-out has been completed" });
  }

  if (blockers.length > 0) return blocked(blockers, [], "Terminate or end the lease instead of deleting it");
  return ok();
}

export function canActivateLease(leaseId: string, s: IntegrityState): ValidationResult {
  const lease = s.leases.find(l => l.id === leaseId);
  if (!lease) return blocked([{ code: "LEASE_NOT_FOUND", message: "Lease not found" }]);

  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  // Must have at least one tenant
  if (!lease.tenantIds || lease.tenantIds.length === 0) {
    blockers.push({ code: "LEASE_NO_TENANTS", message: "Lease must have at least one tenant" });
  }
  if (lease.billingTenantId && lease.tenantIds && !lease.tenantIds.includes(lease.billingTenantId)) {
    blockers.push({ code: "LEASE_BILLING_TENANT_INVALID", message: "Billing tenant must be one of the lease tenants" });
  }

  // Property consistency: every assigned unit must belong to the lease's property
  const today = new Date().toISOString().slice(0, 10);
  const myAssignments = s.leaseUnitAssignments.filter(a => a.leaseId === leaseId);
  if (myAssignments.length === 0) {
    blockers.push({ code: "LEASE_NO_UNITS", message: "Lease has no units assigned" });
  }
  for (const a of myAssignments) {
    const unit = s.units.find(u => u.id === a.unitId);
    if (unit && unit.propertyId !== lease.propertyId) {
      blockers.push({ code: "LEASE_PROPERTY_UNIT_MISMATCH", message: `Unit ${unit.unitCode} does not belong to the lease property` });
    }
  }

  // Overlap detection: every assigned unit must be free of any other ACTIVE lease assignment
  for (const a of myAssignments) {
    const conflicts = s.leaseUnitAssignments.filter(other =>
      other.unitId === a.unitId &&
      other.leaseId !== leaseId &&
      assignmentIsActiveOn(other, today) &&
      s.leases.find(l => l.id === other.leaseId)?.lifecycleStage === "active",
    );
    if (conflicts.length > 0) {
      const unit = s.units.find(u => u.id === a.unitId);
      blockers.push({
        code: "LEASE_UNIT_ALREADY_ACTIVE",
        message: `Unit ${unit?.unitCode ?? a.unitId} already has an active lease`,
        count: conflicts.length,
      });
    }
  }

  // Warnings
  if (!lease.depositOrGuaranteeAmount && s.guarantees.filter(g => g.leaseId === leaseId).length === 0) {
    warnings.push({ code: "LEASE_NO_DEPOSIT", message: "No deposit or guarantee recorded", severity: "medium" });
  }
  if (!lease.moveInScheduledDate) warnings.push({ code: "LEASE_NO_MOVE_IN", message: "Move-in date not scheduled", severity: "low" });

  if (blockers.length > 0) return blocked(blockers, warnings);
  if (warnings.length > 0) return allowedWithWarnings(warnings, false, "Review warnings before activating");
  return ok();
}

/**
 * Same structural checks as `canActivateLease` — used to gate the
 * `draft → pending-signature` transition. Re-exported under a clearer name so
 * call sites describe the actual action.
 */
export const canSendForSignature = canActivateLease;

/**
 * Gate the `pending-signature → signed` transition: a signed date must be set.
 * The dialog that triggers this transition is responsible for collecting the
 * date and updating the lease before calling the transition.
 */
export function canMarkSigned(leaseId: string, s: IntegrityState): ValidationResult {
  const lease = s.leases.find(l => l.id === leaseId);
  if (!lease) return blocked([{ code: "LEASE_NOT_FOUND", message: "Lease not found" }]);
  if (!lease.signedDate) {
    return blocked([{ code: "LEASE_SIGNED_DATE_REQUIRED", message: "A signed date is required" }]);
  }
  return ok();
}

export function canChangeLeaseStatus(leaseId: string, targetStatus: LifecycleStage, s: IntegrityState): ValidationResult {
  const lease = s.leases.find(l => l.id === leaseId);
  if (!lease) return blocked([{ code: "LEASE_NOT_FOUND", message: "Lease not found" }]);

  switch (targetStatus) {
    case "pending-signature":
      return canSendForSignature(leaseId, s);

    case "signed":
      return canMarkSigned(leaseId, s);

    case "active":
      return canActivateLease(leaseId, s);

    case "ended": {
      const warnings: IntegrityWarning[] = [];
      const openReceivables = s.receivableItems.filter(r => r.leaseId === leaseId && r.outstandingAmount > 0);
      if (openReceivables.length > 0) {
        warnings.push({ code: "LEASE_OPEN_BALANCES", message: `${openReceivables.length} open receivable(s) remain`, severity: "high" });
      }
      const unresolvedGuarantees = s.guarantees.filter(g => g.leaseId === leaseId && (g.status === "active" || g.status === "pending" || g.status === "incomplete"));
      if (unresolvedGuarantees.length > 0) {
        warnings.push({ code: "LEASE_UNRESOLVED_GUARANTEES", message: `${unresolvedGuarantees.length} unresolved guarantee(s)`, severity: "high" });
      }
      if (warnings.length > 0) return allowedWithWarnings(warnings, true, "Review balances and guarantees before ending");
      return ok();
    }

    case "terminated": {
      const warnings: IntegrityWarning[] = [];
      if (lease.lifecycleStage !== "active") {
        warnings.push({ code: "LEASE_NOT_ACTIVE", message: "Lease is not currently active", severity: "medium" });
      }
      return warnings.length > 0 ? allowedWithWarnings(warnings, true) : ok();
    }

    case "draft":
      // Cancel-signature flow: only pending-signature can be sent back to
      // draft. Active/ended/terminated leases stay where they are.
      if (lease.lifecycleStage !== "draft" && lease.lifecycleStage !== "pending-signature") {
        return blocked([{ code: "LEASE_CANNOT_REVERT_DRAFT", message: "Cannot revert a non-draft lease back to draft status" }]);
      }
      return ok();

    default:
      return ok();
  }
}

/**
 * Validate a lease renewal: extending the current lease's end date (and
 * optionally rent/charges) instead of creating a new lease record.
 */
export function canRenewLease(
  leaseId: string,
  newEndDate: string,
  s: IntegrityState,
): ValidationResult {
  const lease = s.leases.find(l => l.id === leaseId);
  if (!lease) return blocked([{ code: "LEASE_NOT_FOUND", message: "Lease not found" }]);

  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  if (lease.lifecycleStage !== "active") {
    blockers.push({ code: "LEASE_NOT_ACTIVE", message: "Only active leases can be renewed" });
  }
  if (!newEndDate) {
    blockers.push({ code: "LEASE_RENEW_NO_DATE", message: "A new end date is required" });
  } else if (newEndDate <= lease.endDate) {
    blockers.push({ code: "LEASE_RENEW_DATE_NOT_AFTER", message: "New end date must be after the current end date" });
  }
  if (lease.noticeGiven) {
    warnings.push({ code: "LEASE_RENEW_HAS_NOTICE", message: "Notice is currently active; renewing will cancel the notice", severity: "high" });
  }

  if (blockers.length > 0) return blocked(blockers, warnings);
  if (warnings.length > 0) return allowedWithWarnings(warnings, false, "Renewing will clear notice fields");
  return ok();
}
