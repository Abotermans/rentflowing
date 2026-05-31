import type { LeaseUnitAssignment, LeaseUnitAssignmentType } from "@/types";
import { isAncillaryAssignmentType } from "@/types";
import { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning, ok, blocked, allowedWithWarnings } from "./types";
import { assignmentIsActiveOn, checkInternalShareCoherence } from "@/lib/leaseAssignments";

export interface DraftAssignment {
  unitId: string;
  assignmentType: LeaseUnitAssignmentType;
  isPrimary: boolean;
  startDate: string;
  endDate: string | null;
  rentShare: number | null;
  chargesShare: number | null;
}

/**
 * Validate a draft set of units for a lease. Used by the lease form to surface
 * blockers (multiple properties, duplicate primary, unit already leased, …)
 * and warnings (no primary residential, internal share doesn't match totals).
 */
export function validateLeaseUnits(
  leaseId: string | null,
  propertyId: string,
  draft: DraftAssignment[],
  totals: { monthlyRent: number; monthlyCharges: number },
  s: IntegrityState,
): ValidationResult {
  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  if (draft.length === 0) {
    blockers.push({ code: "LUA_NO_UNITS", message: "A lease must have at least one unit" });
    return blocked(blockers);
  }

  const primaryCount = draft.filter(d => d.isPrimary).length;
  if (primaryCount === 0) {
    blockers.push({ code: "LUA_NO_PRIMARY", message: "Exactly one unit must be marked as primary" });
  }
  if (primaryCount > 1) {
    blockers.push({ code: "LUA_MULTIPLE_PRIMARY", message: "Only one unit can be primary on a lease" });
  }

  // Same property
  for (const d of draft) {
    const u = s.units.find(x => x.id === d.unitId);
    if (u && u.propertyId !== propertyId) {
      blockers.push({
        code: "LUA_PROPERTY_MISMATCH",
        message: `Unit ${u.unitCode} does not belong to the selected property`,
      });
    }
  }

  // Duplicate units within the lease draft
  const seen = new Set<string>();
  for (const d of draft) {
    if (seen.has(d.unitId)) {
      const u = s.units.find(x => x.id === d.unitId);
      blockers.push({ code: "LUA_DUPLICATE_UNIT", message: `Unit ${u?.unitCode ?? d.unitId} is listed twice` });
    }
    seen.add(d.unitId);
  }

  // Overlap with other active leases on the same unit
  const today = new Date().toISOString().slice(0, 10);
  for (const d of draft) {
    const conflicts = s.leaseUnitAssignments.filter(other =>
      other.unitId === d.unitId &&
      other.leaseId !== leaseId &&
      assignmentIsActiveOn(other, today) &&
      s.leases.find(l => l.id === other.leaseId)?.lifecycleStage === "active",
    );
    if (conflicts.length > 0) {
      const u = s.units.find(x => x.id === d.unitId);
      blockers.push({
        code: "LUA_UNIT_IN_OTHER_LEASE",
        message: `Unit ${u?.unitCode ?? d.unitId} already belongs to another active lease`,
      });
    }
  }

  // Warnings: only ancillaries
  const allAncillary = draft.every(d => isAncillaryAssignmentType(d.assignmentType));
  if (allAncillary) {
    warnings.push({
      code: "LUA_ALL_ANCILLARY",
      message: "Lease has only ancillary units (no clearly primary rentable unit)",
      severity: "medium",
    });
  }

  // Internal split coherence
  const coherence = checkInternalShareCoherence(
    draft.map(d => ({
      id: "", leaseId: leaseId ?? "", unitId: d.unitId,
      assignmentType: d.assignmentType, isPrimary: d.isPrimary,
      startDate: d.startDate, endDate: d.endDate,
      rentShare: d.rentShare, chargesShare: d.chargesShare,
      notes: "", createdAt: "", updatedAt: "",
    } satisfies LeaseUnitAssignment)),
    totals.monthlyRent,
    totals.monthlyCharges,
  );
  if (coherence && !coherence.coherent) {
    warnings.push({
      code: "LUA_SHARE_MISMATCH",
      message: `Internal rent/charges split does not match lease totals (rent Δ ${coherence.rentDelta.toFixed(0)}, charges Δ ${coherence.chargesDelta.toFixed(0)})`,
      severity: "medium",
    });
  }

  // Unit availability soft warnings
  for (const d of draft) {
    const u = s.units.find(x => x.id === d.unitId);
    if (u && (u.currentStatus === "unavailable" || u.currentStatus === "archived")) {
      warnings.push({
        code: "LUA_UNIT_UNAVAILABLE",
        message: `Unit ${u.unitCode} is ${u.currentStatus}`,
        severity: "low",
      });
    }
  }

  if (blockers.length > 0) return blocked(blockers, warnings);
  if (warnings.length > 0) return allowedWithWarnings(warnings);
  return ok();
}
