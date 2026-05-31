import { Property, Unit, Tenant, Lease, Guarantee } from "@/types";
import type { LeaseUnitAssignment } from "@/types";
import { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import { MaintenanceTicket } from "@/types/maintenance";
import { CostCategory, CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult } from "@/types/costs";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

// ===== Validation Result Types =====

export interface IntegrityBlocker {
  code: string;
  message: string;
  entityType?: string;
  count?: number;
}

export interface IntegrityWarning {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface ValidationResult {
  allowed: boolean;
  blockers: IntegrityBlocker[];
  warnings: IntegrityWarning[];
  recommendedAction?: string;
  overrideAllowed: boolean;
}

// ===== Read-only State Slice =====
// Pure data arrays consumed by integrity functions — no CRUD methods.

export interface IntegrityState {
  properties: readonly Property[];
  units: readonly Unit[];
  tenants: readonly Tenant[];
  leases: readonly Lease[];
  guarantees: readonly Guarantee[];
  leaseUnitAssignments: readonly LeaseUnitAssignment[];
  amendments: readonly LeaseAmendment[];
  amendmentChanges: readonly LeaseAmendmentChange[];
  receivableItems: readonly ReceivableItem[];
  cashReceipts: readonly CashReceipt[];
  allocations: readonly ReceiptAllocation[];
  tickets: readonly MaintenanceTicket[];
  costCategories: readonly CostCategory[];
  costEntries: readonly CostEntry[];
  allocationRules: readonly AllocationRule[];
  allocationRuleUnitShares: readonly AllocationRuleUnitShare[];
  costAllocationResults: readonly CostAllocationResult[];
}

// ===== Entity Type Union =====

export type IntegrityEntityType =
  | "property"
  | "unit"
  | "tenant"
  | "lease"
  | "receivable"
  | "cash-receipt"
  | "allocation"
  | "guarantee"
  | "cost-entry"
  | "allocation-rule"
  | "cost-category"
  | "cost-allocation-result"
  | "ticket";

// ===== Helpers =====

export function ok(): ValidationResult {
  return { allowed: true, blockers: [], warnings: [], overrideAllowed: false };
}

export function blocked(blockers: IntegrityBlocker[], warnings: IntegrityWarning[] = [], recommendedAction?: string): ValidationResult {
  return { allowed: false, blockers, warnings, recommendedAction, overrideAllowed: false };
}

export function allowedWithWarnings(warnings: IntegrityWarning[], overrideAllowed = false, recommendedAction?: string): ValidationResult {
  return { allowed: true, blockers: [], warnings, recommendedAction, overrideAllowed };
}
