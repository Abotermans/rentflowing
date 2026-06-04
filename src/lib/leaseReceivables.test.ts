import { describe, it, expect } from "vitest";
import type { Lease } from "@/types";
import { DEFAULT_MOVE_IN_CHECKLIST, DEFAULT_MOVE_OUT_CHECKLIST } from "@/types";
import { generateLeaseReceivables } from "./leaseReceivables";
import { computeAdvancePricing } from "./advancePricing";

let n = 0;
const genId = (p: string) => `${p}-${++n}`;

function lease(over: Partial<Lease> = {}): Lease {
  return {
    id: "L1", leaseReference: "L-001", propertyId: "p1", unitId: "u1",
    primaryTenantId: "t1", coTenantIds: [], lifecycleStage: "active",
    startDate: "2026-01-01", endDate: "2026-12-31",
    monthlyRent: 1000, monthlyCharges: 100, dueDayOfMonth: 1,
    depositOrGuaranteeAmount: null, noticePeriodText: "", signedDate: null, notes: "",
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: null, moveInActualDate: null, moveInMeterReading: null, moveInWaterMeterReading: null,
    moveInChecklist: { ...DEFAULT_MOVE_IN_CHECKLIST },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null,
    moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST },
    moveOutNotes: "", keyHandoverCount: 0, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    rentFormula: 1, endReason: null,
    hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
    advanceAllocationMethod: null, advanceAppliedTo: null,
    advanceAllocationStartDate: null, advanceAllocationDurationMonths: null,
    fixedMonthlyReductionAmount: null,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    ...over,
  };
}

describe("generateLeaseReceivables", () => {
  it("generates one rent + one charges receivable per month, all open by default", () => {
    n = 0;
    const res = generateLeaseReceivables(lease(), { currencyCode: "EUR", genId, today: "2026-01-01" });
    expect(res.receivables.length).toBe(24); // 12 months × 2 lines
    expect(res.receivables.filter(r => r.itemType === "rent")).toHaveLength(12);
    expect(res.receivables.filter(r => r.itemType === "charges")).toHaveLength(12);
    expect(res.prepaymentReceipt).toBeNull();
    expect(res.receivables.every(r => r.outstandingAmount === r.expectedAmount)).toBe(true);
  });

  it("12-month prepayment marks all 12 rent receivables paid (charges still open)", () => {
    n = 0;
    const l = lease({
      hasAdvancePayment: true, advancePaymentAmount: 12000,
      advanceAllocationMethod: "spread-evenly", advanceAppliedTo: "rent",
      advanceAllocationDurationMonths: 12, advanceAllocationStartDate: "2026-01",
      advancePaymentDate: "2026-01-01",
    });
    const res = generateLeaseReceivables(l, { currencyCode: "EUR", genId, today: "2026-01-01" });
    expect(res.prepaymentReceipt).not.toBeNull();
    expect(res.prepaymentReceipt!.amountReceived).toBe(12000);
    expect(res.prepaymentReceipt!.unmatchedAmount).toBe(0);
    const rents = res.receivables.filter(r => r.itemType === "rent");
    expect(rents.every(r => r.status === "paid")).toBe(true);
    const charges = res.receivables.filter(r => r.itemType === "charges");
    expect(charges.every(r => r.outstandingAmount === 100)).toBe(true);
    // 12 rent allocations
    expect(res.allocations).toHaveLength(12);
  });

  it("6-month prepayment on a 12-month lease covers months 1-6 only", () => {
    n = 0;
    const l = lease({
      hasAdvancePayment: true, advancePaymentAmount: 6000,
      advanceAllocationMethod: "spread-evenly", advanceAppliedTo: "rent",
      advanceAllocationDurationMonths: 6, advanceAllocationStartDate: "2026-01",
      advancePaymentDate: "2026-01-01",
    });
    const res = generateLeaseReceivables(l, { currencyCode: "EUR", genId, today: "2026-01-01" });
    const rents = res.receivables.filter(r => r.itemType === "rent").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    expect(rents.slice(0, 6).every(r => r.status === "paid")).toBe(true);
    expect(rents.slice(6).every(r => r.outstandingAmount === 1000)).toBe(true);
    expect(res.allocations).toHaveLength(6);
  });

  it("rent-and-charges mode allocates across both", () => {
    n = 0;
    const l = lease({
      hasAdvancePayment: true, advancePaymentAmount: 2200, // 2 months of (1000+100)
      advanceAllocationMethod: "spread-evenly", advanceAppliedTo: "rent-and-charges",
      advanceAllocationDurationMonths: 2, advanceAllocationStartDate: "2026-01",
      advancePaymentDate: "2026-01-01",
    });
    const res = generateLeaseReceivables(l, { currencyCode: "EUR", genId, today: "2026-01-01" });
    const jan = res.receivables.filter(r => r.periodMonth === "2026-01");
    const feb = res.receivables.filter(r => r.periodMonth === "2026-02");
    expect(jan.every(r => r.status === "paid")).toBe(true);
    expect(feb.every(r => r.status === "paid")).toBe(true);
    expect(res.prepaymentReceipt!.unmatchedAmount).toBe(0);
  });
});

describe("computeAdvancePricing (read model)", () => {
  it("never discounts rent — effective rent equals tier rent", () => {
    const l = lease({
      hasAdvancePayment: true, advancePaymentAmount: 12000,
      advanceAllocationMethod: "spread-evenly", advanceAppliedTo: "rent",
      advanceAllocationDurationMonths: 12, advanceAllocationStartDate: "2026-01",
    });
    const r = computeAdvancePricing(l, new Date("2026-01-15"));
    expect(r.effectiveMonthlyRent).toBe(1000);
    expect(r.effectiveMonthlyDue).toBe(1100);
  });

  it("exposes prepaidUntilDate at the end of the last covered month", () => {
    const l = lease({
      hasAdvancePayment: true, advancePaymentAmount: 12000,
      advanceAllocationMethod: "spread-evenly", advanceAppliedTo: "rent",
      advanceAllocationDurationMonths: 12, advanceAllocationStartDate: "2026-01",
    });
    const r = computeAdvancePricing(l, new Date("2026-01-15"));
    expect(r.prepaidUntilDate).toBe("2026-12-31");
    expect(r.durationMonths).toBe(12);
    expect(r.monthsCovered).toBe(1);
    expect(r.monthsRemaining).toBe(11);
  });
});
