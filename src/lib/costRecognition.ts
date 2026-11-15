import type { CostEntry } from "@/types/costs";
import type { Period } from "@/lib/profitability";
import { prorateMoney, roundMoney } from "@/lib/money";

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

export function isAmortizedCost(entry: Pick<CostEntry, "recognitionMode">): boolean {
  return entry.recognitionMode === "amortized";
}

export function getCostRecognitionStart(entry: Pick<CostEntry, "recognitionMode" | "startDate" | "amortizationStartDate">): string {
  return isAmortizedCost(entry) && entry.amortizationStartDate ? entry.amortizationStartDate : entry.startDate;
}

export function getCostRecognitionEnd(entry: Pick<CostEntry, "recognitionMode" | "startDate" | "endDate" | "amortizationStartDate" | "amortizationEndDate">): string | null {
  if (isAmortizedCost(entry)) return entry.amortizationEndDate ?? entry.amortizationStartDate ?? entry.startDate;
  return entry.endDate;
}

export function getCostRecognitionWindow(entry: Pick<CostEntry, "recognitionMode" | "startDate" | "endDate" | "amortizationStartDate" | "amortizationEndDate">): { start: string; end: string | null } {
  return { start: getCostRecognitionStart(entry), end: getCostRecognitionEnd(entry) };
}

export function recognizeAmountForPeriod(amount: number, start: string, end: string | null, period: Period): number {
  const recognitionEnd = end ?? start;
  if (!start || !recognitionEnd) return 0;
  const totalDays = diffDays(start, recognitionEnd);
  if (totalDays <= 0) return 0;
  const overlapStart = maxISO(start, period.start);
  const overlapEnd = minISO(recognitionEnd, period.end);
  if (overlapStart > overlapEnd) return 0;
  const daysBefore = Math.round((parseISO(overlapStart) - parseISO(start)) / DAY);
  const daysThrough = daysBefore + diffDays(overlapStart, overlapEnd);
  return roundMoney(prorateMoney(amount, daysThrough, totalDays) -
    prorateMoney(amount, daysBefore, totalDays));
}

export function recognizeCostAmountForPeriod(
  entry: Pick<CostEntry, "recognitionMode" | "startDate" | "endDate" | "amortizationStartDate" | "amortizationEndDate">,
  amount: number,
  period: Period,
): number {
  if (!isAmortizedCost(entry)) {
    return recognizeAmountForPeriod(amount, entry.startDate, entry.startDate, period);
  }
  const window = getCostRecognitionWindow(entry);
  return recognizeAmountForPeriod(amount, window.start, window.end, period);
}
