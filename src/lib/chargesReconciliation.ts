import type { Lease, LeaseUnitAssignment, Unit } from "@/types";
import type { ReceivableItem } from "@/types/receivables";
import type { CostAllocationResult, CostEntry, RecoveryType } from "@/types/costs";
import type { ChargesReconciliation } from "@/types/chargesReconciliation";

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

export interface ReconciliationCostLine {
  costEntryId: string;
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
  const today = opts.todayISO ?? new Date().toISOString().slice(0, 10);
  const leaseStart = lease.startDate;
  const leaseEnd = lease.moveOutActualDate ?? lease.endDate ?? today;
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
    const removedByAmendment = !!a.endDate && a.endDate < (lease.endDate ?? today);

    for (const alloc of allocations) {
      if (alloc.unitId !== a.unitId) continue;
      const cost = costEntries.find(c => c.id === alloc.costEntryId);
      if (!cost) continue;
      const costStart = alloc.periodStart ?? cost.startDate;
      const costEnd = alloc.periodEnd ?? cost.endDate ?? cost.startDate;
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
        proRatedAllocated: round2(alloc.allocatedAmount * factor),
        proRatedRecoverable: round2(alloc.recoverableAmount * factor),
        proRatedOwnerBurden: round2(alloc.ownerBurdenAmount * factor),
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
  const costStart = alloc.periodStart ?? cost.startDate;
  const costEnd = alloc.periodEnd ?? cost.endDate ?? cost.startDate;
  if (!costStart || !costEnd) return null;
  const totalDays = diffDaysInclusive(costStart, costEnd);
  if (totalDays <= 0) return null;

  const overlapStart = costStart > window.start ? costStart : window.start;
  const overlapEnd = costEnd < window.end ? costEnd : window.end;
  const overlapDays = overlapStart > overlapEnd ? 0 : diffDaysInclusive(overlapStart, overlapEnd);
  if (overlapDays <= 0) return null;

  const factor = overlapDays / totalDays;
  const proRated = round2(alloc.recoverableAmount * factor);

  return {
    costEntryId: alloc.costEntryId,
    label: cost.label || cost.invoiceReference || "—",
    costPeriodStart: costStart,
    costPeriodEnd: costEnd,
    fullRecoverable: alloc.recoverableAmount,
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
 *  - `actualRecoverable` = sum of pro-rated recoverable amounts for the lease's
 *    primary unit across the window.
 *  - `delta` = provisionsCollected − actualRecoverable. Positive => surplus.
 */
export function computeReconciliation(
  lease: Lease,
  window: ReconciliationWindow,
  receivables: ReceivableItem[],
  allocations: CostAllocationResult[],
  costEntries: CostEntry[],
): ReconciliationBreakdown {
  const provisionsCollected = round2(
    receivables
      .filter(r =>
        r.leaseId === lease.id
        && (r.itemType === "charges" || r.itemType === "charges-adjustment")
        && r.dueDate >= window.start
        && r.dueDate <= window.end,
      )
      .reduce((sum, r) => sum + (r.itemType === "charges-adjustment"
        // adjustment can be negative (carry-forward / refund); count signed.
        ? r.allocatedAmount
        : r.allocatedAmount), 0),
  );

  const lines: ReconciliationCostLine[] = [];
  for (const alloc of allocations) {
    if (alloc.unitId !== lease.unitId) continue;
    if (alloc.recoverableAmount <= 0) continue;
    const cost = costEntries.find(c => c.id === alloc.costEntryId);
    if (!cost) continue;
    const line = proRateAllocation(alloc, cost, window);
    if (line && line.proRatedRecoverable > 0) lines.push(line);
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