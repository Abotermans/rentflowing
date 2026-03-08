// ========== RECEIVABLE ITEM ==========

export type ReceivableItemType =
  | "rent"
  | "charges"
  | "deposit"
  | "guarantee"
  | "advance-payment"
  | "adjustment"
  | "late-fee"
  | "repair-recharge"
  | "credit-note"
  | "other";

export type ReceivableItemStatus =
  | "open"
  | "partially-paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "disputed"
  | "written-off";

export type ReceivableOrigin = "system" | "manual" | "lease-schedule" | "adjustment" | "import";

export interface ReceivableItem {
  id: string;
  leaseId: string | null;
  tenantId: string | null;
  propertyId: string | null;
  unitId: string | null;
  itemType: ReceivableItemType;
  label: string;
  periodMonth: string | null; // YYYY-MM
  dueDate: string;
  currencyCode: string;
  expectedAmount: number;
  allocatedAmount: number;
  outstandingAmount: number;
  status: ReceivableItemStatus;
  priority: number; // lower = higher priority for auto-allocation
  origin: ReceivableOrigin;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ========== CASH RECEIPT ==========

export type CashReceiptSourceType =
  | "bank-transfer"
  | "instant-transfer"
  | "direct-debit"
  | "card"
  | "cash"
  | "cheque"
  | "manual";

export type CashReceiptStatus =
  | "imported"
  | "unmatched"
  | "partially-matched"
  | "matched"
  | "exception"
  | "reversed"
  | "refunded";

export interface CashReceipt {
  id: string;
  tenantId: string | null;
  leaseId: string | null;
  propertyId: string | null;
  unitId: string | null;
  sourceType: CashReceiptSourceType;
  paymentDate: string;
  bookingDate: string | null;
  valueDate: string | null;
  amountReceived: number;
  currencyCode: string;
  payerName: string | null;
  payerIban: string | null;
  payerBic: string | null;
  reference: string | null;
  remittanceInformation: string | null;
  endToEndReference: string | null;
  status: CashReceiptStatus;
  unmatchedAmount: number;
  notes: string;
  importBatchId: string | null;
  rawBankTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== RECEIPT ALLOCATION ==========

export type AllocationTypeValue =
  | "automatic"
  | "manual"
  | "rule-based"
  | "reallocation"
  | "reversal"
  | "write-off";

export interface ReceiptAllocation {
  id: string;
  cashReceiptId: string;
  receivableItemId: string;
  allocatedAmount: number;
  allocationType: AllocationTypeValue;
  allocationDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ========== HELPER FUNCTIONS ==========

export function computeReceivableStatus(
  item: Pick<ReceivableItem, "expectedAmount" | "allocatedAmount" | "outstandingAmount" | "dueDate" | "status">
): ReceivableItemStatus {
  // Don't override manually-set terminal statuses
  if (item.status === "cancelled" || item.status === "disputed" || item.status === "written-off") {
    return item.status;
  }
  if (item.outstandingAmount <= 0) return "paid";
  const today = new Date().toISOString().split("T")[0];
  if (item.allocatedAmount > 0 && item.outstandingAmount > 0) {
    return item.dueDate < today ? "overdue" : "partially-paid";
  }
  if (item.dueDate < today) return "overdue";
  return "open";
}

export function computeReceiptStatus(
  receipt: Pick<CashReceipt, "amountReceived" | "unmatchedAmount" | "status">
): CashReceiptStatus {
  // Don't override manually-set terminal statuses
  if (receipt.status === "exception" || receipt.status === "reversed" || receipt.status === "refunded") {
    return receipt.status;
  }
  if (receipt.unmatchedAmount <= 0) return "matched";
  if (receipt.unmatchedAmount < receipt.amountReceived) return "partially-matched";
  return "unmatched";
}

// ========== AUTO-ALLOCATION PRIORITY ==========

// Lower number = higher priority. Used to sort receivables for auto-allocation.
export const ITEM_TYPE_PRIORITY: Record<ReceivableItemType, number> = {
  "rent": 10,
  "charges": 20,
  "adjustment": 30,
  "late-fee": 35,
  "repair-recharge": 40,
  "deposit": 50,
  "guarantee": 55,
  "advance-payment": 60,
  "credit-note": 70,
  "other": 80,
};

export const ITEM_TYPE_LABELS: Record<ReceivableItemType, string> = {
  "rent": "Rent",
  "charges": "Charges",
  "deposit": "Deposit",
  "guarantee": "Guarantee",
  "advance-payment": "Advance Payment",
  "adjustment": "Adjustment",
  "late-fee": "Late Fee",
  "repair-recharge": "Repair Recharge",
  "credit-note": "Credit Note",
  "other": "Other",
};

export const SOURCE_TYPE_LABELS: Record<CashReceiptSourceType, string> = {
  "bank-transfer": "Bank Transfer",
  "instant-transfer": "Instant Transfer",
  "direct-debit": "Direct Debit",
  "card": "Card",
  "cash": "Cash",
  "cheque": "Cheque",
  "manual": "Manual",
};

export const ALLOCATION_TYPE_LABELS: Record<AllocationTypeValue, string> = {
  "automatic": "Automatic",
  "manual": "Manual",
  "rule-based": "Rule-Based",
  "reallocation": "Reallocation",
  "reversal": "Reversal",
  "write-off": "Write-Off",
};
