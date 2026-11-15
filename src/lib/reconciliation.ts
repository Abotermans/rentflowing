import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import { ITEM_TYPE_PRIORITY, computeReceivableStatus, computeReceiptStatus } from "@/types/receivables";
import type { Lease, Property, Tenant, Unit } from "@/types";
import { getTenantFullName } from "@/types";
import { localTodayISO } from "@/lib/calendarToday";

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
function allocationPriority(item: ReceivableItem, today: string): [number, number, string] {
  const isOverdue = item.dueDate < today && item.outstandingAmount > 0;
  const isCurrent = item.dueDate <= today;
  const timeGroup = isOverdue ? 0 : isCurrent ? 1 : 2;
  const typePriority = ITEM_TYPE_PRIORITY[item.itemType] ?? 99;
  return [timeGroup, typePriority, item.dueDate];
}

function compareAllocationPriority(left: ReceivableItem, right: ReceivableItem, today: string): number {
  const a = allocationPriority(left, today);
  const b = allocationPriority(right, today);
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
}

export interface AutoAllocateResult {
  allocations: Omit<ReceiptAllocation, "id" | "createdAt" | "updatedAt">[];
  updatedReceivables: ReceivableItem[];
  updatedReceipt: CashReceipt;
}

export function receiptMatchesReceivable(
  receipt: Pick<CashReceipt, "leaseId" | "tenantId" | "propertyId" | "currencyCode">,
  item: Pick<ReceivableItem, "leaseId" | "tenantId" | "propertyId" | "currencyCode">,
): boolean {
  if (receipt.currencyCode !== item.currencyCode) return false;
  if (receipt.propertyId && receipt.propertyId !== item.propertyId) return false;
  if (receipt.leaseId) return receipt.leaseId === item.leaseId;
  if (receipt.tenantId) return receipt.tenantId === item.tenantId;
  if (receipt.propertyId) return receipt.propertyId === item.propertyId;
  return false;
}

export function leaseIncludesTenant(
  lease: Pick<Lease, "tenantIds" | "primaryTenantId" | "coTenantIds">,
  tenantId: string,
): boolean {
  const tenantIds = lease.tenantIds?.length
    ? lease.tenantIds
    : [lease.primaryTenantId, ...lease.coTenantIds];
  return tenantIds.includes(tenantId);
}

export function receiptScopeError(
  receipt: Pick<CashReceipt, "tenantId" | "leaseId" | "propertyId" | "unitId" | "currencyCode">,
  leases: Pick<Lease, "id" | "propertyId" | "tenantIds" | "primaryTenantId" | "coTenantIds">[],
  properties: Pick<Property, "id">[],
  units: Pick<Unit, "id" | "propertyId">[],
): string | null {
  const lease = receipt.leaseId ? leases.find(item => item.id === receipt.leaseId) : undefined;
  if (receipt.leaseId && !lease) return "The selected lease no longer exists. Refresh and try again.";
  if (lease && receipt.propertyId && receipt.propertyId !== lease.propertyId) {
    return "The receipt property must match the selected lease.";
  }
  if (lease && receipt.tenantId) {
    if (!leaseIncludesTenant(lease, receipt.tenantId)) {
      return "The selected tenant does not belong to the selected lease.";
    }
  }
  const propertyId = lease?.propertyId ?? receipt.propertyId;
  if (receipt.unitId) {
    const unit = units.find(item => item.id === receipt.unitId);
    if (!unit || !propertyId || unit.propertyId !== propertyId) {
      return "The receipt unit must belong to its property.";
    }
  }
  if (propertyId) {
    const property = properties.find(item => item.id === propertyId);
    if (!property) return "The receipt property no longer exists. Refresh and try again.";
  }
  return null;
}

export function isReceivableAllocatable(item: Pick<ReceivableItem, "outstandingAmount" | "status">): boolean {
  return item.outstandingAmount > 0
    && item.status !== "cancelled"
    && item.status !== "disputed"
    && item.status !== "written-off";
}

export function autoAllocate(
  receipt: CashReceipt,
  openReceivables: ReceivableItem[],
  today?: string
): AutoAllocateResult {
  const todayStr = today ?? localTodayISO();
  const allocationDate = todayStr;

  // Sort receivables by allocation priority
  const sorted = [...openReceivables]
    .filter(r => isReceivableAllocatable(r) && receiptMatchesReceivable(receipt, r))
    .sort((a, b) => compareAllocationPriority(a, b, todayStr));

  let remainingCents = Math.round(receipt.unmatchedAmount * 100);
  const allocations: Omit<ReceiptAllocation, "id" | "createdAt" | "updatedAt">[] = [];
  const updatedMap = new Map<string, ReceivableItem>();

  for (const item of sorted) {
    if (remainingCents <= 0) break;

    const allocatedCents = Math.min(remainingCents, Math.round(item.outstandingAmount * 100));
    if (allocatedCents <= 0) continue;

    const updatedItem: ReceivableItem = {
      ...item,
      allocatedAmount: (Math.round(item.allocatedAmount * 100) + allocatedCents) / 100,
      outstandingAmount: (Math.round(item.outstandingAmount * 100) - allocatedCents) / 100,
      updatedAt: todayStr,
    };
    updatedItem.status = computeReceivableStatus(updatedItem);
    updatedMap.set(item.id, updatedItem);

    allocations.push({
      cashReceiptId: receipt.id,
      receivableItemId: item.id,
      allocatedAmount: allocatedCents / 100,
      allocationType: "automatic",
      allocationDate,
      notes: "",
    });

    remainingCents -= allocatedCents;
  }

  const updatedReceipt: CashReceipt = {
    ...receipt,
    unmatchedAmount: remainingCents / 100,
    updatedAt: todayStr,
  };
  updatedReceipt.status = computeReceiptStatus(updatedReceipt);

  // Build final receivables list: replace updated ones, keep others
  const updatedReceivables = openReceivables.map(r => updatedMap.get(r.id) ?? r);

  return { allocations, updatedReceivables, updatedReceipt };
}
