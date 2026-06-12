import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import { ITEM_TYPE_PRIORITY, computeReceivableStatus, computeReceiptStatus } from "@/types/receivables";
import type { Lease, Tenant } from "@/types";
import { getTenantFullName } from "@/types";

// ===== Lease matching from a bank-imported cash receipt =====

/**
 * Normalize a string for fuzzy name comparison: NFKD, strip diacritics,
 * lowercase, collapse whitespace.
 */
export function normalizePayerName(s: string | null | undefined): string {
  if (!s) return "";
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Normalize IBAN by stripping spaces and upper-casing. Returns "" when empty. */
export function normalizeIban(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\s+/g, "").toUpperCase();
}

export type MatchConfidence = "iban" | "payer-name" | "tenant-name" | "reference" | "none";

export interface LeaseMatch {
  leaseId: string;
  confidence: MatchConfidence;
}

/**
 * Try to match an imported cash receipt to a single lease.
 * Priority: lease payerAccount IBAN > payerAccount name > tenant name > lease reference in remittance.
 * Returns `null` when no candidate is found, the first candidate otherwise.
 */
export function matchReceiptToLease(
  receipt: Pick<CashReceipt, "payerIban" | "payerName" | "remittanceInformation" | "reference">,
  leases: readonly Lease[],
  tenants: readonly Tenant[],
): LeaseMatch | null {
  const iban = normalizeIban(receipt.payerIban);
  const name = normalizePayerName(receipt.payerName);

  if (iban) {
    const byIban = leases.find(l =>
      (l.payerAccounts ?? []).some(p => normalizeIban(p.payerIban) === iban),
    );
    if (byIban) return { leaseId: byIban.id, confidence: "iban" };
  }
  if (name) {
    const byPayerName = leases.find(l =>
      (l.payerAccounts ?? []).some(p => normalizePayerName(p.payerName) === name),
    );
    if (byPayerName) return { leaseId: byPayerName.id, confidence: "payer-name" };

    const byTenantName = leases.find(l => {
      const tIds = l.tenantIds ?? [l.primaryTenantId, ...(l.coTenantIds ?? [])].filter(Boolean);
      return tIds.some(tid => {
        const tn = tenants.find(x => x.id === tid);
        return tn && normalizePayerName(getTenantFullName(tn)) === name;
      });
    });
    if (byTenantName) return { leaseId: byTenantName.id, confidence: "tenant-name" };
  }
  const haystack = `${receipt.remittanceInformation ?? ""} ${receipt.reference ?? ""}`.toLowerCase();
  if (haystack.trim()) {
    const byRef = leases.find(l => l.leaseReference && haystack.includes(l.leaseReference.toLowerCase()));
    if (byRef) return { leaseId: byRef.id, confidence: "reference" };
  }
  return null;
}

/**
 * Auto-allocation policy:
 * 1. Oldest overdue rent
 * 2. Oldest overdue charges
 * 3. Current rent
 * 4. Current charges
 * 5. Adjustments / fees
 * 6. Deposit / guarantee
 * 7. Future items
 * 8. Leftover remains as unmatchedAmount
 */
function allocationSortKey(item: ReceivableItem, today: string): number {
  const isOverdue = item.dueDate < today && item.outstandingAmount > 0;
  const isCurrent = item.dueDate <= today;

  // Group: overdue=0, current=1, future=2
  const timeGroup = isOverdue ? 0 : isCurrent ? 1 : 2;

  // Within group: sort by type priority then due date
  const typePriority = ITEM_TYPE_PRIORITY[item.itemType] ?? 99;

  return timeGroup * 100000 + typePriority * 1000 + new Date(item.dueDate).getTime() / 86400000;
}

export interface AutoAllocateResult {
  allocations: Omit<ReceiptAllocation, "id" | "createdAt" | "updatedAt">[];
  updatedReceivables: ReceivableItem[];
  updatedReceipt: CashReceipt;
}

export function autoAllocate(
  receipt: CashReceipt,
  openReceivables: ReceivableItem[],
  today?: string
): AutoAllocateResult {
  const todayStr = today ?? new Date().toISOString().split("T")[0];
  const allocationDate = todayStr;

  // Sort receivables by allocation priority
  const sorted = [...openReceivables]
    .filter(r => r.outstandingAmount > 0)
    .sort((a, b) => allocationSortKey(a, todayStr) - allocationSortKey(b, todayStr));

  let remaining = receipt.unmatchedAmount;
  const allocations: Omit<ReceiptAllocation, "id" | "createdAt" | "updatedAt">[] = [];
  const updatedMap = new Map<string, ReceivableItem>();

  for (const item of sorted) {
    if (remaining <= 0) break;

    const allocateAmount = Math.min(remaining, item.outstandingAmount);
    if (allocateAmount <= 0) continue;

    const updatedItem: ReceivableItem = {
      ...item,
      allocatedAmount: item.allocatedAmount + allocateAmount,
      outstandingAmount: item.outstandingAmount - allocateAmount,
      updatedAt: todayStr,
    };
    updatedItem.status = computeReceivableStatus(updatedItem);
    updatedMap.set(item.id, updatedItem);

    allocations.push({
      cashReceiptId: receipt.id,
      receivableItemId: item.id,
      allocatedAmount: allocateAmount,
      allocationType: "automatic",
      allocationDate,
      notes: "",
    });

    remaining -= allocateAmount;
  }

  const updatedReceipt: CashReceipt = {
    ...receipt,
    unmatchedAmount: Math.round(remaining * 100) / 100,
    updatedAt: todayStr,
  };
  updatedReceipt.status = computeReceiptStatus(updatedReceipt);

  // Build final receivables list: replace updated ones, keep others
  const updatedReceivables = openReceivables.map(r => updatedMap.get(r.id) ?? r);

  return { allocations, updatedReceivables, updatedReceipt };
}
