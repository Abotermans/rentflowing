/**
 * Operational profitability — pure calculation helpers.
 * Measures return BEFORE financing. No loans, no debt service, no DSCR.
 */
import type { Lease, LeaseUnitAssignment, Unit, Property } from "@/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";
import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import type { CostEntry, CostAllocationResult } from "@/types/costs";
import { getEffectivePropertyCostAmount } from "@/lib/propertyOwnership";
import { getCostRecognitionWindow, recognizeAmountForPeriod, recognizeCostAmountForPeriod } from "@/lib/costRecognition";
import { splitCostRecovery } from "@/lib/costRecovery";
import { localTodayISO } from "@/lib/calendarToday";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { getLeaseOccupancyEndDate } from "@/lib/occupancy";
import { receivableHasPlausibleAssignment } from "@/lib/leaseAssignments";
import { expectedScheduledCycleAmount, getReceivableUnitAttribution, receivableAmountForUnit } from "@/lib/receivableUnitAttribution";
import { getLeaseBillingSlotKey } from "@/lib/leaseReceivables";
import { roundMoney } from "@/lib/money";
import { Decimal } from "./decimal.ts";

export interface Period { start: string; end: string }

export interface RevenueSummary {
  theoreticalRent: number;
  billedRent: number;
  collectedRent: number;
  otherIncome: number;
  vacancyLoss: number;
  unpaidLoss: number;
  egi: number;
  flags: { otherIncomeUnavailable: true; vacancyDerived: true };
}

export interface CostSummary {
  directCharges: number;
  directTaxes: number;
  allocatedCharges: number;
  allocatedTaxes: number;
  totalActual: number;
}

export interface RecoverySummary {
  provisionsBilled: number;
  actualRecoverable: number;
  actualRecovered: number;
  ownerBorne: number;
  regularizationDelta: number;
  recoveryRatio: number | null;
  /** Provisions actually collected from tenants (may exceed actualRecoverable). */
  provisionsCollected: number;
  /** Excess of provisions collected over actual recoverable (≥ 0). */
  provisionsSurplus: number;
}

export interface YieldMetrics {
  grossYield: number | null;
  netYield: number | null;
  valuationAvailable: boolean;
}

export interface Profitability {
  period: Period;
  currencyCode: string;
  currencyMismatches: string[];
  assignmentMismatchCount: number;
  unitAttributionIssueCount: number;
  scheduleCycleIssueCount: number;
  revenue: RevenueSummary;
  costs: CostSummary;
  recovery: RecoverySummary;
  noi: number;
  noiMargin: number | null;
  oer: number | null;
  yields: YieldMetrics;
  notes: { code: string; severity: "info" | "warn" }[];
}

