import type { Lease } from "@/types";
import type { LeaseUnitAssignment } from "@/types";
import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import { computeReceivableStatus } from "@/types/receivables";
import { computeCycles } from "./leaseCycles";
import { isAllInclusive } from "./leasePricing";

export interface GenerateResult {
  receivables: ReceivableItem[];
  /** Always null — kept for backwards-compatible callers. */
  prepaymentReceipt: CashReceipt | null;
  /** Always empty — kept for backwards-compatible callers. */
  allocations: ReceiptAllocation[];
}

export interface GenerateOptions {
  currencyCode: string;
  /** Bring-your-own id factory (keeps AppContext in charge of id sequencing). */
  genId: (prefix: string) => string;
  /** Today, for status computation. */
  today?: string;
  /**
   * Global lead time (in days) before a cycle's start date that the cycle
   * receivables are materialized. Applies to BOTH monthly and advance leases.
   * Cycle 1 is always emitted so future-dated leases keep a visible schedule.
   */
  leadDays: number;
  /** Assignment rows for the lease. Used to stamp the correct unit per cycle. */
  assignments?: readonly LeaseUnitAssignment[];
}

/**
 * Generate the full receivable ledger for a lease.
 *
 * Pure function — does not touch state. Behavior depends on `rentFormula`:
 *
 *  - `rentFormula = 1` (monthly): one rent + one charges receivable per month.
 *  - `rentFormula = N` (advance billing, e.g. 3, 6, 12): the lease is split
 *    into N-month cycles anchored to `startDate`. Each cycle produces ONE
 *    bundled rent receivable (`monthlyRent × cycleMonths`) and ONE bundled
 *    charges receivable (`monthlyCharges × cycleMonths`), both due at the
 *    cycle's start date and tagged with `cycleIndex` / `cycleEndDate`.
 *
 * The rent amount on each receivable already reflects the rent tier selected
 * via `rentFormula` (e.g. the cheaper 12-month rate from the unit's rent
 * tiers). No phantom prepayment receipts are created — when the tenant pays
 * a cycle, the operator records a normal cash receipt that allocates against
 * the bundled rent + charges receivables of that cycle.
 */
/**
 * Compute the due date for a cycle from the cycle start month and the
 * lease's `dueDayOfMonth`. Clamps the day to the month's last day so
 * February (and other short months) remain valid.
 */
function cycleDueDate(cycleStart: string, dueDay: number): string {
  const [y, m] = cycleStart.split("-").map(Number);
  // day 0 of next month = last day of current month
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(Math.floor(dueDay || 1), 1), lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function minDate(...dates: Array<string | null | undefined>): string | null {
  const valid = dates.filter((d): d is string => !!d);
  if (valid.length === 0) return null;
  return valid.sort()[0];
}

function assignmentForCycle(
  cycleStart: string,
  assignments: readonly LeaseUnitAssignment[] | undefined,
): LeaseUnitAssignment | undefined {
  return assignments?.find(a =>
    a.startDate <= cycleStart &&
    (!a.endDate || a.endDate >= cycleStart),
  );
}

export function generateLeaseReceivables(lease: Lease, opts: GenerateOptions): GenerateResult {
  const { currencyCode, genId, leadDays } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const receivables: ReceivableItem[] = [];
  if (lease.lifecycleStage !== "signed" && lease.lifecycleStage !== "active") {
    return { receivables, prepaymentReceipt: null, allocations: [] };
  }
  if (!lease.startDate || !lease.endDate) {
    return { receivables, prepaymentReceipt: null, allocations: [] };
  }

  const effectiveEndDate = minDate(
    lease.endDate,
    lease.moveOutActualDate,
    lease.moveOutScheduledDate,
    lease.intendedMoveOutDate,
  ) ?? lease.endDate;
  const scheduleLease = { ...lease, endDate: effectiveEndDate };
  const cycles = computeCycles(scheduleLease);
  const isAdvance = (lease.rentFormula || 1) > 1;
  const allInclusive = isAllInclusive(lease);
  const dueDay = lease.dueDayOfMonth || 1;

  // Global lead-time horizon: open cycles whose start date is within
  // `leadDays` of today. Applies to both monthly and advance leases.
  // Cycle 1 is always emitted.
  const horizonDate = new Date(Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)) + Math.max(0, leadDays ?? 0),
  )).toISOString().slice(0, 10);

  for (const cycle of cycles) {
    if (cycle.index > 1 && cycle.startDate > horizonDate) continue;
    const assignment = assignmentForCycle(cycle.startDate, opts.assignments);
    const unitId = assignment?.unitId ?? lease.unitId;
    const periodMonth = cycle.startDate.slice(0, 7);
    const dueDate = cycleDueDate(cycle.startDate, dueDay);
    const cycleSuffix = isAdvance
      ? ` (cycle ${cycle.index}, ${cycle.months} mo)`
      : "";

    if (cycle.rentTotal > 0) {
      const rentItem: ReceivableItem = {
        id: genId("ri"),
        leaseId: lease.id, tenantId: lease.primaryTenantId,
        propertyId: lease.propertyId, unitId,
        itemType: "rent",
        label: allInclusive
          ? (isAdvance ? `All-inclusive rent — ${cycle.months}-month advance${cycleSuffix}` : "Monthly all-inclusive rent")
          : (isAdvance ? `Rent — ${cycle.months}-month advance${cycleSuffix}` : "Monthly Rent"),
        periodMonth, dueDate,
        currencyCode,
        expectedAmount: cycle.rentTotal,
        allocatedAmount: 0,
        outstandingAmount: cycle.rentTotal,
        status: "open",
        priority: 10, origin: "lease-schedule", notes: "",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today, updatedAt: today,
      };
      rentItem.status = computeReceivableStatus(rentItem);
      receivables.push(rentItem);
    }
    // All-inclusive leases never emit a contractual charges receivable —
    // the rent line already covers the full tenant-facing amount. Actual
    // allocated charges/taxes are computed internally for reporting only.
    if (!allInclusive && cycle.chargesTotal > 0) {
      const chargesItem: ReceivableItem = {
        id: genId("ri"),
        leaseId: lease.id, tenantId: lease.primaryTenantId,
        propertyId: lease.propertyId, unitId,
        itemType: "charges",
        label: isAdvance ? `Charges — ${cycle.months}-month advance${cycleSuffix}` : "Monthly Charges",
        periodMonth, dueDate,
        currencyCode,
        expectedAmount: cycle.chargesTotal,
        allocatedAmount: 0,
        outstandingAmount: cycle.chargesTotal,
        status: "open",
        priority: 20, origin: "lease-schedule", notes: "",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today, updatedAt: today,
      };
      chargesItem.status = computeReceivableStatus(chargesItem);
      receivables.push(chargesItem);
    }
  }

  return { receivables, prepaymentReceipt: null, allocations: [] };
}
