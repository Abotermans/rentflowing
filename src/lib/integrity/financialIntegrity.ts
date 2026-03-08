import { IntegrityState, ValidationResult, IntegrityBlocker, IntegrityWarning, ok, blocked } from "./types";

export function canDeleteReceivable(receivableId: string, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];

  const item = s.receivableItems.find(r => r.id === receivableId);
  if (!item) return blocked([{ code: "RECEIVABLE_NOT_FOUND", message: "Receivable item not found" }]);

  const allocationCount = s.allocations.filter(a => a.receivableItemId === receivableId).length;
  if (allocationCount > 0) blockers.push({ code: "RECEIVABLE_HAS_ALLOCATIONS", message: `Receivable has ${allocationCount} allocation(s) — reverse them first`, entityType: "allocation", count: allocationCount });

  if (item.status === "paid") blockers.push({ code: "RECEIVABLE_IS_PAID", message: "Cannot delete a fully paid receivable" });

  if (blockers.length > 0) return blocked(blockers, [], "Cancel or write off the receivable instead");
  return ok();
}

export function canDeleteCashReceipt(receiptId: string, s: IntegrityState): ValidationResult {
  const blockers: IntegrityBlocker[] = [];

  const receipt = s.cashReceipts.find(r => r.id === receiptId);
  if (!receipt) return blocked([{ code: "RECEIPT_NOT_FOUND", message: "Cash receipt not found" }]);

  const allocationCount = s.allocations.filter(a => a.cashReceiptId === receiptId).length;
  if (allocationCount > 0) blockers.push({ code: "RECEIPT_HAS_ALLOCATIONS", message: `Receipt has ${allocationCount} allocation(s) — reverse them first`, entityType: "allocation", count: allocationCount });

  if (blockers.length > 0) return blocked(blockers, [], "Reverse allocations before deleting the receipt");
  return ok();
}

export function canCreateAllocation(
  receiptId: string,
  receivableId: string,
  amount: number,
  s: IntegrityState,
): ValidationResult {
  const blockers: IntegrityBlocker[] = [];
  const warnings: IntegrityWarning[] = [];

  const receipt = s.cashReceipts.find(r => r.id === receiptId);
  const receivable = s.receivableItems.find(r => r.id === receivableId);

  if (!receipt) { blockers.push({ code: "RECEIPT_NOT_FOUND", message: "Cash receipt not found" }); return blocked(blockers); }
  if (!receivable) { blockers.push({ code: "RECEIVABLE_NOT_FOUND", message: "Receivable item not found" }); return blocked(blockers); }

  if (amount <= 0) blockers.push({ code: "ALLOC_INVALID_AMOUNT", message: "Allocation amount must be positive" });
  if (amount > receipt.unmatchedAmount) blockers.push({ code: "ALLOC_EXCEEDS_UNMATCHED", message: `Amount (${amount}) exceeds receipt unmatched balance (${receipt.unmatchedAmount})` });
  if (amount > receivable.outstandingAmount) blockers.push({ code: "ALLOC_EXCEEDS_OUTSTANDING", message: `Amount (${amount}) exceeds receivable outstanding balance (${receivable.outstandingAmount})` });
  if (receipt.currencyCode !== receivable.currencyCode) blockers.push({ code: "ALLOC_CURRENCY_MISMATCH", message: `Currency mismatch: receipt is ${receipt.currencyCode}, receivable is ${receivable.currencyCode}` });

  if (blockers.length > 0) return blocked(blockers, warnings);
  return ok();
}
