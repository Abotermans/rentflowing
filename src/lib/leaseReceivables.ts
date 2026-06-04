import type { Lease } from "@/types";
import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import { computeReceivableStatus } from "@/types/receivables";

/**
 * Iterate every month between two YYYY-MM-DD dates (inclusive of the start
 * month, inclusive of the end month).
 */
function eachMonth(startISO: string, endISO: string): { year: number; month: number; periodMonth: string; dueDate: string }[] {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const out: { year: number; month: number; periodMonth: string; dueDate: string }[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endAnchor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur.getTime() <= endAnchor.getTime()) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth() + 1;
    const periodMonth = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ year: y, month: m, periodMonth, dueDate: `${periodMonth}-01` });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

export interface GenerateResult {
  receivables: ReceivableItem[];
  prepaymentReceipt: CashReceipt | null;
  allocations: ReceiptAllocation[];
}

export interface GenerateOptions {
  currencyCode: string;
  /** Bring-your-own id factory (keeps AppContext in charge of id sequencing). */
  genId: (prefix: string) => string;
  /** Today, for status computation. */
  today?: string;
}

/**
 * Generate the full receivable + prepayment ledger for a lease.
 *
 * Pure function — does not touch state. Produces:
 *   - one rent and one charges receivable per month between startDate and endDate;
 *   - a single CashReceipt for the prepayment when hasAdvancePayment is true;
 *   - the allocations that link the prepayment to the first N rent (and optionally
 *     charges) receivables, marking them paid.
 *
 * The rent on each receivable is `lease.monthlyRent`, which is already the tier
 * price selected via `rentFormula` (e.g. the cheaper 12-month rate). The
 * prepayment is real money — it never discounts the rent, it satisfies it.
 */
export function generateLeaseReceivables(lease: Lease, opts: GenerateOptions): GenerateResult {
  const { currencyCode, genId } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const receivables: ReceivableItem[] = [];
  if (!lease.startDate || !lease.endDate) {
    return { receivables, prepaymentReceipt: null, allocations: [] };
  }

  const months = eachMonth(lease.startDate, lease.endDate);

  for (const m of months) {
    if (lease.monthlyRent > 0) {
      const rentItem: ReceivableItem = {
        id: genId("ri"),
        leaseId: lease.id, tenantId: lease.primaryTenantId,
        propertyId: lease.propertyId, unitId: lease.unitId,
        itemType: "rent", label: "Monthly Rent",
        periodMonth: m.periodMonth, dueDate: m.dueDate,
        currencyCode,
        expectedAmount: lease.monthlyRent,
        allocatedAmount: 0,
        outstandingAmount: lease.monthlyRent,
        status: "open",
        priority: 10, origin: "lease-schedule", notes: "",
        createdAt: today, updatedAt: today,
      };
      rentItem.status = computeReceivableStatus(rentItem);
      receivables.push(rentItem);
    }
    if (lease.monthlyCharges > 0) {
      const chargesItem: ReceivableItem = {
        id: genId("ri"),
        leaseId: lease.id, tenantId: lease.primaryTenantId,
        propertyId: lease.propertyId, unitId: lease.unitId,
        itemType: "charges", label: "Monthly Charges",
        periodMonth: m.periodMonth, dueDate: m.dueDate,
        currencyCode,
        expectedAmount: lease.monthlyCharges,
        allocatedAmount: 0,
        outstandingAmount: lease.monthlyCharges,
        status: "open",
        priority: 20, origin: "lease-schedule", notes: "",
        createdAt: today, updatedAt: today,
      };
      chargesItem.status = computeReceivableStatus(chargesItem);
      receivables.push(chargesItem);
    }
  }

  if (!lease.hasAdvancePayment || !lease.advancePaymentAmount || lease.advancePaymentAmount <= 0) {
    return { receivables, prepaymentReceipt: null, allocations: [] };
  }

  const paymentDate = lease.advancePaymentDate ?? lease.startDate;
  const receipt: CashReceipt = {
    id: genId("cr"),
    tenantId: lease.primaryTenantId, leaseId: lease.id,
    propertyId: lease.propertyId, unitId: lease.unitId,
    sourceType: "bank-transfer",
    paymentDate, bookingDate: paymentDate, valueDate: paymentDate,
    amountReceived: lease.advancePaymentAmount,
    currencyCode,
    payerName: null, payerIban: null, payerBic: null,
    reference: `PREPAY-${lease.leaseReference}`,
    remittanceInformation: "Rent prepayment",
    endToEndReference: null,
    status: "matched",
    unmatchedAmount: lease.advancePaymentAmount,
    notes: "Auto-generated from lease prepayment", importBatchId: null, rawBankTransactionId: null,
    createdAt: today, updatedAt: today,
  };

  // What the prepayment covers per month.
  const appliedTo = lease.advanceAppliedTo ?? "rent";
  const targetTypes: ("rent" | "charges")[] =
    appliedTo === "rent" ? ["rent"] :
    appliedTo === "charges" ? ["charges"] :
    ["rent", "charges"];

  // Allocate chronologically against the chosen receivable types.
  const allocStartISO = lease.advanceAllocationStartDate
    ? `${lease.advanceAllocationStartDate}-01`
    : lease.startDate;
  const eligible = receivables
    .filter(r => targetTypes.includes(r.itemType as "rent" | "charges") && r.dueDate >= allocStartISO)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.priority - b.priority);

  let remaining = lease.advancePaymentAmount;
  const allocations: ReceiptAllocation[] = [];
  for (const item of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, item.outstandingAmount);
    if (take <= 0) continue;
    item.allocatedAmount = Math.round((item.allocatedAmount + take) * 100) / 100;
    item.outstandingAmount = Math.round((item.outstandingAmount - take) * 100) / 100;
    item.updatedAt = today;
    item.status = computeReceivableStatus(item);
    allocations.push({
      id: genId("al"),
      cashReceiptId: receipt.id, receivableItemId: item.id,
      allocatedAmount: take, allocationType: "automatic",
      allocationDate: paymentDate,
      notes: "Rent prepayment auto-allocation",
      createdAt: today, updatedAt: today,
    });
    remaining = Math.round((remaining - take) * 100) / 100;
  }

  receipt.unmatchedAmount = remaining;
  receipt.status = remaining <= 0 ? "matched" : remaining < receipt.amountReceived ? "partially-matched" : "unmatched";

  return { receivables, prepaymentReceipt: receipt, allocations };
}
