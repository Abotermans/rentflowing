import type { Lease, LeaseUnitAssignment, LeaseUnitAssignmentType } from "@/types";
import { isAncillaryAssignmentType, ANCILLARY_UNIT_TYPES, type Unit } from "@/types";

/** True when this assignment role represents a "main" (non-ancillary) unit. */
export const isMainAssignmentType = (t: LeaseUnitAssignmentType) => !isAncillaryAssignmentType(t);

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
 * Returns rows ordered with main (`primary` role) units first, ancillaries last.
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
      const xm = isMainAssignmentType(x.assignment.assignmentType) ? 1 : 0;
      const ym = isMainAssignmentType(y.assignment.assignmentType) ? 1 : 0;
      return ym - xm;
    });
}

/**
 * First main unit attached to a lease (active or historical). Returns the first
 * assignment whose role is not ancillary. Used purely as a display fallback —
 * leases may now have zero, one, or several main units.
 */
export function getMainLeaseUnit(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
  units: readonly Unit[],
): Unit | undefined {
  const a = assignments.find(x => x.leaseId === leaseId && isMainAssignmentType(x.assignmentType));
  return a ? units.find(u => u.id === a.unitId) : undefined;
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
    .filter(r => isAncillaryRole(r.assignment.assignmentType, r.unit));
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
 * Returns the primary assignment first when multiple match.
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
  // Prefer main role then earliest start.
  const sorted = [...matches].sort((x, y) => {
    const xm = isMainAssignmentType(x.assignmentType) ? 1 : 0;
    const ym = isMainAssignmentType(y.assignmentType) ? 1 : 0;
    if (xm !== ym) return ym - xm;
    return x.startDate.localeCompare(y.startDate);
  });
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

/**
 * Detect whether a unit, when assigned with a given assignmentType, should be
 * considered ancillary for occupancy KPIs.
 */
export function isAncillaryRole(
  assignmentType: LeaseUnitAssignmentType,
  unit: Pick<Unit, "unitType"> | undefined,
): boolean {
  if (isAncillaryAssignmentType(assignmentType)) return true;
  if (unit && ANCILLARY_UNIT_TYPES.has(unit.unitType)) return true;
  return false;
}

/**
 * Map a unit's physical type to the LeaseUnitAssignmentType that best
 * describes its role on a lease. Used so the UI doesn't need to expose a
 * separate "Role" choice — the role can always be derived from the unit.
 */
export function deriveAssignmentTypeFromUnit(
  unit: Pick<Unit, "unitType"> | undefined,
): LeaseUnitAssignmentType {
  switch (unit?.unitType) {
    case "parking": return "parking";
    case "storage": return "storage";
    case "apartment":
    case "studio":
    case "house":
    case "office":
    case "commercial-unit":
      return "primary";
    default:
      return "ancillary";
  }
}
