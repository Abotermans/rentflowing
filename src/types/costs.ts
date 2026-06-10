// ===== Cost Nature =====
export type CostNature = "charge" | "tax";
export const COST_NATURE_LABELS: Record<CostNature, string> = { charge: "Charge", tax: "Tax" };

// ===== Cost Scope =====
export type CostScope = "property" | "unit" | "both";
export const COST_SCOPE_LABELS: Record<CostScope, string> = { property: "Property", unit: "Unit", both: "Both" };

// ===== Recovery Type =====
export type RecoveryType = "owner-only" | "tenant-recoverable" | "partially-recoverable" | "informational";
export const RECOVERY_TYPE_LABELS: Record<RecoveryType, string> = {
  "owner-only": "Owner Only",
  "tenant-recoverable": "Tenant Recoverable",
  "partially-recoverable": "Partially Recoverable",
  informational: "Informational",
};

// ===== Cost Frequency =====
export type CostFrequency = "one-off" | "monthly" | "quarterly" | "yearly" | "custom";
export const COST_FREQUENCY_LABELS: Record<CostFrequency, string> = {
  "one-off": "One-Off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

// ===== Cost Entry Status =====
export type CostEntryStatus = "draft" | "active" | "cancelled" | "closed";
export const COST_ENTRY_STATUS_LABELS: Record<CostEntryStatus, string> = {
  draft: "Draft",
  active: "Active",
  cancelled: "Cancelled",
  closed: "Closed",
};

// ===== Allocation Method =====
export type AllocationMethod = "equal" | "surface-area" | "manual-percentage";
export const ALLOCATION_METHOD_LABELS: Record<AllocationMethod, string> = {
  equal: "Equal",
  "surface-area": "Surface Area (m²)",
  "manual-percentage": "Manual Percentage",
};

// ===== Cost Category =====
export interface CostCategory {
  id: string;
  code: string;
  name: string;
  nature: CostNature;
  scope: CostScope;
  recoveryTypeDefault: RecoveryType;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Workspace this category belongs to. Stamped at create-time. */
  portfolioId?: string;
}

// ===== Cost Entry =====
export interface CostEntry {
  id: string;
  categoryId: string;
  propertyId: string;
  unitId: string | null;
  label: string;
  description: string;
  frequency: CostFrequency;
  startDate: string;
  endDate: string | null;
  amount: number;
  currencyCode: string;
  isTax: boolean;
  recoveryType: RecoveryType;
  allocationRuleId: string | null;
  vendorName: string;
  invoiceReference: string;
  status: CostEntryStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Allocation Rule =====
export interface AllocationRule {
  id: string;
  propertyId: string;
  name: string;
  method: AllocationMethod;
  applyOnlyToOccupiedUnits: boolean;
  includeUnavailableUnits: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Allocation Rule Unit Share =====
export interface AllocationRuleUnitShare {
  id: string;
  allocationRuleId: string;
  unitId: string;
  percentageShare: number | null;
  fixedAmountShare: number | null;
  coefficient: number | null;
}

// ===== Cost Allocation Result =====
export interface CostAllocationResult {
  id: string;
  costEntryId: string;
  propertyId: string;
  unitId: string;
  allocatedAmount: number;
  recoveryType: RecoveryType;
  recoverableAmount: number;
  ownerBurdenAmount: number;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}
