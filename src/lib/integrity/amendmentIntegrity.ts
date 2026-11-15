import type { LeaseAmendment, LeaseAmendmentChange } from "../../types/amendments.ts";
import type { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning } from "./types.ts";
import { ok, blocked, allowedWithWarnings } from "./types.ts";
import { assignmentIsActiveOn } from "../leaseAssignments.ts";
import { findOverlappingLeases, formatOverlapConflictMessage } from "./leaseDateOverlap.ts";
import { isAncillaryUnitType } from "../../types/index.ts";
import { isReceivableOutstanding } from "../../types/receivables.ts";
import { propertyBusinessDateISO } from "../businessTimeZone.ts";
import { isISOCalendarDate } from "../dateValidation.ts";

/**
 * Validate an amendment before activation. Simulates the resulting lease state and
 * surfaces blockers (impossible state) and warnings (past date, unpaid period
 * impact, conflicts, …).
 */
export function canActivateAmendment(
  amendmentId: string,
  s: IntegrityState,
  businessDate?: string,
): ValidationResult {
  const am = s.amendments.find(a => a.id === amendmentId);
  if (!am) {
    return blocked([{ code: "AMD_NOT_FOUND", message: "Amendment not found" }]);
  }
  return validateAmendment(am, s.amendmentChanges.filter(c => c.amendmentId === amendmentId), s, businessDate);
}

