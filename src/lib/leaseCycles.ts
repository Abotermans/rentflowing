import type { Lease } from "../types/index.ts";
import type { ReceivableItem } from "../types/receivables.ts";
import type { LeaseAmendment, LeaseAmendmentChange } from "../types/amendments.ts";

export interface LeaseCycle {
  /** 1-based index of the cycle within the lease. */
  index: number;
  /** Number of months covered by this cycle (≤ rentFormula, smaller only for the final truncated cycle). */
  months: number;
  /** Inclusive start date YYYY-MM-DD. */
  startDate: string;
  /** Inclusive end date YYYY-MM-DD (last day actually covered). */
  endDate: string;
  rentTotal: number;
  chargesTotal: number;
  total: number;
}

function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return dt.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Compute every advance billing cycle for a lease.
 *
 * Cycles are anchored to the lease start date. Cycle k runs from
 * `start + (k-1) * N months` to `start + k * N months − 1 day`. The final
 * cycle is truncated at `lease.endDate` if the lease ends mid-cycle, and its
 * rent / charges totals are prorated by the number of months it actually
 * spans (rounded up so a partial month still counts as a full one — matches
 * tenant invoicing practice).
 *
 * For `rentFormula = 1`, this returns one cycle per month.
 */
export function computeCycles(lease: Pick<Lease, "rentFormula" | "startDate" | "endDate" | "monthlyRent" | "monthlyCharges">): LeaseCycle[] {
  const N = Math.max(1, Math.floor(lease.rentFormula || 1));
  if (!lease.startDate || !lease.endDate || lease.endDate < lease.startDate) return [];

  const cycles: LeaseCycle[] = [];
  let monthOffset = 0;
  let index = 1;

  while (addMonthsISO(lease.startDate, monthOffset) <= lease.endDate) {
    const cycleStart = addMonthsISO(lease.startDate, monthOffset);
    let span = 1;
    while (span < N && addMonthsISO(lease.startDate, monthOffset + span) <= lease.endDate) {
      span += 1;
    }
    const cycleEnd = addDaysISO(addMonthsISO(lease.startDate, monthOffset + span), -1);
    const clampedEnd = cycleEnd > lease.endDate ? lease.endDate : cycleEnd;
    const rentTotal = Math.round(lease.monthlyRent * span * 100) / 100;
    const chargesTotal = Math.round(lease.monthlyCharges * span * 100) / 100;
    cycles.push({
      index,
      months: span,
      startDate: cycleStart,
      endDate: clampedEnd,
      rentTotal,
      chargesTotal,
      total: Math.round((rentTotal + chargesTotal) * 100) / 100,
    });
    monthOffset += span;
    index += 1;
  }

  return cycles;
}

/** Return the cycle containing today (or null if today is outside the lease range). */
export function getCurrentCycle(cycles: LeaseCycle[], todayISO: string): LeaseCycle | null {
  return cycles.find(c => c.startDate <= todayISO && todayISO <= c.endDate) ?? null;
}

/** Return the cycle right after today's (or the first future cycle if today is before lease start). */
export function getNextCycle(cycles: LeaseCycle[], todayISO: string): LeaseCycle | null {
  return cycles.find(c => c.startDate > todayISO) ?? null;
}

/** The current formula's cycles restart when an applied formula amendment takes effect. */
export function getRentFormulaSegmentStart(
  lease: Pick<Lease, "id" | "startDate">,
  asOfDate: string,
  amendments: readonly LeaseAmendment[],
  changes: readonly LeaseAmendmentChange[],
): string {
  const formulaAmendmentIds = new Set(changes.filter(change => change.fieldName === "rentFormula").map(change => change.amendmentId));
  return amendments
    .filter(amendment => amendment.leaseId === lease.id
      && (amendment.status === "active" || amendment.status === "ended" || amendment.status === "terminated")
      && amendment.effectiveDate <= asOfDate
      && formulaAmendmentIds.has(amendment.id))
    .reduce((latest, amendment) => amendment.effectiveDate > latest ? amendment.effectiveDate : latest, lease.startDate);
}

/** Sum allocated against rent + charges receivables generated for a given cycle. */
export function getCyclePaidAmount(cycle: LeaseCycle, receivables: ReceivableItem[]): number {
  return receivables
    .filter(r => r.cycleIndex === cycle.index
      && r.periodMonth === cycle.startDate.slice(0, 7)
      && (!r.cycleEndDate || r.cycleEndDate === cycle.endDate)
      && (r.itemType === "rent" || r.itemType === "charges"))
    .reduce((s, r) => s + r.allocatedAmount, 0);
}
