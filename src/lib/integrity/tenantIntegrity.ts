import { TenantStatus } from "@/types";
import { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning, ok, blocked, allowedWithWarnings } from "./types";

export function canDeleteTenant(tenantId: string, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];

  const leaseCount = s.leases.filter(l => l.primaryTenantId === tenantId || l.coTenantIds.includes(tenantId)).length;
  if (leaseCount > 0) blockers.push({ code: "TENANT_HAS_LEASES", message: `Tenant is linked to ${leaseCount} lease(s)`, entityType: "lease", count: leaseCount });

  const receivableCount = s.receivableItems.filter(r => r.tenantId === tenantId).length;
  if (receivableCount > 0) blockers.push({ code: "TENANT_HAS_RECEIVABLES", message: `Tenant has ${receivableCount} receivable(s)`, entityType: "receivable", count: receivableCount });

  const receiptCount = s.cashReceipts.filter(r => r.tenantId === tenantId).length;
  if (receiptCount > 0) blockers.push({ code: "TENANT_HAS_RECEIPTS", message: `Tenant has ${receiptCount} cash receipt(s)`, entityType: "cash-receipt", count: receiptCount });

  const guaranteeCount = s.guarantees.filter(g => {
    const lease = s.leases.find(l => l.id === g.leaseId);
    return lease && (lease.primaryTenantId === tenantId || lease.coTenantIds.includes(tenantId));
  }).length;
  if (guaranteeCount > 0) blockers.push({ code: "TENANT_HAS_GUARANTEES", message: `Tenant has ${guaranteeCount} guarantee/deposit(s)`, entityType: "guarantee", count: guaranteeCount });

  const allocationCount = s.allocations.filter(a => {
    const receipt = s.cashReceipts.find(r => r.id === a.cashReceiptId);
    return receipt?.tenantId === tenantId;
  }).length;
  if (allocationCount > 0) blockers.push({ code: "TENANT_HAS_ALLOCATIONS", message: `Tenant has ${allocationCount} receipt allocation(s)`, entityType: "allocation", count: allocationCount });

  if (blockers.length > 0) return blocked(blockers, [], "Mark the tenant as former instead");
  return ok();
}

export function canChangeTenantStatus(tenantId: string, targetStatus: TenantStatus, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  if (targetStatus === "former") {
    const activeLeases = s.leases.filter(l => (l.primaryTenantId === tenantId || l.coTenantIds.includes(tenantId)) && l.lifecycleStage === "active");
    if (activeLeases.length > 0) {
      blockers.push({ code: "TENANT_ACTIVE_LEASES", message: `Tenant has ${activeLeases.length} active lease(s) — end them first`, count: activeLeases.length });
    }

    const openReceivables = s.receivableItems.filter(r => r.tenantId === tenantId && r.outstandingAmount > 0);
    if (openReceivables.length > 0) {
      warnings.push({ code: "TENANT_OPEN_BALANCES", message: `${openReceivables.length} open receivable(s) with outstanding balance`, severity: "high" });
    }

    const unresolvedGuarantees = s.guarantees.filter(g => {
      const lease = s.leases.find(l => l.id === g.leaseId);
      return lease && (lease.primaryTenantId === tenantId || lease.coTenantIds.includes(tenantId)) && (g.status === "active" || g.status === "pending" || g.status === "incomplete");
    });
    if (unresolvedGuarantees.length > 0) {
      warnings.push({ code: "TENANT_UNRESOLVED_GUARANTEES", message: `${unresolvedGuarantees.length} unresolved guarantee/deposit(s)`, severity: "high" });
    }
  }

  if (blockers.length > 0) return blocked(blockers, warnings, "End active leases before marking tenant as former");
  if (warnings.length > 0) return allowedWithWarnings(warnings, true, "Review open balances and guarantees");
  return ok();
}
