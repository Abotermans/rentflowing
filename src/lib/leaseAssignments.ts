import type { Lease, LeaseUnitAssignment, LeaseUnitAssignmentType } from "@/types";
import { isAncillaryAssignmentType, ANCILLARY_UNIT_TYPES, type Unit } from "@/types";

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

export function getPrimaryAssignment(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
): LeaseUnitAssignment | undefined {
  return assignments.find(a => a.leaseId === leaseId && a.isPrimary);
}

/**
 * Resolve every Unit attached to a lease (with optional active-only filtering).
 * Returns rows in primary-first order. Units missing from the units array are skipped.
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
    .sort((x, y) => (y.assignment.isPrimary ? 1 : 0) - (x.assignment.isPrimary ? 1 : 0));
}

/** Primary unit attached to a lease (active or historical). */
export function getPrimaryLeaseUnit(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
  units: readonly Unit[],
): Unit | undefined {
  const a = assignments.find(x => x.leaseId === leaseId && x.isPrimary);
  return a ? units.find(u => u.id === a.unitId) : undefined;
}

/** Ancillary units for a lease (non-primary assignments). */
export function getAncillaryLeaseUnits(
  leaseId: string,
  assignments: readonly LeaseUnitAssignment[],
  units: readonly Unit[],
  opts: { activeOnly?: boolean; onDate?: string } = {},
): { unit: Unit; assignment: LeaseUnitAssignment }[] {
  return getLeaseAssignedUnits(leaseId, assignments, units, opts)
    .filter(r => !r.assignment.isPrimary);
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
  // Prefer primary then earliest
  const sorted = [...matches].sort((x, y) => (y.isPrimary ? 1 : 0) - (x.isPrimary ? 1 : 0));
  for (const a of sorted) {
    const lease = leases.find(l => l.id === a.leaseId && l.lifecycleStage === "active");
    if (lease) return { lease, assignment: a };
  }
  return undefined;
}

/**
 * Migrate legacy single-unit leases into one primary LeaseUnitAssignment row each.
 * Idempotent: only seeds a row when the lease has no assignment yet.
 */
export function migrateLegacyLeaseAssignments(
  leases: readonly Lease[],
  existing: readonly LeaseUnitAssignment[],
): LeaseUnitAssignment[] {
  // A lease is considered already migrated when it already has a primary row.
  const hasPrimary = new Set(existing.filter(a => a.isPrimary).map(a => a.leaseId));
  const added: LeaseUnitAssignment[] = [];
  let counter = 0;
  for (const l of leases) {
    if (hasPrimary.has(l.id)) continue;
    if (!l.unitId) continue;
    // Backfill primary share: lease total minus whatever ancillary shares already exist
    // (pre-seeded mockData rows). Floor at 0 to avoid negative shares from inconsistent data.
    const ancRent = existing
      .filter(a => a.leaseId === l.id)
      .reduce((s, a) => s + (a.rentShare ?? 0), 0);
    const ancCharges = existing
      .filter(a => a.leaseId === l.id)
      .reduce((s, a) => s + (a.chargesShare ?? 0), 0);
    const primaryRent = Math.max(0, l.monthlyRent - ancRent);
    const primaryCharges = Math.max(0, l.monthlyCharges - ancCharges);
    added.push({
      id: `lua-mig-${l.id}-${++counter}`,
      leaseId: l.id,
      unitId: l.unitId,
      assignmentType: "primary",
      isPrimary: true,
      startDate: l.startDate,
      endDate: l.lifecycleStage === "ended" || l.lifecycleStage === "terminated"
        ? (l.moveOutActualDate || l.endDate || null)
        : null,
      rentShare: primaryRent,
      chargesShare: primaryCharges,
      notes: "",
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    });
  }
  return [...existing, ...added];
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
