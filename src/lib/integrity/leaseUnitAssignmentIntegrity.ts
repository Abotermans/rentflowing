import { isAncillaryUnitType } from "@/types";
import { Decimal } from "@/lib/decimal";
import { isISOCalendarDate } from "@/lib/dateValidation";
import { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning, ok, blocked, allowedWithWarnings } from "./types";
import { findOverlappingLeases, formatOverlapConflictMessage } from "./leaseDateOverlap";

export interface DraftAssignment {
  unitId: string;
  startDate: string;
  endDate: string | null;
  rentShare: number | null;
  chargesShare: number | null;
}

function followingDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * Validate a draft set of units for a lease. Used by the lease form to surface
 * blockers (multiple properties, duplicate primary, unit already leased, …)
 * and warnings (no primary residential, operationally unavailable units).
 */
export function validateLeaseUnits(
  leaseId: string | null,
  propertyId: string,
  draft: DraftAssignment[],
  totals: { monthlyRent: number; monthlyCharges: number },
  s: IntegrityState,
  leaseDates?: { startDate?: string | null; endDate?: string | null },
): ValidationResult {
  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  if (draft.length === 0) {
    blockers.push({ code: "LUA_NO_UNITS", message: "A lease must have at least one unit" });
    return blocked(blockers);
  }

  const mainCount = draft.filter(d => {
    const unit = s.units.find(u => u.id === d.unitId);
    return !!unit && !isAncillaryUnitType(unit.unitType);
  }).length;
  if (mainCount === 0) {
    blockers.push({ code: "LUA_NO_PRIMARY", message: "A lease must include at least one residential or main commercial unit" });
  } else if (draft.every(d => !!(d.startDate || leaseDates?.startDate))) {
    const firstAssignmentDate = draft.map(d => d.startDate || leaseDates?.startDate || "").sort()[0];
    const mainWindows = draft.flatMap(d => {
      const unit = s.units.find(u => u.id === d.unitId);
      if (!unit || isAncillaryUnitType(unit.unitType)) return [];
      const startDate = d.startDate || leaseDates?.startDate || "";
      const endDate = d.endDate ?? leaseDates?.endDate ?? null;
      return [{ startDate, endDate }];
    }).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const lastAssignmentDate = draft.some(d => !d.endDate && !leaseDates?.endDate)
      ? null
      : draft.map(d => d.endDate ?? leaseDates?.endDate ?? "").sort().at(-1) ?? null;
    let coveredThrough = mainWindows[0]?.endDate ?? null;
    let uncoveredFrom = mainWindows[0]?.startDate > firstAssignmentDate ? firstAssignmentDate : null;
    for (const window of mainWindows.slice(1)) {
      if (uncoveredFrom || coveredThrough === null) break;
      if (window.startDate > followingDay(coveredThrough)) {
        uncoveredFrom = followingDay(coveredThrough);
        break;
      }
      if (window.endDate === null || window.endDate > coveredThrough) coveredThrough = window.endDate;
    }
    if (!uncoveredFrom && coveredThrough !== null &&
        (lastAssignmentDate === null || coveredThrough < lastAssignmentDate)) {
      uncoveredFrom = followingDay(coveredThrough);
    }
    if (uncoveredFrom) {
      blockers.push({
        code: "LUA_MAIN_COVERAGE_GAP",
        message: `No residential or main commercial unit is assigned from ${uncoveredFrom}. Keep a main unit assigned throughout the lease`,
      });
    }
  }

  // Same property
  for (const d of draft) {
    const u = s.units.find(x => x.id === d.unitId);
    if (!u) {
      blockers.push({
        code: "LUA_UNIT_MISSING",
        message: `Unit ${d.unitId || "selection"} is no longer available. Select it again`,
      });
    } else if (u.propertyId !== propertyId) {
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

  // Full date-range overlap against every other non-ended/non-terminated lease.
  const proposed = draft
    .map(d => ({
      unitId: d.unitId,
      startDate: d.startDate || leaseDates?.startDate || "",
      endDate: d.endDate ?? leaseDates?.endDate ?? null,
    }))
    .filter(p => !!p.startDate);
  const overlaps = findOverlappingLeases(leaseId, proposed, s);
  const seenOverlap = new Set<string>();
  for (const hit of overlaps) {
    const key = `${hit.unitId}|${hit.otherLeaseId}`;
    if (seenOverlap.has(key)) continue;
    seenOverlap.add(key);
    const unit = s.units.find(x => x.id === hit.unitId);
    const otherLease = s.leases.find(l => l.id === hit.otherLeaseId);
    const ref = otherLease?.leaseReference ?? hit.otherLeaseId.slice(0, 8);
    blockers.push({
      code: "LUA_UNIT_OVERLAP",
      message: formatOverlapConflictMessage(hit, {
        unitLabel: unit?.unitCode ?? hit.unitId,
        leaseRef: ref,
      }),
    });
  }

  // Warnings: only ancillaries
  const allAncillary = draft.every(d => {
    const unit = s.units.find(u => u.id === d.unitId);
    return !!unit && isAncillaryUnitType(unit.unitType);
  });
  if (allAncillary) {
    warnings.push({
      code: "LUA_ALL_ANCILLARY",
      message: "Lease has only ancillary units (no clearly primary rentable unit)",
      severity: "medium",
    });
  }

  // Strict per-unit pricing: every unit must carry a non-negative rentShare and chargesShare.
  for (const d of draft) {
    const u = s.units.find(x => x.id === d.unitId);
    const label = u?.unitCode ?? d.unitId;
    if (d.rentShare == null || d.chargesShare == null) {
      blockers.push({
        code: "LUA_SHARE_MISSING",
        message: `Unit ${label} is missing its rent or charges amount`,
      });
    } else {
      if (!Number.isFinite(d.rentShare) || d.rentShare < 0) {
        blockers.push({ code: "LUA_SHARE_INVALID", message: `Unit ${label} needs a finite, non-negative rent amount` });
      }
      if (!Number.isFinite(d.chargesShare) || d.chargesShare < 0) {
        blockers.push({ code: "LUA_SHARE_INVALID", message: `Unit ${label} needs a finite, non-negative charges amount` });
      }
    }
  }

  if (draft.every(d => d.rentShare != null && Number.isFinite(d.rentShare) && d.rentShare >= 0
    && d.chargesShare != null && Number.isFinite(d.chargesShare) && d.chargesShare >= 0)) {
    const rent = draft.reduce((sum, d) => sum.plus(d.rentShare!), new Decimal(0)).toDecimalPlaces(2);
    const charges = draft.reduce((sum, d) => sum.plus(d.chargesShare!), new Decimal(0)).toDecimalPlaces(2);
    if (!Number.isFinite(totals.monthlyRent) || totals.monthlyRent < 0
      || !rent.eq(new Decimal(totals.monthlyRent).toDecimalPlaces(2))) {
      blockers.push({
        code: "LUA_RENT_TOTAL_MISMATCH",
        message: `Unit rent amounts total ${rent.toFixed(2)}, but the lease monthly rent is ${totals.monthlyRent}`,
      });
    }
    if (!Number.isFinite(totals.monthlyCharges) || totals.monthlyCharges < 0
      || !charges.eq(new Decimal(totals.monthlyCharges).toDecimalPlaces(2))) {
      blockers.push({
        code: "LUA_CHARGES_TOTAL_MISMATCH",
        message: `Unit charges amounts total ${charges.toFixed(2)}, but the lease monthly charges are ${totals.monthlyCharges}`,
      });
    }
    if (Number.isFinite(totals.monthlyRent) && Number.isFinite(totals.monthlyCharges)
      && rent.eq(new Decimal(totals.monthlyRent).toDecimalPlaces(2))
      && charges.eq(new Decimal(totals.monthlyCharges).toDecimalPlaces(2))
      && draft.every(d => isISOCalendarDate(d.startDate)
        && (!d.endDate || isISOCalendarDate(d.endDate) && d.endDate >= d.startDate))) {
      const startDate = leaseDates?.startDate || draft.map(d => d.startDate).sort()[0];
      const endDate = leaseDates?.endDate || (draft.some(d => !d.endDate)
        ? null : draft.map(d => d.endDate).sort().at(-1));
      const boundaryDates = [...new Set([
        startDate,
        ...draft.map(d => d.startDate),
        ...draft.flatMap(d => d.endDate && d.endDate < "9999-12-31" ? [followingDay(d.endDate)] : []),
      ])].filter(date => date >= startDate && (!endDate || date <= endDate)).sort();
      for (const date of boundaryDates) {
        const active = draft.filter(d => d.startDate <= date
          && (!d.endDate || d.endDate >= date));
        const activeRent = active.reduce((sum, d) => sum.plus(d.rentShare!), new Decimal(0)).toDecimalPlaces(2);
        const activeCharges = active.reduce((sum, d) => sum.plus(d.chargesShare!), new Decimal(0)).toDecimalPlaces(2);
        if (!activeRent.eq(rent) || !activeCharges.eq(charges)) {
          blockers.push({
            code: "LUA_BILLING_WINDOW_MISMATCH",
            message: `On ${date}, the assigned units total ${activeRent.toFixed(2)} rent and ${activeCharges.toFixed(2)} charges, but the lease totals are ${rent.toFixed(2)} and ${charges.toFixed(2)}. Add dated price changes through an amendment`,
          });
          break;
        }
      }
    }
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
