import type { Lease, LeaseUnitAssignment, Unit } from "@/types";
import type { ReceivableItem } from "@/types/receivables";
import type { CostAllocationResult, CostEntry, RecoveryType } from "@/types/costs";
import { getCostRecognitionWindow, recognizeAmountForPeriod } from "@/lib/costRecognition";
import { splitCostRecovery } from "@/lib/costRecovery";
import type { ChargesReconciliation } from "@/types/chargesReconciliation";
import { localTodayISO } from "@/lib/calendarToday";
import { getLeaseOccupancyEndDate } from "@/lib/occupancy";

// ===== Date helpers (UTC, day granularity) =====
function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function diffDaysInclusive(startISO: string, endISO: string): number {
  const s = parseISO(startISO).getTime();
  const e = parseISO(endISO).getTime();
  if (e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ReconciliationWindow {
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
}

export function findOverlappingReconciliation<T extends { periodStart: string; periodEnd: string }>(
  window: ReconciliationWindow,
  history: readonly T[],
): T | undefined {
  return history.find(row => row.periodStart <= window.end && row.periodEnd >= window.start);
}

export interface ReconciliationCostLine {
  costEntryId: string;
  unitId?: string;
  unitLabel?: string;
  label: string;
  costPeriodStart: string;
  costPeriodEnd: string;
  fullRecoverable: number;
  overlapDays: number;
  totalDays: number;
  proRataFactor: number;
  proRatedRecoverable: number;
}

export interface ReconciliationBreakdown {
  window: ReconciliationWindow;
  provisionsCollected: number;
  actualRecoverable: number;
  delta: number;
  /** Sign: positive => surplus (tenant overpaid). Negative => tenant owes more. */
  lines: ReconciliationCostLine[];
}

// ===== Lease-wide cost overview =====

export interface LeaseCostOverviewLine {
  costEntryId: string;
  costLabel: string;
  recoveryType: RecoveryType;
  recoverablePercentage: number | null;
  /** Full cost amount (before any unit split). */
  costFullAmount: number;
  unitId: string;
  unitLabel: string;
  assignmentStart: string;
  assignmentEnd: string;
  costPeriodStart: string;
  costPeriodEnd: string;
  overlapDays: number;
  totalDays: number;
  proRataFactor: number;
  /** Full allocation share for that unit (before time pro-rata). */
  allocatedAmount: number;
  recoverableAmount: number;
  ownerBurdenAmount: number;
  /** After time pro-rata against the assignment window. */
  proRatedAllocated: number;
  proRatedRecoverable: number;
  proRatedOwnerBurden: number;
  addedByAmendment: boolean;
  removedByAmendment: boolean;
}

export interface LeaseCostOverview {
  lines: LeaseCostOverviewLine[];
  totals: { allocated: number; recoverable: number; ownerBurden: number; fullAllocated: number; fullRecoverable: number };
}

function maxISO(a: string, b: string) { return a > b ? a : b; }
function minISO(a: string, b: string) { return a < b ? a : b; }

function allocationWindow(alloc: CostAllocationResult, cost: CostEntry): { start: string; end: string } {
  const recognitionWindow = getCostRecognitionWindow(cost);
  const start = alloc.periodStart ?? recognitionWindow.start;
  return { start, end: alloc.periodEnd ?? recognitionWindow.end ?? start };
}

/**
 * Compute every cost allocated to the units assigned to a lease (primary +
 * ancillary, including units added or removed via amendments), pro-rated by:
 *   - the allocation share already split across units by the allocation engine;
 *   - the overlap (in days) between the cost period and the unit-assignment
 *     window intersected with the lease period.
 *
 * Pure — no state mutations. Suitable for useMemo on render.
 */
export function computeLeaseCostOverview(
  lease: Lease,
  assignments: readonly LeaseUnitAssignment[],
  units: readonly Unit[],
  allocations: readonly CostAllocationResult[],
  costEntries: readonly CostEntry[],
  opts: { windowOverride?: ReconciliationWindow; todayISO?: string } = {},
): LeaseCostOverview {
  const today = opts.todayISO ?? localTodayISO();
  const leaseStart = lease.startDate;
  const leaseEnd = getLeaseOccupancyEndDate(lease) ?? today;
  const winStart = opts.windowOverride ? maxISO(opts.windowOverride.start, leaseStart) : leaseStart;
  const winEnd = opts.windowOverride ? minISO(opts.windowOverride.end, leaseEnd) : leaseEnd;

  const leaseAssignments = assignments.filter(a => a.leaseId === lease.id);
  const lines: LeaseCostOverviewLine[] = [];

  for (const a of leaseAssignments) {
    const aStart = maxISO(a.startDate, winStart);
    const aEnd = minISO(a.endDate ?? leaseEnd, winEnd);
    if (aStart > aEnd) continue;
    const unit = units.find(u => u.id === a.unitId);
    const unitLabel = unit ? (unit.unitLabel || unit.unitCode || unit.id) : a.unitId;
    const addedByAmendment = a.startDate > leaseStart;
    const removedByAmendment = !!a.endDate && a.endDate < leaseEnd;

    for (const alloc of allocations) {
      if (alloc.unitId !== a.unitId) continue;
      const cost = costEntries.find(c => c.id === alloc.costEntryId);
      if (!cost || cost.status !== "active" || cost.recoveryType === "informational" || cost.unitId !== null) continue;
      const { start: costStart, end: costEnd } = allocationWindow(alloc, cost);
      if (!costStart || !costEnd) continue;
      const totalDays = diffDaysInclusive(costStart, costEnd);
      if (totalDays <= 0) continue;
      const oStart = maxISO(costStart, aStart);
      const oEnd = minISO(costEnd, aEnd);
      if (oStart > oEnd) continue;
      const overlapDays = diffDaysInclusive(oStart, oEnd);
      if (overlapDays <= 0) continue;
      const factor = overlapDays / totalDays;
      lines.push({
        costEntryId: cost.id,
        costLabel: cost.label || cost.invoiceReference || "—",
        recoveryType: alloc.recoveryType,
        recoverablePercentage: cost.recoveryType === "partially-recoverable" ? cost.recoverablePercentage ?? 50 : null,
        costFullAmount: cost.amount,
        unitId: a.unitId,
        unitLabel,
        assignmentStart: aStart,
        assignmentEnd: aEnd,
        costPeriodStart: costStart,
        costPeriodEnd: costEnd,
        overlapDays,
        totalDays,
        proRataFactor: factor,
        allocatedAmount: alloc.allocatedAmount,
        recoverableAmount: alloc.recoverableAmount,
        ownerBurdenAmount: alloc.ownerBurdenAmount,
        proRatedAllocated: recognizeAmountForPeriod(alloc.allocatedAmount, costStart, costEnd, { start: oStart, end: oEnd }),
        proRatedRecoverable: recognizeAmountForPeriod(alloc.recoverableAmount, costStart, costEnd, { start: oStart, end: oEnd }),
        proRatedOwnerBurden: recognizeAmountForPeriod(alloc.ownerBurdenAmount, costStart, costEnd, { start: oStart, end: oEnd }),
        addedByAmendment,
        removedByAmendment,
      });
    }

    // Unit-scoped costs bear 100% on their unit, even if stale allocation rows exist.
    for (const cost of costEntries) {
      if (cost.unitId !== a.unitId) continue;
      if (cost.status !== "active" || cost.recoveryType === "informational") continue;
      const recognitionWindow = getCostRecognitionWindow(cost);
      const costStart = recognitionWindow.start;
      const costEnd = recognitionWindow.end ?? recognitionWindow.start;
      if (!costStart || !costEnd) continue;
      const totalDays = diffDaysInclusive(costStart, costEnd);
      if (totalDays <= 0) continue;
      const oStart = maxISO(costStart, aStart);
      const oEnd = minISO(costEnd, aEnd);
      if (oStart > oEnd) continue;
      const overlapDays = diffDaysInclusive(oStart, oEnd);
      if (overlapDays <= 0) continue;
      const factor = overlapDays / totalDays;
      const split = splitCostRecovery(cost.amount, cost.recoveryType, cost.recoverablePercentage);
      lines.push({
        costEntryId: cost.id,
        costLabel: cost.label || cost.invoiceReference || "—",
        recoveryType: cost.recoveryType,
        recoverablePercentage: cost.recoveryType === "partially-recoverable" ? cost.recoverablePercentage ?? 50 : null,
        costFullAmount: cost.amount,
        unitId: a.unitId,
        unitLabel,
        assignmentStart: aStart,
        assignmentEnd: aEnd,
        costPeriodStart: costStart,
        costPeriodEnd: costEnd,
        overlapDays,
        totalDays,
        proRataFactor: factor,
        allocatedAmount: cost.amount,
        recoverableAmount: split.recoverableAmount,
        ownerBurdenAmount: split.ownerBurdenAmount,
        proRatedAllocated: recognizeAmountForPeriod(cost.amount, costStart, costEnd, { start: oStart, end: oEnd }),
        proRatedRecoverable: recognizeAmountForPeriod(split.recoverableAmount, costStart, costEnd, { start: oStart, end: oEnd }),
        proRatedOwnerBurden: recognizeAmountForPeriod(split.ownerBurdenAmount, costStart, costEnd, { start: oStart, end: oEnd }),
        addedByAmendment,
        removedByAmendment,
      });
    }
  }

  // Sort: by cost label, then unit label, then assignment start
  lines.sort((x, y) =>
    x.costLabel.localeCompare(y.costLabel)
    || x.unitLabel.localeCompare(y.unitLabel)
    || x.assignmentStart.localeCompare(y.assignmentStart),
  );

  const totals = lines.reduce(
    (s, l) => ({
      allocated: s.allocated + l.proRatedAllocated,
      recoverable: s.recoverable + l.proRatedRecoverable,
      ownerBurden: s.ownerBurden + l.proRatedOwnerBurden,
      fullAllocated: s.fullAllocated + l.allocatedAmount,
      fullRecoverable: s.fullRecoverable + l.recoverableAmount,
    }),
    { allocated: 0, recoverable: 0, ownerBurden: 0, fullAllocated: 0, fullRecoverable: 0 },
  );
  return {
    lines,
    totals: {
      allocated: round2(totals.allocated),
      recoverable: round2(totals.recoverable),
      ownerBurden: round2(totals.ownerBurden),
      fullAllocated: round2(totals.fullAllocated),
      fullRecoverable: round2(totals.fullRecoverable),
    },
  };
}

/**
 * Compute the pro-rated recoverable amount for a single cost allocation against
 * a reconciliation window. The cost's recoverable amount is spread evenly
 * across the cost's full period; the window's overlap (in days) determines
 * the share counted in the reconciliation.
 */
export function proRateAllocation(
  alloc: CostAllocationResult,
  cost: CostEntry,
  window: ReconciliationWindow,
): ReconciliationCostLine | null {
  if (cost.status !== "active" || cost.recoveryType === "informational") return null;
  const { start: costStart, end: costEnd } = allocationWindow(alloc, cost);
  return proRateRecoverable(cost, alloc.recoverableAmount, costStart, costEnd, window);
}

function proRateRecoverable(
  cost: CostEntry,
  recoverableAmount: number,
  costStart: string,
  costEnd: string,
  window: ReconciliationWindow,
): ReconciliationCostLine | null {
  if (!costStart || !costEnd) return null;
  const totalDays = diffDaysInclusive(costStart, costEnd);
  if (totalDays <= 0) return null;

  const overlapStart = costStart > window.start ? costStart : window.start;
  const overlapEnd = costEnd < window.end ? costEnd : window.end;
  const overlapDays = overlapStart > overlapEnd ? 0 : diffDaysInclusive(overlapStart, overlapEnd);
  if (overlapDays <= 0) return null;

  const factor = overlapDays / totalDays;
  const proRated = recognizeAmountForPeriod(recoverableAmount, costStart, costEnd, { start: overlapStart, end: overlapEnd });

  return {
    costEntryId: cost.id,
    label: cost.label || cost.invoiceReference || "—",
    costPeriodStart: costStart,
    costPeriodEnd: costEnd,
    fullRecoverable: recoverableAmount,
    overlapDays,
    totalDays,
    proRataFactor: factor,
    proRatedRecoverable: proRated,
  };
}

/**
 * Compute a full reconciliation for the lease over the given window.
 * Pure — does not mutate state.
 *
 *  - `provisionsCollected` = sum of `charges` receivables actually paid
 *    (allocatedAmount) whose dueDate falls inside the window for the lease.
 *  - `actualRecoverable` = sum of pro-rated recoverable amounts for every unit
 *    assigned to the lease across the window.
 *  - `delta` = provisionsCollected − actualRecoverable. Positive => surplus.
 */
export function computeReconciliation(
  lease: Lease,
  window: ReconciliationWindow,
  receivables: ReceivableItem[],
  allocations: CostAllocationResult[],
  costEntries: CostEntry[],
  context?: { assignments: readonly LeaseUnitAssignment[]; units: readonly Unit[] },
): ReconciliationBreakdown {
  const provisionsCollected = round2(
    receivables
      .filter(r =>
        r.leaseId === lease.id
        && r.itemType === "charges"
        && r.dueDate >= window.start
        && r.dueDate <= window.end,
      )
      .reduce((sum, r) => sum + r.allocatedAmount, 0),
  );

  const lines: ReconciliationCostLine[] = [];
  if (context?.assignments.some(assignment => assignment.leaseId === lease.id)) {
    const overview = computeLeaseCostOverview(lease, context.assignments, context.units, allocations, costEntries, {
      windowOverride: window, todayISO: window.end,
    });
    for (const row of overview.lines) {
      if (row.proRatedRecoverable === 0) continue;
      lines.push({
        costEntryId: row.costEntryId,
        unitId: row.unitId,
        unitLabel: row.unitLabel,
        label: row.costLabel,
        costPeriodStart: row.costPeriodStart,
        costPeriodEnd: row.costPeriodEnd,
        fullRecoverable: row.recoverableAmount,
        overlapDays: row.overlapDays,
        totalDays: row.totalDays,
        proRataFactor: row.proRataFactor,
        proRatedRecoverable: row.proRatedRecoverable,
      });
    }
  } else {
    for (const alloc of allocations) {
      if (alloc.unitId !== lease.unitId) continue;
      if (alloc.recoverableAmount <= 0) continue;
      const cost = costEntries.find(c => c.id === alloc.costEntryId);
      if (!cost || cost.unitId !== null) continue;
      const line = proRateAllocation(alloc, cost, window);
      if (line && line.proRatedRecoverable > 0) lines.push(line);
    }
    for (const cost of costEntries) {
      if (cost.unitId !== lease.unitId || cost.status !== "active") continue;
      const recoverable = splitCostRecovery(cost.amount, cost.recoveryType, cost.recoverablePercentage).recoverableAmount;
      if (recoverable <= 0) continue;
      const recognitionWindow = getCostRecognitionWindow(cost);
      const line = proRateRecoverable(cost, recoverable, recognitionWindow.start, recognitionWindow.end ?? recognitionWindow.start, window);
      if (line && line.proRatedRecoverable > 0) lines.push(line);
    }
  }

  const actualRecoverable = round2(lines.reduce((s, l) => s + l.proRatedRecoverable, 0));
  const delta = round2(provisionsCollected - actualRecoverable);

  return { window, provisionsCollected, actualRecoverable, delta, lines };
}

/**
 * Suggest a default resolution based on the delta sign.
 *  - delta > 0 → surplus → carry-forward by default (operator can switch to refund).
 *  - delta < 0 → tenant owes → owe.
 *  - delta == 0 → none.
 */
export function suggestResolution(delta: number): ChargesReconciliation["resolution"] {
  if (Math.abs(delta) < 0.01) return "none";
  return delta > 0 ? "carry-forward" : "owe";
}
