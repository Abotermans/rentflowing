/**
 * Operational profitability — pure calculation helpers.
 * Measures return BEFORE financing. No loans, no debt service, no DSCR.
 */
import type { Lease, LeaseUnitAssignment, Unit, Property } from "@/types";
import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import type { CostEntry, CostAllocationResult, RecoveryType } from "@/types/costs";

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
const DAY = 86400000;
function parseISO(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
function diffDays(a: string, b: string): number {
  return Math.max(0, Math.round((parseISO(b) - parseISO(a)) / DAY) + 1);
}
function maxISO(a: string, b: string) { return a > b ? a : b; }
function minISO(a: string, b: string) { return a < b ? a : b; }
function round2(n: number) { return Math.round(n * 100) / 100; }

/** Default period: trailing 12 months ending today. */
export function defaultPeriod(todayISO?: string): Period {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const d = new Date(parseISO(today));
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return { start: d.toISOString().slice(0, 10), end: today };
}

/** YTD: Jan 1 → today. */
export function ytdPeriod(todayISO?: string): Period {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}

/** Current calendar month: 1st → today. */
export function currentMonthPeriod(todayISO?: string): Period {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

/** Current calendar year: Jan 1 → Dec 31. */
export function currentYearPeriod(todayISO?: string): Period {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const y = today.slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** All time: very wide window. */
export function allTimePeriod(todayISO?: string): Period {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  return { start: "1970-01-01", end: today };
}

function splitRecovery(amount: number, rt: RecoveryType) {
  switch (rt) {
    case "owner-only": return { recoverable: 0, owner: amount };
    case "tenant-recoverable": return { recoverable: amount, owner: 0 };
    case "partially-recoverable": { const h = round2(amount / 2); return { recoverable: h, owner: round2(amount - h) }; }
    case "informational": default: return { recoverable: 0, owner: 0 };
  }
}

/** Pro-rate a cost amount to the window using day overlap. */
function proRate(amount: number, cs: string, ce: string | null, win: Period): number {
  const start = cs;
  const end = ce ?? cs;
  if (!start || !end) return 0;
  const total = diffDays(start, end);
  if (total <= 0) return 0;
  const oStart = maxISO(start, win.start);
  const oEnd = minISO(end, win.end);
  if (oStart > oEnd) return 0;
  const overlap = diffDays(oStart, oEnd);
  return round2(amount * (overlap / total));
}

// ---------- shared inputs ----------
export interface ProfitabilityInputs {
  units: readonly Unit[];
  leases: readonly Lease[];
  assignments: readonly LeaseUnitAssignment[];
  receivables: readonly ReceivableItem[];
  receipts: readonly CashReceipt[];
  allocations: readonly ReceiptAllocation[];
  costEntries: readonly CostEntry[];
  costAllocations: readonly CostAllocationResult[];
}

function inWindow(date: string, w: Period) { return date >= w.start && date <= w.end; }

function rentReceivablesFor(filter: (r: ReceivableItem) => boolean, inputs: ProfitabilityInputs, win: Period) {
  return inputs.receivables.filter(r => (r.itemType === "rent") && inWindow(r.dueDate, win) && filter(r));
}
function chargeReceivablesFor(filter: (r: ReceivableItem) => boolean, inputs: ProfitabilityInputs, win: Period) {
  return inputs.receivables.filter(r => (r.itemType === "charges" || r.itemType === "charges-adjustment") && inWindow(r.dueDate, win) && filter(r));
}
function collectedOn(receivableIds: Set<string>, inputs: ProfitabilityInputs): number {
  return round2(inputs.allocations
    .filter(a => receivableIds.has(a.receivableItemId))
    .reduce((s, a) => s + a.allocatedAmount, 0));
}

// ---------- vacancy derivation (unit-month grid) ----------
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
function unitHasActiveLeaseInMonth(unitId: string, ym: string, inputs: ProfitabilityInputs): boolean {
  const monthStart = `${ym}-01`;
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${ym}-${String(lastDay).padStart(2, "0")}`;
  return inputs.assignments.some(a => {
    if (a.unitId !== unitId) return false;
    const lease = inputs.leases.find(l => l.id === a.leaseId);
    if (!lease) return false;
    if (["draft", "pending-signature", "ended", "terminated"].includes(lease.lifecycleStage)) {
      // still count if dates overlap window
    }
    const aStart = a.startDate;
    const aEnd = a.endDate ?? lease.endDate ?? "9999-12-31";
    return aStart <= monthEnd && aEnd >= monthStart;
  });
}
function unitVacancyLoss(unit: Unit, inputs: ProfitabilityInputs, win: Period): number {
  if (!unit.baseRent || unit.baseRent <= 0) return 0;
  if (unit.currentStatus === "unavailable" || unit.currentStatus === "archived") return 0;
  const months = monthsInWindow(win);
  let loss = 0;
  for (const ym of months) {
    if (!unitHasActiveLeaseInMonth(unit.id, ym, inputs)) loss += unit.baseRent;
  }
  return round2(loss);
}

// ---------- UNIT ----------
export function getUnitRevenueSummary(unitId: string, inputs: ProfitabilityInputs, period?: Period): RevenueSummary {
  const win = period ?? defaultPeriod();
  const unit = inputs.units.find(u => u.id === unitId);
  const rents = rentReceivablesFor(r => r.unitId === unitId, inputs, win);
  const billedRent = round2(rents.reduce((s, r) => s + r.expectedAmount, 0));
  const collectedRent = collectedOn(new Set(rents.map(r => r.id)), inputs);
  const theoreticalRent = unit && unit.baseRent ? round2(unit.baseRent * monthsInWindow(win).length) : billedRent;
  const vacancyLoss = unit ? unitVacancyLoss(unit, inputs, win) : 0;
  const unpaidLoss = round2(Math.max(0, rents.filter(r => r.dueDate < new Date().toISOString().slice(0, 10))
    .reduce((s, r) => s + (r.expectedAmount - r.allocatedAmount), 0)));
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
    if (c.status !== "active") continue;
    const amt = proRate(c.amount, c.startDate, c.endDate, win);
    if (c.isTax) directTaxes += amt; else directCharges += amt;
  }
  for (const a of inputs.costAllocations) {
    if (a.unitId !== unitId) continue;
    const ce = inputs.costEntries.find(c => c.id === a.costEntryId);
    if (!ce) continue;
    // Prefer allocation period as the source-of-truth window; fall back to entry dates.
    const startISO = a.periodStart ?? ce.startDate;
    const endISO = a.periodEnd ?? ce.endDate ?? a.periodStart ?? ce.startDate;
    const amt = proRate(a.allocatedAmount, startISO, endISO, win);
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
  const charges = chargeReceivablesFor(r => r.unitId === unitId, inputs, win);
  const provisionsBilled = round2(charges.reduce((s, r) => s + r.expectedAmount, 0));
  const provisionsCollected = collectedOn(new Set(charges.map(r => r.id)), inputs);

  let recoverable = 0;
  for (const a of inputs.costAllocations) {
    if (a.unitId !== unitId) continue;
    const ce = inputs.costEntries.find(c => c.id === a.costEntryId);
    if (!ce) continue;
    recoverable += proRate(a.recoverableAmount, a.periodStart ?? ce.startDate, a.periodEnd ?? ce.endDate, win);
  }
  for (const c of inputs.costEntries) {
    if (c.unitId !== unitId || c.status !== "active") continue;
    const split = splitRecovery(c.amount, c.recoveryType);
    recoverable += proRate(split.recoverable, c.startDate, c.endDate, win);
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
  const win = period ?? defaultPeriod();
  const revenue = getUnitRevenueSummary(unitId, inputs, win);
  const costs = getUnitCostSummary(unitId, inputs, win);
  const recovery = getUnitRecoverySummary(unitId, inputs, win);
  const noi = round2(revenue.egi - recovery.ownerBorne);
  const noiMargin = revenue.egi > 0 ? round2(noi / revenue.egi * 100) / 100 : null;
  const oer = revenue.egi > 0 ? round2(recovery.ownerBorne / revenue.egi * 100) / 100 : null;
  return {
    period: win, currencyCode: property?.currencyCode ?? "EUR",
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
export function getPropertyRevenueSummary(propertyId: string, inputs: ProfitabilityInputs, period?: Period): RevenueSummary {
  const win = period ?? defaultPeriod();
  const propUnits = inputs.units.filter(u => u.propertyId === propertyId);
  const unitIds = new Set(propUnits.map(u => u.id));
  const rents = rentReceivablesFor(r => r.propertyId === propertyId || (r.unitId !== null && unitIds.has(r.unitId)), inputs, win);
  const billedRent = round2(rents.reduce((s, r) => s + r.expectedAmount, 0));
  const collectedRent = collectedOn(new Set(rents.map(r => r.id)), inputs);
  const theoreticalRent = round2(propUnits.reduce((s, u) => s + (u.baseRent ?? 0), 0) * monthsInWindow(win).length);
  const vacancyLoss = round2(propUnits.reduce((s, u) => s + unitVacancyLoss(u, inputs, win), 0));
  const today = new Date().toISOString().slice(0, 10);
  const unpaidLoss = round2(Math.max(0, rents.filter(r => r.dueDate < today)
    .reduce((s, r) => s + (r.expectedAmount - r.allocatedAmount), 0)));
  const egi = round2(Math.max(0, billedRent - unpaidLoss));
  return {
    theoreticalRent, billedRent, collectedRent, otherIncome: 0,
    vacancyLoss, unpaidLoss, egi,
    flags: { otherIncomeUnavailable: true, vacancyDerived: true },
  };
}

export function getPropertyCostSummary(propertyId: string, inputs: ProfitabilityInputs, period?: Period): CostSummary {
  const win = period ?? defaultPeriod();
  let directCharges = 0, directTaxes = 0, allocatedCharges = 0, allocatedTaxes = 0;
  // Property-scoped entries (unitId === null) — owner pays directly; not split via allocation results when no rule.
  for (const c of inputs.costEntries) {
    if (c.propertyId !== propertyId) continue;
    if (c.status !== "active") continue;
    if (c.unitId !== null) continue;
    const amt = proRate(c.amount, c.startDate, c.endDate, win);
    if (c.isTax) directTaxes += amt; else directCharges += amt;
  }
  // Unit-direct entries — also property costs at the aggregate level.
  const propUnitIds = new Set(inputs.units.filter(u => u.propertyId === propertyId).map(u => u.id));
  for (const c of inputs.costEntries) {
    if (c.unitId === null || !propUnitIds.has(c.unitId)) continue;
    if (c.status !== "active") continue;
    const amt = proRate(c.amount, c.startDate, c.endDate, win);
    if (c.isTax) allocatedTaxes += amt; else allocatedCharges += amt;
  }
  return {
    directCharges: round2(directCharges), directTaxes: round2(directTaxes),
    allocatedCharges: round2(allocatedCharges), allocatedTaxes: round2(allocatedTaxes),
    totalActual: round2(directCharges + directTaxes + allocatedCharges + allocatedTaxes),
  };
}

export function getPropertyRecoverySummary(propertyId: string, inputs: ProfitabilityInputs, period?: Period): RecoverySummary {
  const win = period ?? defaultPeriod();
  const propUnitIds = new Set(inputs.units.filter(u => u.propertyId === propertyId).map(u => u.id));
  const charges = chargeReceivablesFor(r => r.propertyId === propertyId || (r.unitId !== null && propUnitIds.has(r.unitId)), inputs, win);
  const provisionsBilled = round2(charges.reduce((s, r) => s + r.expectedAmount, 0));
  const provisionsCollected = collectedOn(new Set(charges.map(r => r.id)), inputs);

  let recoverable = 0;
  for (const a of inputs.costAllocations) {
    if (a.propertyId !== propertyId) continue;
    const ce = inputs.costEntries.find(c => c.id === a.costEntryId);
    if (!ce) continue;
    recoverable += proRate(a.recoverableAmount, a.periodStart ?? ce.startDate, a.periodEnd ?? ce.endDate, win);
  }
  for (const c of inputs.costEntries) {
    if (c.propertyId !== propertyId || c.status !== "active") continue;
    // Skip those covered by allocation results to avoid double counting
    if (inputs.costAllocations.some(a => a.costEntryId === c.id)) continue;
    const split = splitRecovery(c.amount, c.recoveryType);
    recoverable += proRate(split.recoverable, c.startDate, c.endDate, win);
  }
  const actualRecoverable = round2(recoverable);
  const costs = getPropertyCostSummary(propertyId, inputs, win);
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
  const win = period ?? defaultPeriod();
  const revenue = getPropertyRevenueSummary(propertyId, inputs, win);
  const costs = getPropertyCostSummary(propertyId, inputs, win);
  const recovery = getPropertyRecoverySummary(propertyId, inputs, win);
  const noi = round2(revenue.egi - recovery.ownerBorne);
  const noiMargin = revenue.egi > 0 ? round2(noi / revenue.egi * 100) / 100 : null;
  const oer = revenue.egi > 0 ? round2(recovery.ownerBorne / revenue.egi * 100) / 100 : null;
  return {
    period: win, currencyCode: property?.currencyCode ?? "EUR",
    revenue, costs, recovery,
    noi, noiMargin, oer,
    yields: getPropertyYieldMetrics(propertyId, inputs, win),
    notes: [
      { code: "no-valuation", severity: "info" },
      { code: "operational-only", severity: "info" },
    ],
  };
}
