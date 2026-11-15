import { isAncillaryUnitType, type Lease, type LeaseUnitAssignment, type Unit } from "../types/index.ts";
import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "../types/receivables.ts";
import { computeReceivableStatus } from "../types/receivables.ts";
import { computeCycles, type LeaseCycle } from "./leaseCycles.ts";
import { isAllInclusive } from "./leasePricing.ts";
import { getIndexedRentTotal } from "./leaseIndexation.ts";
import { localTodayISO } from "./calendarToday.ts";
import { roundMoney } from "./money.ts";

export interface GenerateResult {
  receivables: ReceivableItem[];
  /** Billing cycles omitted because no eligible unit assignment covers their start. */
  unassignedCycleStarts: string[];
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
   * Global lead time (in days) before a cycle's due date that the cycle
   * receivables are materialized. Applies to BOTH monthly and advance leases.
   * Cycle 1 is always emitted so future-dated leases keep a visible schedule.
   */
  leadDays: number;
  /** Assignment rows for the lease. Used to stamp the correct unit per cycle. */
  assignments?: readonly LeaseUnitAssignment[];
  /** Required with assignments; missing types leave cycles unassigned. */
  units?: readonly Pick<Unit, "id" | "unitType">[];
  /** Optional synthetic horizon used when an active/signed lease has no end date. */
  openEndedThroughDate?: string;
  /** Optional schedule start override for prospective amendment segments. */
  scheduleStartDate?: string;
  /** Resolve the lease terms that applied when a historical cycle began. */
  leaseForCycle?: (cycle: LeaseCycle) => Lease;
}

