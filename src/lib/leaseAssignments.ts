import type { Lease, LeaseUnitAssignment } from "@/types";
import { isAncillaryUnitType, type Unit } from "@/types";

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

const today = () => new Date().toISOString().slice(0, 10);

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
    leases.some(l => l.id === a.leaseId && l.lifecycleStage === "active"),
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
  const onDate = opts.onDate ?? new Date().toISOString().slice(0, 10);
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
    const lease = leases.find(l => l.id === a.leaseId && l.lifecycleStage === "active");
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
