import { formatCurrency, normalizeCurrencyCode } from "@/lib/formatters";
import { Decimal } from "./decimal.ts";

export function roundMoney(amount: number): number {
  return new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function prorateMoney(amount: number, numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) throw new Error("Money proration requires a positive denominator.");
  return new Decimal(amount).times(numerator).div(denominator)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export interface MoneyAmount {
  amount: number;
  currencyCode: string;
  locale?: string;
}

export interface MoneyGroup {
  currencyCode: string;
  locale?: string;
  amount: number;
}

export function distributeMoneyByWeights(amount: number, weights: readonly number[]): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(amount) || totalWeight <= 0 || weights.some(weight => !Number.isFinite(weight) || weight < 0)) return [];
  const sign = amount < 0 ? -1 : 1;
  const totalCents = new Decimal(amount).abs().times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const raw = weights.map(weight => totalCents * weight / totalWeight);
  const cents = raw.map(value => Math.floor(value));
  const remaining = totalCents - cents.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - cents[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remaining; i++) cents[order[i].index]++;
  return cents.map(value => sign * value / 100);
}

export function sumMoneyByCurrency(items: readonly MoneyAmount[]): MoneyGroup[] {
  const map = new Map<string, { currencyCode: string; locale?: string; amount: Decimal }>();
  for (const item of items) {
    if (!Number.isFinite(item.amount) || item.amount === 0) continue;
    const key = normalizeCurrencyCode(item.currencyCode);
    const current = map.get(key) ?? { currencyCode: key, locale: item.locale, amount: new Decimal(0) };
    current.amount = current.amount.plus(item.amount);
    current.locale = current.locale ?? item.locale;
    map.set(key, current);
  }
  return [...map.values()]
    .map(group => ({ ...group, amount: group.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}

export function formatMoneyGroups(groups: readonly MoneyGroup[], empty = formatCurrency(0)): string {
  if (groups.length === 0) return empty;
  return groups.map(g => formatCurrency(g.amount, g.currencyCode, g.locale)).join(" + ");
}
