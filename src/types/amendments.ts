export type AmendmentStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "ended"
  | "terminated";

/**
 * Structured fields an amendment can change. Free-text clauses fall under
 * "clauseSummary"; everything else maps to a typed field on Lease or to the
 * LeaseUnitAssignment projection.
 */
export type AmendmentFieldName =
  | "baseMonthlyRentTotal"
  | "baseMonthlyChargesTotal"
  /** @deprecated Use per-unit `unitEndDate` changes. Kept for legacy rows. */
  | "leaseEndDate"
  | "unitEndDate"
  | "depositAmount"
  | "noticePeriodText"
  | "tenantIds"
  | "billingTenantId"
  /** @deprecated Use `billingTenantId`. Kept for legacy amendment rows. */
  | "primaryTenantId"
  /** @deprecated Use `tenantIds`. Kept for legacy amendment rows. */
  | "coTenantIds"
  | "guaranteeSummary"
  | "unitAssignments"      // add/remove unit (metadata carries unitId)
  | "unitRentShare"        // per-unit rent share change (metadata.unitId)
  | "unitChargesShare"     // per-unit charges share change (metadata.unitId)
  | "clauseSummary";

export type AmendmentChangeType = "set" | "add" | "remove" | "replace";

export interface AmendmentChangeMetadata {
  unitId?: string;
  startDate?: string;
  endDate?: string | null;
  tenantId?: string;
}

/**
 * A single delta line on an amendment. oldValue / newValue are JSON-serialisable
 * scalars or arrays so the change is structured (auditable, diffable) instead of
 * free text.
 */
export interface LeaseAmendmentChange {
  id: string;
  amendmentId: string;
  fieldName: AmendmentFieldName;
  changeType: AmendmentChangeType;
  oldValue: unknown;
  newValue: unknown;
  metadata?: AmendmentChangeMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface LeaseAmendment {
  id: string;
  leaseId: string;
  amendmentNumber: number;
  title: string;
  reason: string;
  notes: string;
  /** Drives system behaviour (when the change takes effect). */
  effectiveDate: string;
  /** Documentary / legal information only. */
  signedDate: string | null;
  status: AmendmentStatus;
  /** When this amendment supersedes a prior one (correction or replacement). */
  supersedesAmendmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Snapshot of the lease's effective terms at a given date, derived by folding
 * the original lease record with every active amendment whose effectiveDate
 * is ≤ the target date.
 */
export interface EffectiveLeaseTerms {
  leaseId: string;
  asOfDate: string;
  monthlyRent: number;
  monthlyCharges: number;
  endDate: string;
  depositAmount: number | null;
  noticePeriodText: string;
  tenantIds: string[];
  billingTenantId: string;
  /** @deprecated Legacy mirror of `billingTenantId`. */
  primaryTenantId: string;
  /** @deprecated Legacy mirror of `tenantIds` minus the billing tenant. */
  coTenantIds: string[];
  /** Unit assignments active on `asOfDate`, ordered with main unit types first. */
  units: {
    unitId: string;
    rentShare: number;
    chargesShare: number;
  }[];
}

export const AMENDMENT_STATUS_LABELS: Record<AmendmentStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  ended: "Ended",
  terminated: "Terminated",
};
