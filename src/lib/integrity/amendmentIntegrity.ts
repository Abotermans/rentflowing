import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";
import type { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning } from "./types";
import { ok, blocked, allowedWithWarnings } from "./types";
import { assignmentIsActiveOn } from "@/lib/leaseAssignments";

/**
 * Validate an amendment before activation. Simulates the resulting lease state and
 * surfaces blockers (impossible state) and warnings (past date, unpaid period
 * impact, conflicts, …).
 */
export function canActivateAmendment(
  amendmentId: string,
  s: IntegrityState,
): ValidationResult {
  const am = s.amendments.find(a => a.id === amendmentId);
  if (!am) {
    return blocked([{ code: "AMD_NOT_FOUND", message: "Amendment not found" }]);
  }
  return validateAmendment(am, s.amendmentChanges.filter(c => c.amendmentId === amendmentId), s);
}

export function validateAmendment(
  amendment: LeaseAmendment,
  changes: readonly LeaseAmendmentChange[],
  s: IntegrityState,
): ValidationResult {
  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  const lease = s.leases.find(l => l.id === amendment.leaseId);
  if (!lease) {
    blockers.push({ code: "AMD_LEASE_MISSING", message: "Lease no longer exists" });
    return blocked(blockers);
  }
  if (lease.lifecycleStage === "draft") {
    blockers.push({
      code: "AMD_LEASE_DRAFT",
      message: "Amendments only apply to signed leases; edit the draft directly instead",
    });
  }
  if (!amendment.effectiveDate) {
    blockers.push({ code: "AMD_NO_EFFECTIVE_DATE", message: "Effective date is required" });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (amendment.effectiveDate && amendment.effectiveDate < today) {
    warnings.push({
      code: "AMD_EFFECTIVE_IN_PAST",
      message: "Effective date is in the past — past paid periods will not be rewritten",
      severity: "medium",
    });
  }

  // Simulate the resulting assignment table after the amendment activates.
  const eff = amendment.effectiveDate || today;
  const currentAssignments = s.leaseUnitAssignments.filter(
    a => a.leaseId === amendment.leaseId && assignmentIsActiveOn(a, eff),
  );

  type SimUnit = { unitId: string; isPrimary: boolean; rentShare: number; chargesShare: number };
  let sim: SimUnit[] = currentAssignments.map(a => ({
    unitId: a.unitId,
    isPrimary: a.isPrimary,
    rentShare: a.rentShare ?? 0,
    chargesShare: a.chargesShare ?? 0,
  }));

  for (const c of changes) {
    if (c.fieldName === "unitAssignments" && c.changeType === "add" && c.metadata?.unitId) {
      const unit = s.units.find(u => u.id === c.metadata!.unitId);
      if (!unit) {
        blockers.push({ code: "AMD_UNIT_MISSING", message: "Unit to add no longer exists" });
        continue;
      }
      if (unit.propertyId !== lease.propertyId) {
        blockers.push({
          code: "AMD_UNIT_PROPERTY_MISMATCH",
          message: `Unit ${unit.unitCode} belongs to a different property`,
        });
      }
      // Overlap with another active lease on the same unit at effectiveDate.
      const otherActive = s.leaseUnitAssignments.find(o =>
        o.unitId === unit.id &&
        o.leaseId !== lease.id &&
        assignmentIsActiveOn(o, eff) &&
        s.leases.find(l => l.id === o.leaseId)?.lifecycleStage === "active",
      );
      if (otherActive) {
        blockers.push({
          code: "AMD_UNIT_IN_OTHER_LEASE",
          message: `Unit ${unit.unitCode} is already leased by another active lease`,
        });
      }
      if (sim.find(x => x.unitId === unit.id)) {
        blockers.push({
          code: "AMD_UNIT_DUPLICATE",
          message: `Unit ${unit.unitCode} is already on this lease`,
        });
      } else {
        const newRent = c.metadata.assignmentType ? 0 : 0;
        const newCharges = 0;
        sim.push({
          unitId: unit.id,
          isPrimary: false,
          rentShare: Number((c.newValue as { rentShare?: number })?.rentShare ?? newRent) || 0,
          chargesShare: Number((c.newValue as { chargesShare?: number })?.chargesShare ?? newCharges) || 0,
        });
      }
    } else if (c.fieldName === "unitAssignments" && c.changeType === "remove" && c.metadata?.unitId) {
      sim = sim.filter(x => x.unitId !== c.metadata!.unitId);
    } else if (c.fieldName === "primaryUnitId") {
      const newId = String(c.newValue);
      sim = sim.map(x => ({ ...x, isPrimary: x.unitId === newId }));
    } else if (c.fieldName === "unitRentShare" && c.metadata?.unitId) {
      sim = sim.map(x => x.unitId === c.metadata!.unitId
        ? { ...x, rentShare: Number(c.newValue) || 0 } : x);
    } else if (c.fieldName === "unitChargesShare" && c.metadata?.unitId) {
      sim = sim.map(x => x.unitId === c.metadata!.unitId
        ? { ...x, chargesShare: Number(c.newValue) || 0 } : x);
    } else if (c.fieldName === "baseMonthlyRentTotal") {
      const v = Number(c.newValue);
      if (Number.isFinite(v) && v < 0) {
        blockers.push({ code: "AMD_NEGATIVE_RENT", message: "Rent cannot be negative" });
      }
    } else if (c.fieldName === "baseMonthlyChargesTotal") {
      const v = Number(c.newValue);
      if (Number.isFinite(v) && v < 0) {
        blockers.push({ code: "AMD_NEGATIVE_CHARGES", message: "Charges cannot be negative" });
      }
    } else if (c.fieldName === "leaseEndDate") {
      const nv = String(c.newValue);
      if (nv && nv < lease.startDate) {
        blockers.push({
          code: "AMD_END_BEFORE_START",
          message: "End date cannot be before lease start date",
        });
      }
    }
  }

  if (lease.lifecycleStage === "active") {
    if (sim.length === 0) {
      blockers.push({
        code: "AMD_NO_UNITS_LEFT",
        message: "Active lease must retain at least one unit",
      });
    }
    const primaries = sim.filter(x => x.isPrimary).length;
    if (primaries === 0 && sim.length > 0) {
      blockers.push({
        code: "AMD_NO_PRIMARY_LEFT",
        message: "Active lease must have exactly one primary unit",
      });
    }
    if (primaries > 1) {
      blockers.push({
        code: "AMD_MULTIPLE_PRIMARIES",
        message: "Amendment would produce two primary units",
      });
    }
  }

  // Receivable impact warning: any open ReceivableItem on or after effectiveDate.
  const overlappingUnpaid = s.receivableItems.filter(
    ri => ri.leaseId === lease.id &&
          ri.outstandingAmount > 0 &&
          ri.periodMonth >= eff.slice(0, 7),
  );
  if (overlappingUnpaid.length > 0) {
    warnings.push({
      code: "AMD_UNPAID_OVERLAP",
      message: `${overlappingUnpaid.length} unpaid receivable(s) overlap the effective date — review before activation`,
      severity: "high",
    });
  }

  // Conflicts with another pending/active amendment touching the same fields.
  const touched = new Set(changes.map(c => c.fieldName));
  const conflicting = s.amendments.filter(o =>
    o.id !== amendment.id &&
    o.leaseId === lease.id &&
    (o.status === "pending-signature" || o.status === "active") &&
    s.amendmentChanges.some(cc => cc.amendmentId === o.id && touched.has(cc.fieldName)),
  );
  if (conflicting.length > 0) {
    warnings.push({
      code: "AMD_CONFLICT_PENDING",
      message: `Another pending/active amendment changes the same field(s)`,
      severity: "medium",
    });
  }

  // Primary unit change is a soft heads-up for reporting/occupancy.
  if (changes.some(c => c.fieldName === "primaryUnitId")) {
    warnings.push({
      code: "AMD_PRIMARY_CHANGE",
      message: "Changing the primary unit affects occupancy and reporting",
      severity: "low",
    });
  }

  if (blockers.length > 0) return blocked(blockers, warnings);
  if (warnings.length > 0) return allowedWithWarnings(warnings, false);
  return ok();
}