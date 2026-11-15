import type { ReceivableItem, ReceiptAllocation } from "@/types/receivables";
import { getLeaseBillingSlotKey } from "@/lib/leaseReceivables";

export interface ReceivableDuplicateReview {
  removable: ReceivableItem[];
  ambiguousGroups: ReceivableItem[][];
}

function isUntouchedOpenItem(item: ReceivableItem, allocatedIds: Set<string>): boolean {
  return !allocatedIds.has(item.id)
    && item.allocatedAmount === 0
    && Math.abs(item.outstandingAmount - item.expectedAmount) < 0.005
    && ["open", "overdue"].includes(item.status);
}

export function reviewScheduledReceivableDuplicates(
  receivables: readonly ReceivableItem[],
  allocations: readonly ReceiptAllocation[],
): ReceivableDuplicateReview {
  const allocatedIds = new Set(allocations.map(allocation => allocation.receivableItemId));
  const scheduleGroups = new Map<string, ReceivableItem[]>();
  for (const item of receivables) {
    if (item.origin !== "lease-schedule" || !item.leaseId) continue;
    const key = getLeaseBillingSlotKey(item);
    const group = scheduleGroups.get(key) ?? [];
    group.push(item);
    scheduleGroups.set(key, group);
  }

  const removable: ReceivableItem[] = [];
  const ambiguousGroups: ReceivableItem[][] = [];
  for (const scheduleGroup of scheduleGroups.values()) {
    if (scheduleGroup.length < 2) continue;
    const signatures = new Map<string, ReceivableItem[]>();
    for (const item of scheduleGroup) {
      const signature = [
        item.tenantId, item.propertyId, item.unitId, item.currencyCode, item.expectedAmount.toFixed(2),
        item.label, item.notes, item.priority,
      ].join("|");
      const group = signatures.get(signature) ?? [];
      group.push(item);
      signatures.set(signature, group);
    }
    for (const group of signatures.values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((left, right) => {
        const leftProtected = isUntouchedOpenItem(left, allocatedIds) ? 1 : 0;
        const rightProtected = isUntouchedOpenItem(right, allocatedIds) ? 1 : 0;
        return leftProtected - rightProtected
          || left.createdAt.localeCompare(right.createdAt)
          || left.id.localeCompare(right.id);
      });
      const candidates = sorted.slice(1);
      removable.push(...candidates.filter(item => isUntouchedOpenItem(item, allocatedIds)));
    }
  }
  const removableIds = new Set(removable.map(item => item.id));
  for (const group of scheduleGroups.values()) {
    if (group.length > 1 && group.filter(item => !removableIds.has(item.id)).length > 1) {
      ambiguousGroups.push(group);
    }
  }
  return { removable, ambiguousGroups };
}
