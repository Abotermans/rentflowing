import type { ReceivableItem } from "@/types/receivables";

export type ManualAllocationIssue = "invalid" | "exceeds" | "stale";

export function reviewManualAllocationDraft(
  rawAmounts: Readonly<Record<string, string>>,
  openItems: readonly Pick<ReceivableItem, "id" | "outstandingAmount">[],
) {
  const items = new Map(openItems.map(item => [item.id, item]));
  const issues = new Map<string, ManualAllocationIssue>();
  const allocations: { receivableItemId: string; amount: number }[] = [];
  let totalCents = 0;

  for (const [receivableItemId, raw] of Object.entries(rawAmounts)) {
    const value = raw.trim();
    if (!value) continue;
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
      issues.set(receivableItemId, "invalid");
      continue;
    }
    const amount = Number(value.replace(",", "."));
    const cents = Math.round(amount * 100);
    if (!Number.isSafeInteger(cents)) {
      issues.set(receivableItemId, "invalid");
      continue;
    }
    if (cents === 0) continue;
    const item = items.get(receivableItemId);
    if (!item) {
      issues.set(receivableItemId, "stale");
    } else if (cents > Math.round(item.outstandingAmount * 100)) {
      issues.set(receivableItemId, "exceeds");
    } else {
      totalCents += cents;
      allocations.push({ receivableItemId, amount: cents / 100 });
    }
  }

  return { allocations, issues, total: totalCents / 100 };
}
