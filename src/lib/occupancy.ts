import type { Lease, UnitStatus } from "@/types";

export type DerivedOccupancy =
  | "vacant"
  | "move-in-pending"
  | "occupied"
  | "under-notice"
  | "move-out-scheduled"
  | "available-soon";

export interface OccupancyInfo {
  derived: DerivedOccupancy;
  manualStatus: UnitStatus;
  inconsistent: boolean;
  inconsistencyMessage?: string;
  activeLease?: Lease;
  availableFromDate?: string;
}

/**
 * Compute derived occupancy state for a unit based on its active lease lifecycle.
 * This is the source of truth for occupancy display — manual `currentStatus` is secondary.
 */
export function getDerivedOccupancy(
  unitId: string,
  manualStatus: UnitStatus,
  leases: Lease[]
): OccupancyInfo {
  const activeLease = leases.find(
    (l) => l.unitId === unitId && l.leaseStatus === "active"
  );

  if (!activeLease) {
    // No active lease — derive vacant
    const inconsistent = manualStatus === "occupied";
    return {
      derived: "vacant",
      manualStatus,
      inconsistent,
      inconsistencyMessage: inconsistent
        ? "Unit is marked as occupied but has no active lease."
        : undefined,
    };
  }

  // Has active lease — determine occupancy nuance
  let derived: DerivedOccupancy;
  let availableFromDate: string | undefined;

  if (activeLease.noticeGiven) {
    // Under notice — still occupied until move-out
    derived = "under-notice";
    availableFromDate =
      activeLease.intendedMoveOutDate ??
      activeLease.moveOutScheduledDate ??
      activeLease.endDate;
  } else if (
    activeLease.moveOutScheduledDate &&
    !activeLease.moveOutActualDate
  ) {
    // Move-out scheduled but no notice flag — operational scheduling
    derived = "move-out-scheduled";
    availableFromDate = activeLease.moveOutScheduledDate;
  } else if (
    activeLease.moveInScheduledDate &&
    !activeLease.moveInActualDate
  ) {
    // Move-in not yet completed
    derived = "move-in-pending";
  } else {
    // Standard occupied
    derived = "occupied";
  }

  // Detect inconsistencies
  let inconsistent = false;
  let inconsistencyMessage: string | undefined;

  if (manualStatus === "vacant") {
    inconsistent = true;
    inconsistencyMessage =
      "Unit is marked as vacant but has an active lease — occupancy should reflect the lease state.";
  } else if (manualStatus === "reserved" && (derived === "occupied" || derived === "under-notice")) {
    inconsistent = true;
    inconsistencyMessage =
      "Unit is marked as reserved but has an active occupied lease.";
  }

  return {
    derived,
    manualStatus,
    inconsistent,
    inconsistencyMessage,
    activeLease,
    availableFromDate,
  };
}

/**
 * Get human-readable warnings for a unit's occupancy state.
 */
export function getUnitOccupancyWarnings(
  unitId: string,
  manualStatus: UnitStatus,
  leases: Lease[]
): string[] {
  const info = getDerivedOccupancy(unitId, manualStatus, leases);
  const warnings: string[] = [];

  if (info.inconsistent && info.inconsistencyMessage) {
    warnings.push(info.inconsistencyMessage);
  }

  if (info.derived === "under-notice" && info.availableFromDate) {
    warnings.push(
      `Unit is under notice — available from ${info.availableFromDate}.`
    );
  }

  if (info.derived === "move-in-pending") {
    warnings.push(
      "Move-in is scheduled but not yet completed — unit is not yet physically occupied."
    );
  }

  return warnings;
}

/**
 * Get a display label for derived occupancy (used alongside StatusBadge).
 */
export function getDerivedOccupancyLabel(derived: DerivedOccupancy): string {
  switch (derived) {
    case "vacant": return "Vacant";
    case "move-in-pending": return "Move-In Pending";
    case "occupied": return "Occupied";
    case "under-notice": return "Under Notice";
    case "move-out-scheduled": return "Move-Out Scheduled";
    case "available-soon": return "Available Soon";
  }
}
