import type { Lease, AdvanceAllocationMethod, AdvanceAppliedTo, AdvanceStatus } from '@/types';

export interface AdvanceScheduleRow {
  month: string;
  /** Monthly rent due for this month (already at the chosen tier rate). */
  rentDue: number;
  /** Portion of this month's rent that the prepayment covers. */
  prepaidShare: number;
  /** Whether the month is fully covered by the prepayment. */
  fullyCovered: boolean;
  /** Remaining prepayment balance after this month is allocated. */
  prepaidRemaining: number;
}

export interface AdvancePricingResult {
  /** Effective monthly rent for this lease (= tier price, NOT discounted by the prepayment). */
  effectiveMonthlyRent: number;
  /** Effective monthly charges (unchanged by prepayment). */
  effectiveMonthlyCharges: number;
  /** Effective monthly due = rent + charges (tier price). */
  effectiveMonthlyDue: number;
  /** Total prepayment received. */
  advanceAmount: number;
  /** Amount of the prepayment consumed by months on or before referenceDate. */
  advanceConsumed: number;
  /** Prepayment left to cover future months. */
  advanceRemaining: number;
  advanceStatus: AdvanceStatus;
  /** First month covered (YYYY-MM). */
  allocationStartMonth: string | null;
  /** Last month covered (YYYY-MM). */
  allocationEndDate: string | null;
  /**
   * Last calendar date covered by the prepayment (end of last covered month).
   * Display as "Rent paid until {prepaidUntilDate}" in the UI.
   */
  prepaidUntilDate: string | null;
  /** Total number of months the prepayment covers. */
  durationMonths: number;
  monthsCovered: number;
  monthsRemaining: number;
  monthlySchedule: AdvanceScheduleRow[];
}

export const DEFAULT_ADVANCE_FIELDS = {
  hasAdvancePayment: false,
  advancePaymentAmount: null as number | null,
  advancePaymentDate: null as string | null,
  advanceAllocationMethod: null as AdvanceAllocationMethod | null,
  advanceAppliedTo: null as AdvanceAppliedTo | null,
  advanceAllocationStartDate: null as string | null,
  advanceAllocationDurationMonths: null as number | null,
  fixedMonthlyReductionAmount: null as number | null,
};