export function validateAmendment(
  amendment: LeaseAmendment,
  changes: readonly LeaseAmendmentChange[],
  s: IntegrityState,
  businessDate?: string,
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
  } else if (!isISOCalendarDate(amendment.effectiveDate)) {
    blockers.push({ code: "AMD_INVALID_EFFECTIVE_DATE", message: "Effective date must be a valid calendar date" });
    return blocked(blockers);
  }
  if (amendment.signedDate && !isISOCalendarDate(amendment.signedDate)) {
    blockers.push({ code: "AMD_INVALID_SIGNED_DATE", message: "Signed date must be a valid calendar date" });
  }

  const today = businessDate ?? propertyBusinessDateISO(
    s.properties?.find(candidate => candidate.id === lease.propertyId),
  );
  if (amendment.effectiveDate && amendment.effectiveDate < today) {
    warnings.push({
      code: "AMD_EFFECTIVE_IN_PAST",
      message: "Effective date is in the past — past paid periods will not be rewritten",
      severity: "medium",
    });
  }

  // Signature must happen on or before the amendment takes effect.
  if (amendment.effectiveDate && amendment.signedDate && amendment.signedDate > amendment.effectiveDate) {
    blockers.push({
      code: "AMD_SIGNED_AFTER_EFFECTIVE",
      message: "Signed date must be on or before the effective date",
    });
  }

  // Simulate the resulting assignment table after the amendment activates.
  const eff = amendment.effectiveDate || today;
  const currentAssignments = s.leaseUnitAssignments.filter(
    a => a.leaseId === amendment.leaseId && assignmentIsActiveOn(a, eff),
  );

  type SimUnit = { unitId: string; rentShare: number; chargesShare: number };
  let sim: SimUnit[] = currentAssignments.map(a => ({
    unitId: a.unitId,
    rentShare: a.rentShare ?? 0,
    chargesShare: a.chargesShare ?? 0,
  }));
  const validAmount = (value: unknown) => (typeof value === "number"
    || (typeof value === "string" && value.trim().length > 0))
    && Number.isFinite(Number(value)) && Number(value) >= 0;

  for (const c of changes) {
    const targetsUnit = ["unitAssignments", "unitRentShare", "unitChargesShare", "unitEndDate"].includes(c.fieldName);
    const unitId = c.metadata?.unitId;
    if (targetsUnit && (!unitId || typeof unitId !== "string")) {
      blockers.push({ code: "AMD_UNIT_REFERENCE_MISSING", message: "Unit change is missing its unit reference" });
      continue;
    }
    if (targetsUnit && c.fieldName !== "unitAssignments" && !sim.some(unit => unit.unitId === unitId)) {
      blockers.push({ code: "AMD_UNIT_NOT_ASSIGNED", message: "Unit to change is not assigned to this lease on the effective date" });
      continue;
    }
    if ((c.fieldName === "unitRentShare" || c.fieldName === "unitChargesShare")
      && !validAmount(c.newValue)) {
      blockers.push({ code: "AMD_INVALID_UNIT_AMOUNT", message: "Unit rent and charges must be non-negative amounts" });
      continue;
    }
    if (c.fieldName === "unitAssignments" && c.changeType === "add" && c.metadata?.unitId) {
      const amounts = c.newValue as { rentShare?: unknown; chargesShare?: unknown } | null;
      if (!amounts || typeof amounts !== "object" || Array.isArray(amounts)
        || !validAmount(amounts.rentShare) || !validAmount(amounts.chargesShare)) {
        blockers.push({
          code: "AMD_INVALID_UNIT_AMOUNT",
          message: "Added unit needs finite, non-negative rent and charges amounts",
        });
        continue;
      }
      if (c.metadata.endDate && !isISOCalendarDate(c.metadata.endDate)) {
        blockers.push({
          code: "AMD_INVALID_UNIT_END_DATE",
          message: "Added unit end date must be a valid calendar date",
        });
        continue;
      }
      if (c.metadata.endDate && c.metadata.endDate < eff) {
        blockers.push({
          code: "AMD_UNIT_END_BEFORE_EFFECTIVE",
          message: "Added unit end date must be on or after the amendment effective date",
        });
        continue;
      }
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
      // Full date-range overlap: added unit must be free for eff → lease end.
      const addHits = findOverlappingLeases(lease.id, [{
        unitId: unit.id,
        startDate: eff,
        endDate: c.metadata.endDate || lease.endDate || null,
      }], s);
      const seenAdd = new Set<string>();
      for (const hit of addHits) {
        const k = `${hit.unitId}|${hit.otherLeaseId}`;
        if (seenAdd.has(k)) continue;
        seenAdd.add(k);
        const otherLease = s.leases.find(l => l.id === hit.otherLeaseId);
        const ref = otherLease?.leaseReference ?? hit.otherLeaseId.slice(0, 8);
        blockers.push({
          code: "AMD_UNIT_OVERLAP",
          message: formatOverlapConflictMessage(hit, {
            unitLabel: unit.unitCode,
            leaseRef: ref,
          }),
        });
      }
      if (sim.find(x => x.unitId === unit.id)) {
        blockers.push({
          code: "AMD_UNIT_DUPLICATE",
          message: `Unit ${unit.unitCode} is already on this lease`,
        });
      } else {
        sim.push({
          unitId: unit.id,
          rentShare: Number(amounts.rentShare),
          chargesShare: Number(amounts.chargesShare),
        });
      }
    } else if (c.fieldName === "unitAssignments" && c.changeType === "remove" && c.metadata?.unitId) {
      if (!sim.some(unit => unit.unitId === unitId)) {
        blockers.push({ code: "AMD_UNIT_NOT_ASSIGNED", message: "Unit to remove is not assigned to this lease on the effective date" });
        continue;
      }
      sim = sim.filter(x => x.unitId !== c.metadata!.unitId);
    } else if (c.fieldName === "unitAssignments") {
      blockers.push({ code: "AMD_UNIT_CHANGE_INVALID", message: "Unit assignment change must add or remove a unit" });
    } else if (c.fieldName === "unitRentShare" && c.metadata?.unitId) {
      sim = sim.map(x => x.unitId === c.metadata!.unitId
        ? { ...x, rentShare: Number(c.newValue) || 0 } : x);
    } else if (c.fieldName === "unitChargesShare" && c.metadata?.unitId) {
      sim = sim.map(x => x.unitId === c.metadata!.unitId
        ? { ...x, chargesShare: Number(c.newValue) || 0 } : x);
    } else if (c.fieldName === "rentFormula") {
      const v = Number(c.newValue);
      if (!Number.isInteger(v) || v < 1) {
        blockers.push({ code: "AMD_INVALID_RENT_FORMULA", message: "Rent formula must be a period of at least 1 month" });
      }
    } else if (c.fieldName === "indexationSettings") {
      const v = c.newValue as {
        indexationEnabled?: boolean;
        indexationBaseIndex?: number | null;
        indexationCurrentIndex?: number | null;
        indexationCapPercent?: number | null;
      } | null;
      if (!v || typeof v !== "object" || Array.isArray(v) || typeof v.indexationEnabled !== "boolean") {
        blockers.push({ code: "AMD_INVALID_INDEXATION", message: "Indexation settings are incomplete" });
      } else if (v.indexationEnabled) {
        if (v.indexationBaseIndex != null && (!validAmount(v.indexationBaseIndex) || Number(v.indexationBaseIndex) === 0)) {
          blockers.push({ code: "AMD_INVALID_INDEXATION", message: "Indexation base index must be greater than 0" });
        }
        if (v.indexationCurrentIndex != null && (!validAmount(v.indexationCurrentIndex) || Number(v.indexationCurrentIndex) === 0)) {
          blockers.push({ code: "AMD_INVALID_INDEXATION", message: "Indexation current index must be greater than 0" });
        }
        if (v.indexationCapPercent != null && !validAmount(v.indexationCapPercent)) {
          blockers.push({ code: "AMD_INVALID_INDEXATION", message: "Indexation cap cannot be negative" });
        }
      }
    } else if (c.fieldName === "baseMonthlyRentTotal") {
      if (!validAmount(c.newValue)) {
        blockers.push({ code: "AMD_INVALID_RENT", message: "Rent must be a non-negative amount" });
      }
    } else if (c.fieldName === "baseMonthlyChargesTotal") {
      if (!validAmount(c.newValue)) {
        blockers.push({ code: "AMD_INVALID_CHARGES", message: "Charges must be a non-negative amount" });
      }
    } else if (c.fieldName === "leaseEndDate") {
      const nv = String(c.newValue ?? "");
      if (nv && !isISOCalendarDate(nv)) {
        blockers.push({ code: "AMD_INVALID_LEASE_END_DATE", message: "Lease end date must be a valid calendar date" });
        continue;
      }
      if (nv && nv < lease.startDate) {
        blockers.push({
          code: "AMD_END_BEFORE_START",
          message: "End date cannot be before lease start date",
        });
      }
      if (nv && amendment.effectiveDate && nv < amendment.effectiveDate) {
        blockers.push({
          code: "AMD_END_BEFORE_EFFECTIVE",
          message: "New end date must be on or after the amendment effective date",
        });
      }
      // Extending the lease end must not overlap another future/active lease
      // on any of this lease's units.
      if (nv) {
        const myAssignments = s.leaseUnitAssignments.filter(
          a => a.leaseId === lease.id && assignmentIsActiveOn(a, eff),
        );
        const probe = myAssignments.map(a => ({
          unitId: a.unitId,
          startDate: a.startDate,
          endDate: nv,
        }));
        const endHits = findOverlappingLeases(lease.id, probe, s);
        const seenEnd = new Set<string>();
        for (const hit of endHits) {
          const k = `${hit.unitId}|${hit.otherLeaseId}`;
          if (seenEnd.has(k)) continue;
          seenEnd.add(k);
          const unit = s.units.find(u => u.id === hit.unitId);
          const otherLease = s.leases.find(l => l.id === hit.otherLeaseId);
          const ref = otherLease?.leaseReference ?? hit.otherLeaseId.slice(0, 8);
          blockers.push({
            code: "AMD_END_OVERLAP",
            message: formatOverlapConflictMessage(hit, {
              unitLabel: unit?.unitCode ?? hit.unitId,
              leaseRef: ref,
            }),
          });
        }
      }
    } else if (c.fieldName === "unitEndDate" && c.metadata?.unitId) {
      const nv = String(c.newValue ?? "");
      if (nv && !isISOCalendarDate(nv)) {
        blockers.push({ code: "AMD_INVALID_UNIT_END_DATE", message: "Unit end date must be a valid calendar date" });
        continue;
      }
      if (nv && nv < lease.startDate) {
        blockers.push({
          code: "AMD_UNIT_END_BEFORE_START",
          message: "Unit end date cannot be before the lease start date",
        });
      }
      if (nv && amendment.effectiveDate && nv < amendment.effectiveDate) {
        blockers.push({
          code: "AMD_UNIT_END_BEFORE_EFFECTIVE",
          message: "Unit end date must be on or after the amendment effective date",
        });
      }
      if (nv) {
        const a = s.leaseUnitAssignments.find(
          x => x.leaseId === lease.id && x.unitId === c.metadata!.unitId && assignmentIsActiveOn(x, eff),
        );
        if (a) {
          const endHits = findOverlappingLeases(lease.id, [{
            unitId: a.unitId,
            startDate: a.startDate,
            endDate: nv,
          }], s);
          const seen = new Set<string>();
          for (const hit of endHits) {
            const k = `${hit.unitId}|${hit.otherLeaseId}`;
            if (seen.has(k)) continue;
            seen.add(k);
            const unit = s.units.find(u => u.id === hit.unitId);
            const otherLease = s.leases.find(l => l.id === hit.otherLeaseId);
            const ref = otherLease?.leaseReference ?? hit.otherLeaseId.slice(0, 8);
            blockers.push({
              code: "AMD_UNIT_END_OVERLAP",
              message: formatOverlapConflictMessage(hit, {
                unitLabel: unit?.unitCode ?? hit.unitId,
                leaseRef: ref,
              }),
            });
          }
        }
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
    const mainUnits = sim.filter(x => {
      const unit = s.units.find(u => u.id === x.unitId);
      return !!unit && !isAncillaryUnitType(unit.unitType);
    }).length;
    if (mainUnits === 0 && sim.length > 0) {
      blockers.push({
        code: "AMD_NO_PRIMARY_LEFT",
        message: "Active lease must retain at least one residential or main commercial unit",
      });
    }
  }

  // Advance cycles can cross the effective date even when billed earlier.
  const overlappingUnpaid = s.receivableItems.filter(
    ri => ri.leaseId === lease.id &&
          isReceivableOutstanding(ri) &&
          (ri.cycleEndDate
            ? ri.cycleEndDate >= eff
            : (ri.periodMonth ?? ri.dueDate.slice(0, 7)) >= eff.slice(0, 7)),
  );
  if (overlappingUnpaid.length > 0) {
    warnings.push({
      code: "AMD_UNPAID_OVERLAP",
      message: `${overlappingUnpaid.length} unpaid receivable(s) overlap the effective date — review before activation`,
      severity: "high",
    });
  }

  if (changes.some(change => change.fieldName === "rentFormula")) {
    const crossingCycles = s.receivableItems.filter(ri =>
      ri.leaseId === lease.id &&
      ri.origin === "lease-schedule" &&
      (ri.itemType === "rent" || ri.itemType === "charges") &&
      ri.dueDate < eff &&
      !!ri.cycleEndDate && ri.cycleEndDate >= eff &&
      ri.status !== "cancelled" && ri.status !== "written-off",
    );
    if (crossingCycles.length > 0) {
      blockers.push({
        code: "AMD_FORMULA_CROSSES_BILLED_CYCLE",
        message: `${crossingCycles.length} existing billed receivable(s) cover the new formula's effective date. Move the effective date after the billed cycle or reconcile those receivables before changing the formula`,
      });
    }
  }

  const allocatedFuture = s.receivableItems.filter(
    ri => ri.leaseId === lease.id &&
          ri.dueDate >= eff &&
          ri.allocatedAmount > 0,
  );
  if (allocatedFuture.length > 0) {
    warnings.push({
      code: "AMD_ALLOCATED_FUTURE_RECEIVABLES",
      message: `${allocatedFuture.length} future allocated receivable(s) will be preserved and must be reviewed manually`,
      severity: "high",
    });
  }

  // Single-active invariant: warn if activating this amendment will end another.
  const previousActive = s.amendments.find(o =>
    o.id !== amendment.id &&
    o.leaseId === lease.id &&
    o.status === "active",
  );
  if (previousActive) {
    warnings.push({
      code: "AMD_WILL_END_PREVIOUS",
      message: `Activating this amendment will end Amendment #${previousActive.amendmentNumber} currently in force`,
      severity: "medium",
    });
  }

  if (blockers.length > 0) return blocked(blockers, warnings);
  if (warnings.length > 0) return allowedWithWarnings(warnings, false);
  return ok();
}
