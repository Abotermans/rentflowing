// ===== Domain Integrity Layer =====
// Centralized validation for entity relationships, status transitions, and delete/archive safety.

export type { IntegrityBlocker, IntegrityWarning, ValidationResult, IntegrityState, IntegrityEntityType } from "./types";
export { ok, blocked, allowedWithWarnings } from "./types";

export { canDeleteProperty, canArchiveProperty, getPropertyIntegrityWarnings } from "./propertyIntegrity";
export { canDeleteUnit, canChangeUnitStatus, getUnitIntegrityWarnings } from "./unitIntegrity";
export { canDeleteTenant, canChangeTenantStatus } from "./tenantIntegrity";
export { canDeleteLease, canActivateLease, canChangeLeaseStatus } from "./leaseIntegrity";
export { canDeleteReceivable, canDeleteCashReceipt, canCreateAllocation } from "./financialIntegrity";
export { canDeleteCostCategory, canDeleteCostEntry, canDeleteAllocationRule, validateCostEntry, validateManualPercentageShares } from "./costIntegrity";

// ===== Generic Dispatchers =====

import { IntegrityState, IntegrityEntityType, ValidationResult } from "./types";
import { canDeleteProperty, canArchiveProperty, getPropertyIntegrityWarnings } from "./propertyIntegrity";
import { canDeleteUnit, canChangeUnitStatus, getUnitIntegrityWarnings } from "./unitIntegrity";
import { canDeleteTenant, canChangeTenantStatus } from "./tenantIntegrity";
import { canDeleteLease, canChangeLeaseStatus } from "./leaseIntegrity";
import { canDeleteReceivable, canDeleteCashReceipt } from "./financialIntegrity";
import { canDeleteCostEntry, canDeleteAllocationRule } from "./costIntegrity";

export function getDeletionImpact(entityType: IntegrityEntityType, entityId: string, s: IntegrityState): ValidationResult {
  switch (entityType) {
    case "property": return canDeleteProperty(entityId, s);
    case "unit": return canDeleteUnit(entityId, s);
    case "tenant": return canDeleteTenant(entityId, s);
    case "lease": return canDeleteLease(entityId, s);
    case "receivable": return canDeleteReceivable(entityId, s);
    case "cash-receipt": return canDeleteCashReceipt(entityId, s);
    case "cost-entry": return canDeleteCostEntry(entityId, s);
    case "allocation-rule": return canDeleteAllocationRule(entityId, s);
    default: return { allowed: true, blockers: [], warnings: [], overrideAllowed: false };
  }
}

export function getStatusTransitionValidation(
  entityType: IntegrityEntityType,
  entityId: string,
  targetStatus: string,
  s: IntegrityState,
): ValidationResult {
  switch (entityType) {
    case "unit": return canChangeUnitStatus(entityId, targetStatus as any, s);
    case "tenant": return canChangeTenantStatus(entityId, targetStatus as any, s);
    case "lease": return canChangeLeaseStatus(entityId, targetStatus as any, s);
    default: return { allowed: true, blockers: [], warnings: [], overrideAllowed: false };
  }
}

export function getIntegrityWarnings(entityType: IntegrityEntityType, entityId: string, s: IntegrityState) {
  switch (entityType) {
    case "property": return getPropertyIntegrityWarnings(entityId, s);
    case "unit": return getUnitIntegrityWarnings(entityId, s);
    default: return [];
  }
}
