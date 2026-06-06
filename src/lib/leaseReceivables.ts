import type { Lease } from "@/types";
import type { ReceivableItem, CashReceipt, ReceiptAllocation } from "@/types/receivables";
import { computeReceivableStatus } from "@/types/receivables";
import { computeCycles } from "./leaseCycles";

export interface GenerateResult {
  receivables: ReceivableItem[];
  /** Always null — kept for backwards-compatible callers. */
  prepaymentReceipt: CashReceipt | null;
  /** Always empty — kept for backwards-compatible callers. */
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
 * Generate the full receivable ledger for a lease.
 *
 * Pure function — does not touch state. Behavior depends on `rentFormula`:
 *
 *  - `rentFormula = 1` (monthly): one rent + one charges receivable per month.
 *  - `rentFormula = N` (advance billing, e.g. 3, 6, 12): the lease is split
 *    into N-month cycles anchored to `startDate`. Each cycle produces ONE
 *    bundled rent receivable (`monthlyRent × cycleMonths`) and ONE bundled
 *    charges receivable (`monthlyCharges × cycleMonths`), both due at the
 *    cycle's start date and tagged with `cycleIndex` / `cycleEndDate`.
 *
 * The rent amount on each receivable already reflects the rent tier selected
 * via `rentFormula` (e.g. the cheaper 12-month rate from the unit's rent
 * tiers). No phantom prepayment receipts are created — when the tenant pays
 * a cycle, the operator records a normal cash receipt that allocates against
 * the bundled rent + charges receivables of that cycle.
 */
export function generateLeaseReceivables(lease: Lease, opts: GenerateOptions): GenerateResult {
  const { currencyCode, genId } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const receivables: ReceivableItem[] = [];
  if (!lease.startDate || !lease.endDate) {
    return { receivables, prepaymentReceipt: null, allocations: [] };
  }

  const cycles = computeCycles(lease);
  const isAdvance = (lease.rentFormula || 1) > 1;

  // Advance billing: only materialize receivables for cycles that are due
  // soon. Each lease controls its own lead time via `advanceCycleLeadDays`
  // (defaults to 15 days). Cycle 1 is always emitted so leases starting in
  // the future still have receivables on the schedule.
  const leadDays = isAdvance
    ? (lease.advanceCycleLeadDays ?? 15)
    : 0;
  const horizonDate = isAdvance
    ? new Date(Date.UTC(
        Number(today.slice(0, 4)),
        Number(today.slice(5, 7)) - 1,
        Number(today.slice(8, 10)) + leadDays,
      )).toISOString().slice(0, 10)
    : today;

  for (const cycle of cycles) {
    if (isAdvance && cycle.index > 1 && cycle.startDate > horizonDate) continue;
    const periodMonth = cycle.startDate.slice(0, 7);
    const dueDate = cycle.startDate;
    const cycleSuffix = isAdvance
      ? ` (cycle ${cycle.index}, ${cycle.months} mo)`
      : "";

    if (cycle.rentTotal > 0) {
      const rentItem: ReceivableItem = {
        id: genId("ri"),
        leaseId: lease.id, tenantId: lease.primaryTenantId,
        propertyId: lease.propertyId, unitId: lease.unitId,
        itemType: "rent",
        label: isAdvance ? `Rent — ${cycle.months}-month advance${cycleSuffix}` : "Monthly Rent",
        periodMonth, dueDate,
        currencyCode,
        expectedAmount: cycle.rentTotal,
        allocatedAmount: 0,
        outstandingAmount: cycle.rentTotal,
        status: "open",
        priority: 10, origin: "lease-schedule", notes: "",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today, updatedAt: today,
      };
      rentItem.status = computeReceivableStatus(rentItem);
      receivables.push(rentItem);
    }
    if (cycle.chargesTotal > 0) {
      const chargesItem: ReceivableItem = {
        id: genId("ri"),
        leaseId: lease.id, tenantId: lease.primaryTenantId,
        propertyId: lease.propertyId, unitId: lease.unitId,
        itemType: "charges",
        label: isAdvance ? `Charges — ${cycle.months}-month advance${cycleSuffix}` : "Monthly Charges",
        periodMonth, dueDate,
        currencyCode,
        expectedAmount: cycle.chargesTotal,
        allocatedAmount: 0,
        outstandingAmount: cycle.chargesTotal,
        status: "open",
        priority: 20, origin: "lease-schedule", notes: "",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today, updatedAt: today,
      };
      chargesItem.status = computeReceivableStatus(chargesItem);
      receivables.push(chargesItem);
    }
  }

  return { receivables, prepaymentReceipt: null, allocations: [] };
}
