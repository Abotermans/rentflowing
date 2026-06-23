import { formatCurrency, normalizeCurrencyCode } from "@/lib/formatters";

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

export function sumMoneyByCurrency(items: readonly MoneyAmount[]): MoneyGroup[] {
  const map = new Map<string, MoneyGroup>();
  for (const item of items) {
    if (!Number.isFinite(item.amount) || item.amount === 0) continue;
    const key = normalizeCurrencyCode(item.currencyCode);
    const current = map.get(key) ?? { currencyCode: key, locale: item.locale, amount: 0 };
    current.amount = Math.round((current.amount + item.amount) * 100) / 100;
    current.locale = current.locale ?? item.locale;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}

export function formatMoneyGroups(groups: readonly MoneyGroup[], empty = formatCurrency(0)): string {
  if (groups.length === 0) return empty;
  return groups.map(g => formatCurrency(g.amount, g.currencyCode, g.locale)).join(" + ");
}
