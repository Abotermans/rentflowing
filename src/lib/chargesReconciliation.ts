import type { Lease } from "@/types";
import type { ReceivableItem } from "@/types/receivables";
import type { CostAllocationResult, CostEntry } from "@/types/costs";
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