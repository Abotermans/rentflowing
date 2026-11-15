import type { Lease, LeaseUnitAssignment } from "../types/index.ts";
import { isAncillaryUnitType, type Unit } from "../types/index.ts";
import { localTodayISO } from "./calendarToday.ts";
import type { ReceivableItem } from "../types/receivables.ts";

/** True when this unit represents an ancillary lease attachment. */
export const isAncillaryLeaseUnit = (unit: Pick<Unit, "unitType"> | undefined) =>
  !!unit && isAncillaryUnitType(unit.unitType);

/** True when this unit represents a main rentable unit. */
export const isMainLeaseUnit = (unit: Pick<Unit, "unitType"> | undefined) =>
  !!unit && !isAncillaryLeaseUnit(unit);

/** True if assignment row covers the given ISO date. */
export function assignmentIsActiveOn(a: LeaseUnitAssignment, isoDate: string): boolean {
  if (a.startDate > isoDate) return false;
  if (a.endDate && a.endDate < isoDate) return false;
  return true;
}

export function leaseOccupiesOn(
  lease: Pick<Lease, "lifecycleStage" | "startDate" | "endDate" | "moveOutActualDate">,
  isoDate: string,
): boolean {
  if (lease.lifecycleStage !== "active" && lease.lifecycleStage !== "signed") return false;
  if (!lease.startDate || lease.startDate > isoDate) return false;
  if (lease.endDate && lease.endDate < isoDate) return false;
  if (lease.moveOutActualDate && lease.moveOutActualDate < isoDate) return false;
  return true;
}

export function receivableHasPlausibleAssignment(
  item: Pick<ReceivableItem, "leaseId" | "unitId" | "dueDate" | "cycleEndDate">,
  assignments: readonly Pick<LeaseUnitAssignment, "leaseId" | "unitId" | "startDate" | "endDate">[],
): boolean {
  if (!item.leaseId || !item.unitId || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)) return false;
  const monthStart = `${item.dueDate.slice(0, 7)}-01`;
  const [year, month] = item.dueDate.slice(0, 7).split("-").map(Number);
  if (month < 1 || month > 12) return false;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const cycleEnd = item.cycleEndDate ?? monthEnd;
  return assignments.some(assignment => assignment.leaseId === item.leaseId
    && assignment.unitId === item.unitId && assignment.startDate <= cycleEnd
    && (!assignment.endDate || assignment.endDate >= monthStart));
}

export function applyAssignmentShareChange(
  assignments: readonly LeaseUnitAssignment[],
  leaseId: string,
  unitId: string,
  effectiveDate: string,
  field: "rentShare" | "chargesShare",
  amount: number,
  updatedAt: string,
  newId: () => string,
): LeaseUnitAssignment[] {
  const next: LeaseUnitAssignment[] = [];
  const priorDay = new Date(`${effectiveDate}T00:00:00Z`);
  priorDay.setUTCDate(priorDay.getUTCDate() - 1);
  const endBeforeEffective = priorDay.toISOString().slice(0, 10);
  for (const assignment of assignments) {
    if (assignment.leaseId !== leaseId || assignment.unitId !== unitId || !assignmentIsActiveOn(assignment, effectiveDate)) {
      next.push(assignment);
    } else if (assignment.startDate < effectiveDate) {
      next.push({ ...assignment, endDate: endBeforeEffective, updatedAt });
      next.push({ ...assignment, id: newId(), startDate: effectiveDate, [field]: amount, createdAt: updatedAt, updatedAt });
    } else {
      next.push({ ...assignment, [field]: amount, updatedAt });
    }
  }
  return next;
}

const today = localTodayISO;

export function getAssignmentsForLease(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
): LeaseUnitAssignment[] {
  return assignments.filter(a => a.leaseId === leaseId);
}

export function getActiveAssignmentsForLease(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
  onDate: string = today(),
): LeaseUnitAssignment[] {
  return assignments.filter(a => a.leaseId === leaseId && assignmentIsActiveOn(a, onDate));
}

/**
 * Resolve every Unit attached to a lease (with optional active-only filtering).
 * Returns rows ordered with main units first, ancillaries last.
 */
