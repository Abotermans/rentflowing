import type { LifecycleStage } from "@/types";
import type { IntegrityState } from "./types";

/**
 * Lifecycle stages whose assignments do NOT block other leases on the same unit.
 * A lease in any other stage (draft, pending-signature, signed, scheduled, active)
 * reserves the unit for its date range.
 */
const IGNORED_STAGES: ReadonlySet<LifecycleStage> = new Set<LifecycleStage>([
  "terminated",
  "ended",
]);

export interface OverlapAssignment {
  unitId: string;
  startDate: string;
  endDate: string | null;
}

export interface OverlapHit {
  unitId: string;
  otherLeaseId: string;
  otherStage: LifecycleStage;
  otherStart: string;
  otherEnd: string | null;
}

/** Inclusive overlap check; `null` endDate is treated as +infinity. */
function rangesOverlap(
  aStart: string, aEnd: string | null,
  bStart: string, bEnd: string | null,
): boolean {
  if (aEnd && aEnd < bStart) return false;
  if (bEnd && bEnd < aStart) return false;
  // Allow touching boundaries: end == next start is NOT a conflict.
  if (aEnd && aEnd === bStart) return false;
  if (bEnd && bEnd === aStart) return false;
  return true;
}

/**
 * Find every other lease whose unit assignment overlaps the proposed
 * assignments. Skips the lease being edited and any lease in an
 * IGNORED_STAGES lifecycle stage.
 */
export function findOverlappingLeases(
  leaseId: string | null,
  proposed: OverlapAssignment[],
  s: IntegrityState,
): OverlapHit[] {
  const hits: OverlapHit[] = [];
  for (const p of proposed) {
    if (!p.startDate) continue;
    for (const other of s.leaseUnitAssignments) {
      if (other.unitId !== p.unitId) continue;
      if (other.leaseId === leaseId) continue;
      const otherLease = s.leases.find(l => l.id === other.leaseId);
      if (!otherLease) continue;
      if (IGNORED_STAGES.has(otherLease.lifecycleStage)) continue;
      if (!rangesOverlap(p.startDate, p.endDate, other.startDate, other.endDate)) continue;
      hits.push({
        unitId: p.unitId,
        otherLeaseId: other.leaseId,
        otherStage: otherLease.lifecycleStage,
        otherStart: other.startDate,
        otherEnd: other.endDate,
      });
    }
  }
  return hits;
}