export interface HistoricalPaidReceivableOptions {
  currencyCode: string;
  genId: (prefix: string) => string;
  today?: string;
  assignments?: readonly Pick<LeaseUnitAssignment, "unitId" | "startDate" | "endDate">[];
  /** Required with assignments; missing types leave cycles unassigned. */
  units?: readonly Pick<Unit, "id" | "unitType">[];
  existingReceivables?: readonly ReceivableItem[];
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
export function cycleDueDate(cycleStart: string, dueDay: number): string {
  const [y, m] = cycleStart.split("-").map(Number);
  // day 0 of next month = last day of current month
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(Math.floor(dueDay || 1), 1), lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

/** A synthetic end must cover whole cycles, never truncate an open lease's next bill. */
export function getOpenEndedReceivableThroughDate(
  today: string,
  rentFormula: number | null | undefined,
  scheduleStartDate?: string,
  leadDays = 0,
  dueDay?: number,
): string {
  const rawMonths = Number(rentFormula);
  const months = Number.isFinite(rawMonths) ? Math.max(1, Math.floor(rawMonths)) : 1;
  if (!scheduleStartDate) return addDaysISO(addMonthsISO(today, months), -1);

  const horizon = addDaysISO(today, Math.max(0, leadDays));
  let offset = 0;
  while ((dueDay == null
    ? addMonthsISO(scheduleStartDate, offset + months)
    : cycleDueDate(addMonthsISO(scheduleStartDate, offset + months), dueDay)) <= horizon) {
    offset += months;
  }
  return addDaysISO(addMonthsISO(scheduleStartDate, offset + months), -1);
}

export function getScheduledReceivableKey(
  r: Pick<ReceivableItem, "leaseId" | "itemType" | "cycleIndex" | "cycleEndDate" | "periodMonth" | "dueDate" | "unitId">,
): string {
  const cycleKey = r.cycleIndex != null
    ? `cycle:${r.cycleIndex}:${r.dueDate}:${r.cycleEndDate ?? ""}`
    : `period:${r.periodMonth ?? ""}:${r.dueDate}`;
  return `${r.leaseId ?? ""}:${r.unitId ?? ""}:${r.itemType}:${cycleKey}`;
}

export function getScheduledReceivableSlotKey(
  r: Pick<ReceivableItem, "leaseId" | "unitId" | "itemType" | "periodMonth" | "dueDate">,
): string {
  return [r.leaseId, r.unitId, r.itemType, r.periodMonth, r.dueDate].join(":");
}

// A generated cycle bills the entire lease. Its unit is an attribution anchor,
// not part of the billing identity; that anchor can change after an amendment.
export function getLeaseBillingSlotKey(
  r: Pick<ReceivableItem, "leaseId" | "itemType" | "periodMonth" | "dueDate">,
): string {
  return [r.leaseId, r.itemType, r.periodMonth, r.dueDate].join(":");
}

export function getLeaseClosureReceivablesToReview(
  receivables: readonly ReceivableItem[],
  leaseId: string,
  endDate: string,
  protectedReceivableIds: ReadonlySet<string> = new Set(),
): { crossingCycles: ReceivableItem[]; unknownCycleEnds: ReceivableItem[]; protectedFuture: ReceivableItem[] } {
  const scheduled = receivables.filter(item =>
    item.leaseId === leaseId && item.origin === "lease-schedule" &&
    (item.itemType === "rent" || item.itemType === "charges") &&
    item.status !== "cancelled",
  );
  return {
    crossingCycles: scheduled.filter(item =>
      item.dueDate <= endDate && !!item.cycleEndDate && item.cycleEndDate > endDate,
    ),
    unknownCycleEnds: scheduled.filter(item =>
      item.dueDate <= endDate && !item.cycleEndDate,
    ),
    protectedFuture: scheduled.filter(item =>
      item.dueDate > endDate &&
      (item.allocatedAmount > 0 || !["open", "overdue"].includes(item.status) ||
        protectedReceivableIds.has(item.id)),
    ),
  };
}

export interface ActivatedAmendmentReceivableReconciliation {
  nextReceivables: ReceivableItem[];
  removedReceivables: ReceivableItem[];
  freshReceivables: ReceivableItem[];
}

export function reconcileActivatedAmendmentReceivables(
  existingReceivables: readonly ReceivableItem[],
  regeneratedReceivables: readonly ReceivableItem[],
  leaseId: string,
  effectiveDate: string,
  protectedReceivableIds: ReadonlySet<string> = new Set(),
): ActivatedAmendmentReceivableReconciliation {
  const removedReceivables = existingReceivables.filter(ri =>
    ri.leaseId === leaseId &&
    ri.origin === "lease-schedule" &&
    ri.dueDate >= effectiveDate &&
    (ri.status === "open" || ri.status === "overdue") &&
    ri.allocatedAmount <= 0 &&
    !protectedReceivableIds.has(ri.id),
  );
  const keptReceivables = existingReceivables.filter(ri =>
    ri.leaseId !== leaseId ||
    ri.origin !== "lease-schedule" ||
    ri.dueDate < effectiveDate ||
    (ri.status !== "open" && ri.status !== "overdue") ||
    ri.allocatedAmount > 0 ||
    protectedReceivableIds.has(ri.id),
  );
  const keptSlots = new Set(keptReceivables
    .filter(item => item.origin === "lease-schedule")
    .map(getLeaseBillingSlotKey));
  const keptCycles = new Map<string, Set<string | null>>();
  const cycleKey = (item: ReceivableItem) =>
    [item.leaseId, item.itemType, item.periodMonth].join(":");
  for (const item of keptReceivables) {
    if (item.leaseId !== leaseId || item.origin !== "lease-schedule") continue;
    const key = cycleKey(item);
    if (!keptCycles.has(key)) keptCycles.set(key, new Set());
    keptCycles.get(key)!.add(item.cycleEndDate ?? null);
  }
  const freshReceivables = regeneratedReceivables.filter(ri => {
    if (ri.leaseId !== leaseId || ri.dueDate < effectiveDate) return false;
    const slot = getLeaseBillingSlotKey(ri);
    if (keptSlots.has(slot)) return false;
    const key = cycleKey(ri);
    const ends = keptCycles.get(key);
    if (ends?.has(null) || ends?.has(ri.cycleEndDate ?? null) ||
        (ri.cycleEndDate == null && ends && ends.size > 0)) return false;
    keptSlots.add(slot);
    if (!ends) keptCycles.set(key, new Set([ri.cycleEndDate ?? null]));
    else ends.add(ri.cycleEndDate ?? null);
    return true;
  });

  return {
    nextReceivables: [...keptReceivables, ...freshReceivables],
    removedReceivables,
    freshReceivables,
  };
}

function minDate(...dates: Array<string | null | undefined>): string | null {
  const valid = dates.filter((d): d is string => !!d);
  if (valid.length === 0) return null;
  return valid.sort()[0];
}

function assignmentForCycle(
  cycleStart: string,
  assignments: readonly Pick<LeaseUnitAssignment, "unitId" | "startDate" | "endDate">[] | undefined,
  units?: readonly Pick<Unit, "id" | "unitType">[],
): Pick<LeaseUnitAssignment, "unitId" | "startDate" | "endDate"> | undefined {
  const active = assignments?.filter(a =>
    a.startDate <= cycleStart &&
    (!a.endDate || a.endDate >= cycleStart),
  );
  if (!units) return undefined;
  const mainUnitIds = new Set(units.filter(unit => !isAncillaryUnitType(unit.unitType)).map(unit => unit.id));
  return active?.filter(a => mainUnitIds.has(a.unitId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.unitId.localeCompare(b.unitId))[0];
}

export function generateLeaseReceivables(lease: Lease, opts: GenerateOptions): GenerateResult {
  const { currencyCode, genId, leadDays } = opts;
  const today = opts.today ?? localTodayISO();

  const receivables: ReceivableItem[] = [];
  const unassignedCycleStarts: string[] = [];
  if (lease.lifecycleStage !== "signed" && lease.lifecycleStage !== "active") {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }
  if (!lease.id || !lease.primaryTenantId || !lease.propertyId || !lease.startDate || (!lease.endDate && !opts.openEndedThroughDate)) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }

  const effectiveEndDate = minDate(
    lease.endDate || opts.openEndedThroughDate,
    lease.moveOutActualDate,
    lease.moveOutScheduledDate,
    lease.intendedMoveOutDate,
  ) ?? lease.endDate ?? opts.openEndedThroughDate;
  if (!effectiveEndDate) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }
  const scheduleStartDate = opts.scheduleStartDate && opts.scheduleStartDate > lease.startDate
    ? opts.scheduleStartDate
    : lease.startDate;
  if (effectiveEndDate < scheduleStartDate) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }
  const scheduleLease = { ...lease, startDate: scheduleStartDate, endDate: effectiveEndDate };
  const cycles = computeCycles(scheduleLease);
  const isAdvance = (lease.rentFormula || 1) > 1;
  const allInclusive = isAllInclusive(lease);
  const dueDay = lease.dueDayOfMonth || 1;