export function computeAdvancePricing(
  lease: Pick<Lease, 'monthlyRent' | 'monthlyCharges' | 'startDate' | 'hasAdvancePayment' | 'advancePaymentAmount' | 'advanceAllocationMethod' | 'advanceAppliedTo' | 'advanceAllocationStartDate' | 'advanceAllocationDurationMonths' | 'fixedMonthlyReductionAmount'>,
  referenceDate?: Date
): AdvancePricingResult {
  const baseRent = lease.monthlyRent;
  const baseCharges = lease.monthlyCharges;
  const baseDue = baseRent + baseCharges;

  const empty: AdvancePricingResult = {
    effectiveMonthlyRent: baseRent,
    effectiveMonthlyCharges: baseCharges,
    effectiveMonthlyDue: baseDue,
    advanceAmount: 0,
    advanceConsumed: 0,
    advanceRemaining: 0,
    advanceStatus: 'not-applicable',
    allocationStartMonth: null,
    allocationEndDate: null,
    prepaidUntilDate: null,
    durationMonths: 0,
    monthsCovered: 0,
    monthsRemaining: 0,
    monthlySchedule: [],
  };

  if (!lease.hasAdvancePayment || !lease.advancePaymentAmount || lease.advancePaymentAmount <= 0) {
    return empty;
  }

  const amount = lease.advancePaymentAmount;
  const method = lease.advanceAllocationMethod;
  if (!method) return empty;

  // What the prepayment is applied against per month (rent, charges, or both).
  const appliedTo = lease.advanceAppliedTo || 'rent';
  const targetPerMonth =
    appliedTo === 'rent' ? baseRent :
    appliedTo === 'charges' ? baseCharges :
    baseRent + baseCharges;

  if (targetPerMonth <= 0) return empty;

  let perMonthAllocation: number;
  let durationMonths: number;

  if (method === 'spread-evenly') {
    durationMonths = lease.advanceAllocationDurationMonths || 0;
    if (durationMonths <= 0) return empty;
    // Cap at one month's target — the prepayment covers months, never inflates them.
    perMonthAllocation = Math.min(targetPerMonth, Math.round((amount / durationMonths) * 100) / 100);
  } else {
    perMonthAllocation = Math.min(targetPerMonth, lease.fixedMonthlyReductionAmount || 0);
    if (perMonthAllocation <= 0) return empty;
    durationMonths = Math.ceil(amount / perMonthAllocation);
  }

  const startDate = lease.advanceAllocationStartDate || lease.startDate;
  const startYear = parseInt(startDate.slice(0, 4));
  const startMonth = parseInt(startDate.slice(5, 7)) - 1;
  const startMonthIndex = startYear * 12 + startMonth;
  const endMonthIndex = startMonthIndex + durationMonths - 1;

  const lastAllocMonth = new Date(startYear, startMonth + durationMonths - 1, 1);
  const allocationEndDate = `${lastAllocMonth.getFullYear()}-${String(lastAllocMonth.getMonth() + 1).padStart(2, '0')}`;
  // End of last covered month (e.g. 2026-12 → 2026-12-31).
  const prepaidUntilDate = (() => {
    const lastDay = new Date(lastAllocMonth.getFullYear(), lastAllocMonth.getMonth() + 1, 0);
    const y = lastDay.getFullYear();
    const m = String(lastDay.getMonth() + 1).padStart(2, '0');
    const d = String(lastDay.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();
  const allocationStartMonth = `${startYear}-${String(startMonth + 1).padStart(2, '0')}`;

  const ref = referenceDate || new Date();
  const refMonthIndex = ref.getFullYear() * 12 + ref.getMonth();

  let status: AdvanceStatus;
  if (refMonthIndex < startMonthIndex) {
    status = 'scheduled';
  } else if (refMonthIndex > endMonthIndex) {
    status = 'fully-consumed';
  } else {
    status = 'active';
  }

  let monthsConsumed: number;
  if (refMonthIndex < startMonthIndex) {
    monthsConsumed = 0;
  } else if (refMonthIndex > endMonthIndex) {
    monthsConsumed = durationMonths;
  } else {
    monthsConsumed = refMonthIndex - startMonthIndex + 1;
  }

  const consumed = Math.min(perMonthAllocation * monthsConsumed, amount);
  const remaining = Math.max(0, amount - consumed);

  const schedule: AdvanceScheduleRow[] = [];
  let runningRemaining = amount;
  for (let i = 0; i < durationMonths; i++) {
    const d = new Date(startYear, startMonth + i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const adj = Math.min(perMonthAllocation, runningRemaining);
    runningRemaining = Math.max(0, runningRemaining - adj);
    schedule.push({
      month: monthStr,
      rentDue: appliedTo === 'charges' ? baseCharges : baseRent,
      prepaidShare: adj,
      fullyCovered: adj >= targetPerMonth - 0.005,
      prepaidRemaining: runningRemaining,
    });
  }

  return {
    // Prepayment never discounts the rent — rent is the tier price and the
    // prepayment is real money that satisfies future rent receivables.
    effectiveMonthlyRent: baseRent,
    effectiveMonthlyCharges: baseCharges,
    effectiveMonthlyDue: baseDue,
    advanceAmount: amount,
    advanceConsumed: consumed,
    advanceRemaining: remaining,
    advanceStatus: status,
    allocationStartMonth,
    allocationEndDate,
    prepaidUntilDate,
    durationMonths,
    monthsCovered: monthsConsumed,
    monthsRemaining: Math.max(0, durationMonths - monthsConsumed),
    monthlySchedule: schedule,
  };
}

export const ADVANCE_METHOD_LABELS: Record<AdvanceAllocationMethod, string> = {
  'spread-evenly': 'Spread Evenly',
  'fixed-monthly-reduction': 'Fixed Monthly Reduction',
};

export const ADVANCE_APPLIED_LABELS: Record<AdvanceAppliedTo, string> = {
  'rent': 'Rent Only',
  'charges': 'Charges Only',
  'rent-and-charges': 'Rent & Charges',
};
