import type { Lease, UnitStatus } from "@/types";
import type { LeaseUnitAssignment } from "@/types";
import { assignmentIsActiveOn } from "@/lib/leaseAssignments";
import type { TranslationKey } from "@/i18n/translations";

export type DerivedOccupancy =
  | "vacant"
  | "move-in-pending"
  | "occupied"
  | "under-notice"
  | "move-out-scheduled"
  | "available-soon"
  | "reserved"
  | "unavailable"
  | "archived";

export interface OccupancyInfo {
  derived: DerivedOccupancy;
  manualStatus: UnitStatus;
  inconsistent: boolean;
  inconsistencyKey?: TranslationKey;
  activeLease?: Lease;
  availableFromDate?: string;
  /** Role inside the active lease — 'ancillary' for parking/cellar/storage. */
  occupancyRole?: "primary" | "ancillary";
  activeAssignment?: LeaseUnitAssignment;
  suggestedFix?: {
    targetStatus: UnitStatus;
    labelKey: TranslationKey;
    rationaleKey: TranslationKey;
    secondaryAction?: "create-lease";
  };
}

export interface OccupancyWarning {
  key: TranslationKey;
  params?: Record<string, string>;
}

/**
 * Compute derived occupancy state for a unit based on its active lease lifecycle.
 * This is the source of truth for occupancy display — manual `currentStatus` is secondary.
 */
export function getDerivedOccupancy(
  unitId: string,
  manualStatus: UnitStatus,
  leases: Lease[],
  assignments?: LeaseUnitAssignment[],
): OccupancyInfo {
  // Prefer assignment-aware lookup when assignments are provided.
  let activeLease: Lease | undefined;
  let activeAssignment: LeaseUnitAssignment | undefined;
  if (assignments && assignments.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const matches = assignments.filter(a => a.unitId === unitId && assignmentIsActiveOn(a, today));
    const sorted = [...matches].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
    for (const a of sorted) {
      const l = leases.find(x => x.id === a.leaseId && x.lifecycleStage === "active");
      if (l) { activeLease = l; activeAssignment = a; break; }
    }
  }
  if (!activeLease) {
    activeLease = leases.find((l) => l.unitId === unitId && l.lifecycleStage === "active");
  }
  const occupancyRole: "primary" | "ancillary" | undefined = activeAssignment
    ? (activeAssignment.isPrimary ? "primary" : "ancillary")
    : activeLease ? "primary" : undefined;

  if (!activeLease) {
    if (manualStatus === "archived") {
      return { derived: "archived", manualStatus, inconsistent: false };
    }
    // No active lease — respect manual operational status (vacant/reserved/unavailable).
    // "occupied" without a lease is the one illegal state and gets flagged.
    const inconsistent = manualStatus === "occupied";
    const derived: DerivedOccupancy = inconsistent
      ? "vacant"
      : (manualStatus as DerivedOccupancy);
    return {
      derived,
      manualStatus,
      inconsistent,
      inconsistencyKey: inconsistent
        ? "occupancy.inconsistencyOccupiedNoLease"
        : undefined,
      suggestedFix: inconsistent
        ? {
            targetStatus: "vacant",
            labelKey: "occupancy.fixMarkVacant",
            rationaleKey: "occupancy.rationaleNoLease",
            secondaryAction: "create-lease",
          }
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
  let inconsistencyKey: TranslationKey | undefined;
  let suggestedFix: OccupancyInfo["suggestedFix"];

  if (manualStatus === "vacant") {
    inconsistent = true;
    inconsistencyKey = "occupancy.inconsistencyVacantWithLease";
    suggestedFix = {
      targetStatus: "occupied",
      labelKey: "occupancy.fixSyncOccupied",
      rationaleKey: "occupancy.rationaleLeaseExists",
    };
  } else if (manualStatus === "reserved" && (derived === "occupied" || derived === "under-notice")) {
    inconsistent = true;
    inconsistencyKey = "occupancy.inconsistencyReservedWithLease";
    suggestedFix = {
      targetStatus: "occupied",
      labelKey: "occupancy.fixSyncOccupied",
      rationaleKey: "occupancy.rationaleReservationSuperseded",
    };
  }

  return {
    derived,
    manualStatus,
    inconsistent,
    inconsistencyKey,
    activeLease,
    activeAssignment,
    occupancyRole,
    availableFromDate,
    suggestedFix,
  };
}

/**
 * Get translation-key-based warnings for a unit's occupancy state.
 * Caller resolves via t() and interpolates `params` into the template.
 */
export function getUnitOccupancyWarnings(
  unitId: string,
  manualStatus: UnitStatus,
  leases: Lease[]
): OccupancyWarning[] {
  const info = getDerivedOccupancy(unitId, manualStatus, leases);
  const warnings: OccupancyWarning[] = [];

  if (info.inconsistent && info.inconsistencyKey) {
    warnings.push({ key: info.inconsistencyKey });
  }

  if (info.derived === "under-notice" && info.availableFromDate) {
    warnings.push({
      key: "occupancy.warningUnderNoticeDate",
      params: { date: info.availableFromDate },
    });
  }

  if (info.derived === "move-in-pending") {
    warnings.push({ key: "occupancy.warningMoveInPending" });
  }

  return warnings;
}

/**
 * Map a derived occupancy state to its StatusBadge translation key.
 */
export function getDerivedOccupancyKey(derived: DerivedOccupancy): TranslationKey {
  switch (derived) {
    case "vacant": return "status.vacant";
    case "move-in-pending": return "status.moveInPending";
    case "occupied": return "status.occupied";
    case "under-notice": return "status.underNotice";
    case "move-out-scheduled": return "status.moveOutScheduled";
    case "available-soon": return "status.availableSoon";
    case "reserved": return "status.reserved";
    case "unavailable": return "status.unavailable";
    case "archived": return "status.archived";
  }
}