  // Global lead-time horizon: open cycles whose due date is within
  // `leadDays` of today. Applies to both monthly and advance leases.
  // Cycle 1 is always emitted.
  const horizonDate = new Date(Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)) + Math.max(0, leadDays ?? 0),
  )).toISOString().slice(0, 10);

  for (const cycle of cycles) {
    const nominalDueDate = cycleDueDate(cycle.startDate, dueDay);
    const dueDate = opts.scheduleStartDate && opts.scheduleStartDate > lease.startDate
      && cycle.index === 1 && nominalDueDate < scheduleStartDate
      ? scheduleStartDate
      : nominalDueDate;
    if (cycle.index > 1 && dueDate > horizonDate) continue;
    const assignment = assignmentForCycle(cycle.startDate, opts.assignments, opts.units);
    const unitId = opts.assignments ? assignment?.unitId : lease.unitId;
    if (!unitId) {
      unassignedCycleStarts.push(cycle.startDate);
      continue;
    }
    const periodMonth = cycle.startDate.slice(0, 7);
    const cycleSuffix = isAdvance
      ? ` (cycle ${cycle.index}, ${cycle.months} mo)`
      : "";

    const cycleLease = opts.leaseForCycle?.(cycle) ?? lease;
    if (!cycleLease.primaryTenantId) {
      unassignedCycleStarts.push(cycle.startDate);
      continue;
    }
    const indexedRentTotal = getIndexedRentTotal(cycleLease, cycle.startDate, cycle.months);
    if (indexedRentTotal > 0) {
      const rentItem: ReceivableItem = {
        id: genId("ri"),
        leaseId: lease.id, tenantId: cycleLease.primaryTenantId,
        propertyId: lease.propertyId, unitId,
        itemType: "rent",
        label: allInclusive
          ? (isAdvance ? `All-inclusive rent — ${cycle.months}-month advance${cycleSuffix}` : "Monthly all-inclusive rent")
          : (isAdvance ? `Rent — ${cycle.months}-month advance${cycleSuffix}` : "Monthly Rent"),
        periodMonth, dueDate,
        currencyCode,
        expectedAmount: indexedRentTotal,
        allocatedAmount: 0,
        outstandingAmount: indexedRentTotal,
        status: "open",
        priority: 10, origin: "lease-schedule", notes: "",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today, updatedAt: today,
      };
      rentItem.status = computeReceivableStatus(rentItem, today.slice(0, 10));
      receivables.push(rentItem);
    }
    // All-inclusive leases never emit a contractual charges receivable —
    // the rent line already covers the full tenant-facing amount. Actual
    // allocated charges/taxes are computed internally for reporting only.
    const chargesTotal = roundMoney(cycleLease.monthlyCharges * cycle.months);
    if (!allInclusive && chargesTotal > 0) {
      const chargesItem: ReceivableItem = {
        id: genId("ri"),
        leaseId: lease.id, tenantId: cycleLease.primaryTenantId,
        propertyId: lease.propertyId, unitId,
        itemType: "charges",
        label: isAdvance ? `Charges — ${cycle.months}-month advance${cycleSuffix}` : "Monthly Charges",
        periodMonth, dueDate,
        currencyCode,
        expectedAmount: chargesTotal,
        allocatedAmount: 0,
        outstandingAmount: chargesTotal,
        status: "open",
        priority: 20, origin: "lease-schedule", notes: "",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today, updatedAt: today,
      };
      chargesItem.status = computeReceivableStatus(chargesItem, today.slice(0, 10));
      receivables.push(chargesItem);
    }
  }

  return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
}

