import type { Lease, AdvanceAllocationMethod, AdvanceAppliedTo, AdvanceStatus } from '@/types';

export interface AdvanceScheduleRow {
  month: string;
  baseDue: number;
  adjustment: number;
  effectiveDue: number;
  advanceRemaining: number;
}

export interface AdvancePricingResult {
  pricingAdjustmentPerMonth: number;
  effectiveMonthlyRent: number;
  effectiveMonthlyCharges: number;
  effectiveMonthlyDue: number;
  advanceConsumed: number;
  advanceRemaining: number;
  advanceStatus: AdvanceStatus;
  allocationEndDate: string | null;
  durationMonths: number;
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
    pricingAdjustmentPerMonth: 0,
    effectiveMonthlyRent: baseRent,
    effectiveMonthlyCharges: baseCharges,
    effectiveMonthlyDue: baseDue,
    advanceConsumed: 0,
    advanceRemaining: 0,
    advanceStatus: 'not-applicable',
    allocationEndDate: null,
    durationMonths: 0,
    monthlySchedule: [],
  };

  if (!lease.hasAdvancePayment || !lease.advancePaymentAmount || lease.advancePaymentAmount <= 0) {
    return empty;
  }

  const amount = lease.advancePaymentAmount;
  const method = lease.advanceAllocationMethod;
  if (!method) return empty;

  let adjustmentPerMonth: number;
  let durationMonths: number;

  if (method === 'spread-evenly') {
    durationMonths = lease.advanceAllocationDurationMonths || 0;
    if (durationMonths <= 0) return empty;
    adjustmentPerMonth = Math.round((amount / durationMonths) * 100) / 100;
  } else {
    adjustmentPerMonth = lease.fixedMonthlyReductionAmount || 0;
    if (adjustmentPerMonth <= 0) return empty;
    durationMonths = Math.ceil(amount / adjustmentPerMonth);
  }

  const appliedTo = lease.advanceAppliedTo || 'rent';
  let rentReduction = 0;
  let chargesReduction = 0;

  if (appliedTo === 'rent') {
    rentReduction = Math.min(adjustmentPerMonth, baseRent);
  } else if (appliedTo === 'charges') {
    chargesReduction = Math.min(adjustmentPerMonth, baseCharges);
  } else {
    rentReduction = Math.min(adjustmentPerMonth, baseRent);
    const leftover = adjustmentPerMonth - rentReduction;
    chargesReduction = Math.min(leftover, baseCharges);
  }

  const effectiveRent = Math.max(0, baseRent - rentReduction);
  const effectiveCharges = Math.max(0, baseCharges - chargesReduction);
  const effectiveDue = effectiveRent + effectiveCharges;

  const startDate = lease.advanceAllocationStartDate || lease.startDate;
  const startYear = parseInt(startDate.slice(0, 4));
  const startMonth = parseInt(startDate.slice(5, 7)) - 1;
  const startMonthIndex = startYear * 12 + startMonth;
  const endMonthIndex = startMonthIndex + durationMonths - 1;

  const lastAllocMonth = new Date(startYear, startMonth + durationMonths - 1, 1);
  const allocationEndDate = `${lastAllocMonth.getFullYear()}-${String(lastAllocMonth.getMonth() + 1).padStart(2, '0')}`;

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

  const consumed = Math.min(adjustmentPerMonth * monthsConsumed, amount);
  const remaining = Math.max(0, amount - consumed);

  const schedule: AdvanceScheduleRow[] = [];
  let runningRemaining = amount;
  for (let i = 0; i < durationMonths; i++) {
    const d = new Date(startYear, startMonth + i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const adj = Math.min(adjustmentPerMonth, runningRemaining);
    runningRemaining = Math.max(0, runningRemaining - adj);
    schedule.push({
      month: monthStr,
      baseDue,
      adjustment: adj,
      effectiveDue: baseDue - adj,
      advanceRemaining: runningRemaining,
    });
  }

  return {
    pricingAdjustmentPerMonth: adjustmentPerMonth,
    effectiveMonthlyRent: status === 'fully-consumed' ? baseRent : effectiveRent,
    effectiveMonthlyCharges: status === 'fully-consumed' ? baseCharges : effectiveCharges,
    effectiveMonthlyDue: status === 'fully-consumed' ? baseDue : effectiveDue,
    advanceConsumed: consumed,
    advanceRemaining: remaining,
    advanceStatus: status,
    allocationEndDate,
    durationMonths,
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