// ---------- date helpers ----------
function parseISO(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
function round2(value: number): number {
  return Number.isFinite(value) ? roundMoney(value) : value;
}

/** Default period: trailing 12 months ending today. */
export function defaultPeriod(todayISO?: string): Period {
  const today = todayISO ?? localTodayISO();
  const [year, month, day] = today.split("-").map(Number);
  const lastDayInPriorYearMonth = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  const d = new Date(Date.UTC(year - 1, month - 1, Math.min(day, lastDayInPriorYearMonth) + 1));
  return { start: d.toISOString().slice(0, 10), end: today };
}

/** YTD: Jan 1 → today. */
export function ytdPeriod(todayISO?: string): Period {
  const today = todayISO ?? localTodayISO();
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}

/** Current calendar month: 1st → today. */
export function currentMonthPeriod(todayISO?: string): Period {
  const today = todayISO ?? localTodayISO();
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

/** Current calendar year: Jan 1 → Dec 31. */
export function currentYearPeriod(todayISO?: string): Period {
  const today = todayISO ?? localTodayISO();
  const y = today.slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** All time: very wide window. */
export function allTimePeriod(todayISO?: string): Period {
  const today = todayISO ?? localTodayISO();
  return { start: "1970-01-01", end: today };
}

/** Pro-rate a cost amount to the window using day overlap. */
function proRate(amount: number, cs: string, ce: string | null, win: Period): number {
  return recognizeAmountForPeriod(amount, cs, ce, win);
}

function proRateAllocation(amount: number, allocation: CostAllocationResult, cost: CostEntry, win: Period): number {
  if (cost.recognitionMode !== "amortized") {
    return recognizeCostAmountForPeriod(cost, amount, win);
  }
  const recognitionWindow = getCostRecognitionWindow(cost);
  return proRate(amount, allocation.periodStart ?? recognitionWindow.start, allocation.periodEnd ?? recognitionWindow.end, win);
}

// ---------- shared inputs ----------
export interface ProfitabilityInputs {
  units: readonly Unit[];
  leases: readonly Lease[];
  assignments: readonly LeaseUnitAssignment[];
  amendments?: readonly LeaseAmendment[];
  amendmentChanges?: readonly LeaseAmendmentChange[];
  receivables: readonly ReceivableItem[];
  receipts: readonly CashReceipt[];
  allocations: readonly ReceiptAllocation[];
  costEntries: readonly CostEntry[];
  costAllocations: readonly CostAllocationResult[];
}

function inWindow(date: string, w: Period) { return date >= w.start && date <= w.end; }

function currencyMismatches(
  inputs: ProfitabilityInputs,
  win: Period,
  currencyCode: string,
  receivableInScope: (item: ReceivableItem) => boolean,
  costInScope: (item: CostEntry) => boolean,
): string[] {
  const currencies = new Set<string>();
  for (const item of inputs.receivables) {
    if (item.status === "cancelled" || !inWindow(item.dueDate, win) || !receivableInScope(item)) continue;
    if (!["rent", "charges", "charges-adjustment"].includes(item.itemType)) continue;
    if (item.currencyCode && item.currencyCode !== currencyCode) currencies.add(item.currencyCode);
  }
  for (const item of inputs.costEntries) {
    if (item.status !== "active" || !costInScope(item)) continue;
    if (item.currencyCode && item.currencyCode !== currencyCode
      && recognizeCostAmountForPeriod(item, item.amount, win) !== 0) currencies.add(item.currencyCode);
  }
  return [...currencies].sort();
}

function assignmentMismatchCount(
  inputs: ProfitabilityInputs,
  win: Period,
  receivableInScope: (item: ReceivableItem) => boolean,
): number {
  return inputs.receivables.filter(item => {
    if (item.origin !== "lease-schedule" || item.status === "cancelled"
      || !item.leaseId || !item.unitId || !inWindow(item.dueDate, win)
      || !receivableInScope(item)) return false;
    return !receivableHasPlausibleAssignment(item, inputs.assignments);
  }).length;
}

function unitAttributionIssueCount(unitId: string, inputs: ProfitabilityInputs, win: Period): number {
  return inputs.receivables.filter(item => {
    if (item.origin !== "lease-schedule" || item.status === "cancelled" || !item.leaseId
      || !inWindow(item.dueDate, win) || !["rent", "charges"].includes(item.itemType)) return false;
    const attribution = getReceivableUnitAttribution(item, inputs);
    return attribution.kind === "unavailable" && attribution.unitIds.includes(unitId);
  }).length;
}

function scheduleCycleIssueCount(propertyId: string, inputs: ProfitabilityInputs, win: Period): number {
  const leases = new Map(inputs.leases.map(lease => [lease.id, lease]));
  const groups = new Map<string, ReceivableItem[]>();
  for (const item of inputs.receivables) {
    if (item.origin !== "lease-schedule" || item.status === "cancelled" || !item.leaseId
      || !inWindow(item.dueDate, win) || !["rent", "charges"].includes(item.itemType)
      || leases.get(item.leaseId)?.propertyId !== propertyId) continue;
    const key = getLeaseBillingSlotKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  let affected = 0;
  for (const group of groups.values()) {
    const expected = expectedScheduledCycleAmount(group[0], leases.get(group[0].leaseId!)!, inputs);
    const billed = group.reduce((sum, item) => sum + item.expectedAmount, 0);
    if (expected === null || !Number.isFinite(billed) || Math.abs(billed - expected) >= 0.011) {
      affected += group.length;
    }
  }
  return affected;
}

function rentReceivablesFor(filter: (r: ReceivableItem) => boolean, inputs: ProfitabilityInputs, win: Period) {
  return inputs.receivables.filter(r => r.itemType === "rent" && r.status !== "cancelled" && inWindow(r.dueDate, win) && filter(r));
}
function chargeReceivablesFor(filter: (r: ReceivableItem) => boolean, inputs: ProfitabilityInputs, win: Period) {
  return inputs.receivables.filter(r => (r.itemType === "charges" || r.itemType === "charges-adjustment")
    && r.status !== "cancelled" && inWindow(r.dueDate, win) && filter(r));
}
function collectedAmountsOn(receivableIds: Set<string>, inputs: ProfitabilityInputs): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const allocation of inputs.allocations) {
    if (!receivableIds.has(allocation.receivableItemId)) continue;
    amounts.set(allocation.receivableItemId,
      (amounts.get(allocation.receivableItemId) ?? 0) + allocation.allocatedAmount);
  }
  for (const receivable of inputs.receivables) {
    if (receivableIds.has(receivable.id) && !amounts.has(receivable.id) && receivable.allocatedAmount > 0) {
      amounts.set(receivable.id, Math.min(receivable.allocatedAmount, receivable.expectedAmount));
    }
  }
  return amounts;
}
function collectedOn(receivableIds: Set<string>, inputs: ProfitabilityInputs): number {
  return round2([...collectedAmountsOn(receivableIds, inputs).values()].reduce((sum, amount) => sum + amount, 0));
}

// ---------- vacancy derivation ----------
function monthsInWindow(win: Period): string[] {
  const out: string[] = [];
  const start = new Date(parseISO(win.start));
  const end = new Date(parseISO(win.end));
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur <= end) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}
function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
function dayOrdinal(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function unitRentCoverage(unit: Unit, inputs: ProfitabilityInputs, win: Period): { potential: number; vacancy: number } {
  if (!unit.baseRent || unit.baseRent <= 0) return { potential: 0, vacancy: 0 };
  const leasesById = new Map(inputs.leases.map(lease => [lease.id, lease]));
  const occupied = inputs.assignments.flatMap(assignment => {
    if (assignment.unitId !== unit.id) return [];
    const lease = leasesById.get(assignment.leaseId);
    if (!lease || lease.lifecycleStage === "draft" || lease.lifecycleStage === "pending-signature") return [];
    const start = assignment.startDate > lease.startDate ? assignment.startDate : lease.startDate;
    const leaseEnd = getLeaseOccupancyEndDate(lease);
    const end = [assignment.endDate, leaseEnd].filter((date): date is string => Boolean(date))
      .reduce((earliest, date) => date < earliest ? date : earliest, "9999-12-31");
    return start <= end ? [{ start, end }] : [];
  });

  let potential = new Decimal(0);
  let vacancy = new Decimal(0);
  for (const ym of monthsInWindow(win)) {
    const first = `${ym}-01`;
    const last = monthEnd(ym);
    const start = [first, win.start, unit.availableFrom].filter((date): date is string => Boolean(date))
      .reduce((latest, date) => date > latest ? date : latest, first);
    const end = win.end < last ? win.end : last;
    if (start > end) continue;
    const startDay = dayOrdinal(start);
    const endDay = dayOrdinal(end);
    const monthDays = dayOrdinal(last) - dayOrdinal(first) + 1;
    const potentialDays = endDay - startDay + 1;
    const intervals = occupied
      .filter(interval => interval.start <= end && interval.end >= start)
      .map(interval => ({ start: dayOrdinal(interval.start > start ? interval.start : start),
        end: dayOrdinal(interval.end < end ? interval.end : end) }))
      .sort((a, b) => a.start - b.start);
    let occupiedDays = 0;
    let coveredThrough = startDay - 1;
    for (const interval of intervals) {
      const uncoveredStart = Math.max(interval.start, coveredThrough + 1);
      if (uncoveredStart <= interval.end) occupiedDays += interval.end - uncoveredStart + 1;
      coveredThrough = Math.max(coveredThrough, interval.end);
    }
    potential = potential.plus(new Decimal(unit.baseRent).times(potentialDays).div(monthDays));
    if (unit.currentStatus !== "unavailable" && unit.currentStatus !== "archived") {
      vacancy = vacancy.plus(new Decimal(unit.baseRent).times(potentialDays - occupiedDays).div(monthDays));
    }
  }
  return {
    potential: potential.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    vacancy: vacancy.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
  };
}

// ---------- UNIT ----------
export function getUnitRevenueSummary(unitId: string, inputs: ProfitabilityInputs, period?: Period, asOfDate?: string): RevenueSummary {
  const win = period ?? defaultPeriod();
  const today = asOfDate ?? localTodayISO();
  const unit = inputs.units.find(u => u.id === unitId);
  const rents = rentReceivablesFor(() => true, inputs, win);
  const collectedRents = collectedAmountsOn(new Set(rents.map(r => r.id)), inputs);
  const billedRent = round2(rents.reduce((s, r) => s + receivableAmountForUnit(r, r.expectedAmount, unitId, inputs), 0));
  const collectedRent = round2(rents.reduce((s, r) => s + receivableAmountForUnit(
    r, collectedRents.get(r.id) ?? 0, unitId, inputs,
  ), 0));
  const coverage = unit?.baseRent && unit.baseRent > 0 ? unitRentCoverage(unit, inputs, win) : null;
  const theoreticalRent = coverage?.potential ?? billedRent;
  const vacancyLoss = coverage?.vacancy ?? 0;
  const unpaidLoss = round2(Math.max(0, rents.filter(r => r.dueDate < today)
    .reduce((s, r) => s + receivableAmountForUnit(r, r.expectedAmount - r.allocatedAmount, unitId, inputs), 0)));
  const egi = round2(Math.max(0, billedRent - unpaidLoss));
  return {
    theoreticalRent, billedRent, collectedRent, otherIncome: 0,
    vacancyLoss, unpaidLoss, egi,
    flags: { otherIncomeUnavailable: true, vacancyDerived: true },
  };
}

export function getUnitCostSummary(unitId: string, inputs: ProfitabilityInputs, period?: Period): CostSummary {
  const win = period ?? defaultPeriod();
  let directCharges = 0, directTaxes = 0, allocatedCharges = 0, allocatedTaxes = 0;

  for (const c of inputs.costEntries) {
    if (c.unitId !== unitId) continue;
    if (c.status !== "active" || c.recoveryType === "informational") continue;
    const amt = recognizeCostAmountForPeriod(c, c.amount, win);
    if (c.isTax) directTaxes += amt; else directCharges += amt;
  }
  for (const a of inputs.costAllocations) {
    if (a.unitId !== unitId) continue;
    const ce = inputs.costEntries.find(c => c.id === a.costEntryId);
    if (!ce || ce.status !== "active" || ce.recoveryType === "informational" || ce.unitId !== null) continue;
    const amt = proRateAllocation(a.allocatedAmount, a, ce, win);
    if (ce.isTax) allocatedTaxes += amt; else allocatedCharges += amt;
  }
  return {
    directCharges: round2(directCharges), directTaxes: round2(directTaxes),
    allocatedCharges: round2(allocatedCharges), allocatedTaxes: round2(allocatedTaxes),
    totalActual: round2(directCharges + directTaxes + allocatedCharges + allocatedTaxes),
  };
}

export function getUnitRecoverySummary(unitId: string, inputs: ProfitabilityInputs, period?: Period): RecoverySummary {
  const win = period ?? defaultPeriod();
  const charges = chargeReceivablesFor(() => true, inputs, win);
  const collectedCharges = collectedAmountsOn(new Set(charges.map(r => r.id)), inputs);
  const provisionsBilled = round2(charges.reduce((s, r) => s + receivableAmountForUnit(r, r.expectedAmount, unitId, inputs), 0));
  const provisionsCollected = round2(charges.reduce((s, r) => s + receivableAmountForUnit(
    r, collectedCharges.get(r.id) ?? 0, unitId, inputs,
  ), 0));

  let recoverable = 0;
  for (const a of inputs.costAllocations) {
    if (a.unitId !== unitId) continue;
    const ce = inputs.costEntries.find(c => c.id === a.costEntryId);
    if (!ce || ce.status !== "active" || ce.recoveryType === "informational" || ce.unitId !== null) continue;
    recoverable += proRateAllocation(a.recoverableAmount, a, ce, win);
  }
  for (const c of inputs.costEntries) {
    if (c.unitId !== unitId || c.status !== "active" || c.recoveryType === "informational") continue;
    const split = splitCostRecovery(c.amount, c.recoveryType, c.recoverablePercentage);
    recoverable += recognizeCostAmountForPeriod(c, split.recoverableAmount, win);
  }
  const actualRecoverable = round2(recoverable);
  const costs = getUnitCostSummary(unitId, inputs, win);
  // Cap recovered to what's actually recoverable so a surplus doesn't shrink owner burden.
  const actualRecovered = round2(Math.min(provisionsCollected, actualRecoverable));
  const provisionsSurplus = round2(Math.max(0, provisionsCollected - actualRecoverable));
  const ownerBorne = round2(costs.totalActual - actualRecovered);
  const regularizationDelta = round2(actualRecoverable - provisionsBilled);
  const ratio = actualRecoverable > 0 ? provisionsCollected / actualRecoverable : null;
  const recoveryRatio = ratio === null ? null : Math.max(0, Math.min(1, round2(ratio * 100) / 100));
  return { provisionsBilled, actualRecoverable, actualRecovered, ownerBorne, regularizationDelta, recoveryRatio, provisionsCollected, provisionsSurplus };
}

export function getUnitYieldMetrics(unitId: string, inputs: ProfitabilityInputs, period?: Period): YieldMetrics {
  // Valuation field does not exist on Unit yet.
  return { grossYield: null, netYield: null, valuationAvailable: false };
}

export function getUnitProfitability(unitId: string, inputs: ProfitabilityInputs, property: Property | null, period?: Period): Profitability {
  const today = propertyBusinessDateISO(property);
  const win = period ?? defaultPeriod(today);
  const currencyCode = property?.currencyCode ?? "EUR";
  const revenue = getUnitRevenueSummary(unitId, inputs, win, today);
  const costs = getUnitCostSummary(unitId, inputs, win);
  const recovery = getUnitRecoverySummary(unitId, inputs, win);
  const noi = round2(revenue.egi - recovery.ownerBorne);
  const noiMargin = revenue.egi > 0 ? round2(noi / revenue.egi * 100) / 100 : null;
  const oer = revenue.egi > 0 ? round2(recovery.ownerBorne / revenue.egi * 100) / 100 : null;
  return {
    period: win, currencyCode,
    currencyMismatches: currencyMismatches(inputs, win, currencyCode,
      item => receivableAmountForUnit(item, item.expectedAmount, unitId, inputs) !== 0,
      item => item.unitId === unitId
        || (item.unitId === null && inputs.costAllocations.some(a => a.costEntryId === item.id && a.unitId === unitId))),
    assignmentMismatchCount: assignmentMismatchCount(inputs, win, item => item.unitId === unitId),
    unitAttributionIssueCount: unitAttributionIssueCount(unitId, inputs, win),
    scheduleCycleIssueCount: 0,
    revenue, costs, recovery,
    noi, noiMargin, oer,
    yields: getUnitYieldMetrics(unitId, inputs, win),
    notes: [
      { code: "no-valuation", severity: "info" },
      { code: "operational-only", severity: "info" },
    ],
  };
}

// ---------- PROPERTY ----------
export function getPropertyRevenueSummary(propertyId: string, inputs: ProfitabilityInputs, period?: Period, asOfDate?: string): RevenueSummary {
  const win = period ?? defaultPeriod();
  const propUnits = inputs.units.filter(u => u.propertyId === propertyId);
  const unitIds = new Set(propUnits.map(u => u.id));
  const rents = rentReceivablesFor(r => r.propertyId === propertyId || (r.unitId !== null && unitIds.has(r.unitId)), inputs, win);
  const billedRent = round2(rents.reduce((s, r) => s + r.expectedAmount, 0));
  const collectedRent = collectedOn(new Set(rents.map(r => r.id)), inputs);
  const coverage = propUnits.map(unit => unitRentCoverage(unit, inputs, win));
  const theoreticalRent = round2(propUnits.reduce((sum, unit, index) => {
    if (unit.baseRent && unit.baseRent > 0) return sum + coverage[index].potential;
    return sum + rents.reduce((unitSum, rent) => unitSum + receivableAmountForUnit(
      rent, rent.expectedAmount, unit.id, inputs,
    ), 0);
  }, 0));
  const vacancyLoss = round2(coverage.reduce((sum, item) => sum + item.vacancy, 0));
  const today = asOfDate ?? localTodayISO();
  const unpaidLoss = round2(Math.max(0, rents.filter(r => r.dueDate < today)
    .reduce((s, r) => s + (r.expectedAmount - r.allocatedAmount), 0)));
  const egi = round2(Math.max(0, billedRent - unpaidLoss));
  return {
    theoreticalRent, billedRent, collectedRent, otherIncome: 0,
    vacancyLoss, unpaidLoss, egi,
    flags: { otherIncomeUnavailable: true, vacancyDerived: true },
  };
}

export function getPropertyCostSummary(propertyId: string, inputs: ProfitabilityInputs, period?: Period, property?: Property | null): CostSummary {
  const win = period ?? defaultPeriod();
  let directCharges = 0, directTaxes = 0, allocatedCharges = 0, allocatedTaxes = 0;
  // Unit allocations distribute a property invoice; they do not reduce the
  // property's owner-managed cost when a rule leaves some units unallocated.
  for (const c of inputs.costEntries) {
    if (c.propertyId !== propertyId) continue;
    if (c.status !== "active" || c.recoveryType === "informational") continue;
    if (c.unitId !== null) continue;
    const amt = recognizeCostAmountForPeriod(c, getEffectivePropertyCostAmount(c, property, inputs.units), win);
    if (c.isTax) directTaxes += amt; else directCharges += amt;
  }
  // Unit-direct entries — also property costs at the aggregate level.
  const propUnitIds = new Set(inputs.units.filter(u => u.propertyId === propertyId).map(u => u.id));
  for (const c of inputs.costEntries) {
    if (c.unitId === null || !propUnitIds.has(c.unitId)) continue;
    if (c.status !== "active" || c.recoveryType === "informational") continue;
    const amt = recognizeCostAmountForPeriod(c, c.amount, win);
    if (c.isTax) allocatedTaxes += amt; else allocatedCharges += amt;
  }
  return {
    directCharges: round2(directCharges), directTaxes: round2(directTaxes),
    allocatedCharges: round2(allocatedCharges), allocatedTaxes: round2(allocatedTaxes),
    totalActual: round2(directCharges + directTaxes + allocatedCharges + allocatedTaxes),
  };
}

export function getPropertyRecoverySummary(propertyId: string, inputs: ProfitabilityInputs, period?: Period, property?: Property | null): RecoverySummary {
  const win = period ?? defaultPeriod();
  const propUnitIds = new Set(inputs.units.filter(u => u.propertyId === propertyId).map(u => u.id));
  const charges = chargeReceivablesFor(r => r.propertyId === propertyId || (r.unitId !== null && propUnitIds.has(r.unitId)), inputs, win);
  const provisionsBilled = round2(charges.reduce((s, r) => s + r.expectedAmount, 0));
  const provisionsCollected = collectedOn(new Set(charges.map(r => r.id)), inputs);

  let recoverable = 0;
  for (const c of inputs.costEntries) {
    if (c.propertyId !== propertyId || c.status !== "active" || c.recoveryType === "informational") continue;
    const costAmount = c.unitId ? c.amount : getEffectivePropertyCostAmount(c, property, inputs.units);
    const recognizedCost = recognizeCostAmountForPeriod(c, costAmount, win);
    const rows = c.unitId ? [] : inputs.costAllocations.filter(a => a.costEntryId === c.id && a.propertyId === propertyId);
    if (rows.length > 0) {
      const allocatedRecovery = rows.reduce((sum, row) => sum + proRateAllocation(row.recoverableAmount, row, c, win), 0);
      recoverable += Math.min(Math.max(0, allocatedRecovery), Math.max(0, recognizedCost));
      continue;
    }
    const split = splitCostRecovery(costAmount, c.recoveryType, c.recoverablePercentage);
    recoverable += recognizeCostAmountForPeriod(c, split.recoverableAmount, win);
  }
  const actualRecoverable = round2(recoverable);
  const costs = getPropertyCostSummary(propertyId, inputs, win, property);
  const actualRecovered = round2(Math.min(provisionsCollected, actualRecoverable));
  const provisionsSurplus = round2(Math.max(0, provisionsCollected - actualRecoverable));
  const ownerBorne = round2(costs.totalActual - actualRecovered);
  const regularizationDelta = round2(actualRecoverable - provisionsBilled);
  const ratio = actualRecoverable > 0 ? provisionsCollected / actualRecoverable : null;
  const recoveryRatio = ratio === null ? null : Math.max(0, Math.min(1, round2(ratio * 100) / 100));
  return { provisionsBilled, actualRecoverable, actualRecovered, ownerBorne, regularizationDelta, recoveryRatio, provisionsCollected, provisionsSurplus };
}

export function getPropertyYieldMetrics(_propertyId: string, _inputs: ProfitabilityInputs, _period?: Period): YieldMetrics {
  return { grossYield: null, netYield: null, valuationAvailable: false };
}

export function getPropertyProfitability(propertyId: string, inputs: ProfitabilityInputs, property: Property | null, period?: Period): Profitability {
  const today = propertyBusinessDateISO(property);
  const win = period ?? defaultPeriod(today);
  const currencyCode = property?.currencyCode ?? "EUR";
  const unitIds = new Set(inputs.units.filter(unit => unit.propertyId === propertyId).map(unit => unit.id));
  const revenue = getPropertyRevenueSummary(propertyId, inputs, win, today);
  const costs = getPropertyCostSummary(propertyId, inputs, win, property);
  const recovery = getPropertyRecoverySummary(propertyId, inputs, win, property);
  const noi = round2(revenue.egi - recovery.ownerBorne);
  const noiMargin = revenue.egi > 0 ? round2(noi / revenue.egi * 100) / 100 : null;
  const oer = revenue.egi > 0 ? round2(recovery.ownerBorne / revenue.egi * 100) / 100 : null;
  return {
    period: win, currencyCode,
    currencyMismatches: currencyMismatches(inputs, win, currencyCode,
      item => item.propertyId === propertyId || (item.unitId !== null && unitIds.has(item.unitId)),
      item => item.propertyId === propertyId || (item.unitId !== null && unitIds.has(item.unitId))),
    assignmentMismatchCount: assignmentMismatchCount(inputs, win,
      item => item.propertyId === propertyId || (item.unitId !== null && unitIds.has(item.unitId))),
    unitAttributionIssueCount: 0,
    scheduleCycleIssueCount: scheduleCycleIssueCount(propertyId, inputs, win),
    revenue, costs, recovery,
    noi, noiMargin, oer,
    yields: getPropertyYieldMetrics(propertyId, inputs, win),
    notes: [
      { code: "no-valuation", severity: "info" },
      { code: "operational-only", severity: "info" },
    ],
  };
}
