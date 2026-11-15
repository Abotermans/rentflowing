import type { ReceivableItem } from "@/types/receivables";
import { isReceivableOutstanding } from "@/types/receivables";
import { sumMoneyByCurrency } from "@/lib/money";

type BalanceItem = Pick<ReceivableItem, "status" | "outstandingAmount" | "dueDate" | "currencyCode">;

export function groupReceivableBalances<T extends BalanceItem>(
  items: readonly T[],
  todayForItem: (item: T) => string,
) {
  const open = items.filter(isReceivableOutstanding);
  return {
    outstanding: sumMoneyByCurrency(open.map(item => ({ amount: item.outstandingAmount, currencyCode: item.currencyCode }))),
    overdue: sumMoneyByCurrency(open.filter(item => item.dueDate < todayForItem(item))
      .map(item => ({ amount: item.outstandingAmount, currencyCode: item.currencyCode }))),
  };
}