export function getLeaseAssignedUnits(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
  units: readonly Unit[],
  opts: { activeOnly?: boolean; onDate?: string } = {},
): { unit: Unit; assignment: LeaseUnitAssignment }[] {
  const onDate = opts.onDate ?? today();
  const rows = assignments.filter(a => {
    if (a.leaseId !== leaseId) return false;
    if (opts.activeOnly && !assignmentIsActiveOn(a, onDate)) return false;
    return true;
  });
  return rows
    .map(a => {
      const unit = units.find(u => u.id === a.unitId);
      return unit ? { unit, assignment: a } : null;
    })
    .filter((r): r is { unit: Unit; assignment: LeaseUnitAssignment } => r !== null)
    .sort((x, y) => {
      const xm = isMainLeaseUnit(x.unit) ? 1 : 0;
      const ym = isMainLeaseUnit(y.unit) ? 1 : 0;
      return ym - xm;
    });
}

/**
 * First main unit attached to a lease (active or historical). Returns the first
 * assignment whose unit type is not ancillary. Used purely as a display fallback —
 * leases may now have zero, one, or several main units.
 */
export function getMainLeaseUnit(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
  units: readonly Unit[],
): Unit | undefined {
  return getLeaseAssignedUnits(leaseId, assignments, units).find(r => isMainLeaseUnit(r.unit))?.unit;
}

/** @deprecated Alias of {@link getMainLeaseUnit}. Kept for legacy imports. */
export const getPrimaryLeaseUnit = getMainLeaseUnit;

/** Ancillary units for a lease (parking/cellar/storage/etc.). */
export function getAncillaryLeaseUnits(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
  units: readonly Unit[],
  opts: { activeOnly?: boolean; onDate?: string } = {},
): { unit: Unit; assignment: LeaseUnitAssignment }[] {
  return getLeaseAssignedUnits(leaseId, assignments, units, opts)
    .filter(r => isAncillaryLeaseUnit(r.unit));
}

/** True when a unit is currently attached to any active lease (primary OR ancillary). */
export function isUnitAssignedToActiveLease(
  unitId: string,
  leases: readonly Lease[],
  assignments: readonly LeaseUnitAssignment[],
  onDate: string = today(),
): boolean {
  return assignments.some(a =>
    a.unitId === unitId &&
    assignmentIsActiveOn(a, onDate) &&
    leases.some(l => l.id === a.leaseId && leaseOccupiesOn(l, onDate)),
  );
}

/**
 * Close (set endDate) every still-open assignment for a lease.
 * Returns the next assignments array; no-op if none are open.
 */
export function closeOpenAssignmentsForLease(
  leaseId: string,
  endDate: string,
  assignments: readonly LeaseUnitAssignment[],
  ts: string,
): LeaseUnitAssignment[] {
  return assignments.map(a =>
    a.leaseId === leaseId && !a.endDate
      ? { ...a, endDate, updatedAt: ts }
      : a,
  );
}

/**
 * Sum the rentShare/chargesShare across all assignments of a lease.
 * `null` shares are treated as 0 (legacy / not yet split).
 */
export function sumLeaseShares(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
  opts: { activeOnly?: boolean; onDate?: string } = {},
): { rent: number; charges: number } {
  const onDate = opts.onDate ?? localTodayISO();
  const rows = assignments.filter(a => {
    if (a.leaseId !== leaseId) return false;
    if (opts.activeOnly && !assignmentIsActiveOn(a, onDate)) return false;
    return true;
  });
  return {
    rent: rows.reduce((s, a) => s + (a.rentShare ?? 0), 0),
    charges: rows.reduce((s, a) => s + (a.chargesShare ?? 0), 0),
  };
}

/**
 * Look up the active lease + assignment covering a unit on a given date.
 * Returns the earliest active assignment when multiple match.
 */
export function getActiveLeaseForUnit(
  unitId: string,
  leases: readonly Lease[],
  assignments: readonly LeaseUnitAssignment[],
  onDate: string = today(),
): { lease: Lease; assignment: LeaseUnitAssignment } | undefined {
  const matches = assignments.filter(a =>
    a.unitId === unitId && assignmentIsActiveOn(a, onDate),
  );
  if (matches.length === 0) return undefined;
  const sorted = [...matches].sort((x, y) => x.startDate.localeCompare(y.startDate));
  for (const a of sorted) {
    const lease = leases.find(l => l.id === a.leaseId && leaseOccupiesOn(l, onDate));
    if (lease) return { lease, assignment: a };
  }
  return undefined;
}

/**
 * Legacy migration helper — no-op now. The DB migration that dropped
 * `lease.unitId` already backfilled every assignment row. Kept as a passthrough
 * to avoid touching every caller in a single change.
 */
export function migrateLegacyLeaseAssignments(
  _leases: readonly Lease[],
  existing: readonly LeaseUnitAssignment[],
): LeaseUnitAssignment[] {
  return [...existing];
}