export function generateHistoricalPaidLeaseReceivables(lease: Lease, opts: HistoricalPaidReceivableOptions): GenerateResult {
  const { currencyCode, genId } = opts;
  const today = opts.today ?? localTodayISO();
  const receivables: ReceivableItem[] = [];
  const unassignedCycleStarts: string[] = [];

  if (!["active", "ended", "terminated"].includes(lease.lifecycleStage)) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }
  if (!lease.id || !lease.primaryTenantId || !lease.propertyId || !lease.startDate || !Number.isInteger(lease.dueDayOfMonth) || lease.dueDayOfMonth < 1) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }

  const syntheticEnd = getOpenEndedReceivableThroughDate(today, lease.rentFormula, lease.startDate);
  const effectiveEndDate = minDate(
    lease.endDate || syntheticEnd,
    lease.moveOutActualDate,
    lease.moveOutScheduledDate,
    lease.intendedMoveOutDate,
  ) ?? lease.endDate ?? syntheticEnd;
  if (!effectiveEndDate || effectiveEndDate < lease.startDate) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }

  const cycles = computeCycles({ ...lease, endDate: effectiveEndDate });
  const isAdvance = (lease.rentFormula || 1) > 1;
  const allInclusive = isAllInclusive(lease);
  const dueDay = lease.dueDayOfMonth;
  const existingKeys = new Set((opts.existingReceivables ?? [])
    .filter(item => item.origin === "lease-schedule")
    .map(getLeaseBillingSlotKey));

  for (const cycle of cycles) {
    const dueDate = cycleDueDate(cycle.startDate, dueDay);
    if (dueDate >= today) continue;

    const assignment = assignmentForCycle(cycle.startDate, opts.assignments, opts.units);
    const unitId = opts.assignments ? assignment?.unitId : lease.unitId;
    if (!unitId) {
      unassignedCycleStarts.push(cycle.startDate);
      continue;
    }
    const periodMonth = cycle.startDate.slice(0, 7);
    const cycleSuffix = isAdvance
      ? ` (cycle ${cycle.index}, ${cycle.months} mo)`
      : "";

    const maybePush = (item: ReceivableItem) => {
      const key = getLeaseBillingSlotKey(item);
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      receivables.push(item);
    };

    const indexedRentTotal = getIndexedRentTotal(lease, cycle.startDate, cycle.months);
    if (indexedRentTotal > 0) {
      maybePush({
        id: genId("ri"),
        leaseId: lease.id, tenantId: lease.primaryTenantId,
        propertyId: lease.propertyId, unitId,
        itemType: "rent",
        label: allInclusive
          ? (isAdvance ? `All-inclusive rent — ${cycle.months}-month advance${cycleSuffix}` : "Monthly all-inclusive rent")
          : (isAdvance ? `Rent — ${cycle.months}-month advance${cycleSuffix}` : "Monthly Rent"),
        periodMonth, dueDate,
        currencyCode,
        expectedAmount: indexedRentTotal,
        allocatedAmount: indexedRentTotal,
        outstandingAmount: 0,
        status: "paid",
        priority: 10, origin: "lease-schedule",
        notes: "Historical receivable backfilled as paid during lease creation.",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today, updatedAt: today,
      });
    }

    if (!allInclusive && cycle.chargesTotal > 0) {
      maybePush({
        id: genId("ri"),
        leaseId: lease.id, tenantId: lease.primaryTenantId,
        propertyId: lease.propertyId, unitId,
        itemType: "charges",
        label: isAdvance ? `Charges — ${cycle.months}-month advance${cycleSuffix}` : "Monthly Charges",
        periodMonth, dueDate,
        currencyCode,
        expectedAmount: cycle.chargesTotal,
        allocatedAmount: cycle.chargesTotal,
        outstandingAmount: 0,
        status: "paid",
        priority: 20, origin: "lease-schedule",
        notes: "Historical receivable backfilled as paid during lease creation.",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today, updatedAt: today,
      });
    }
  }

  return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
}
