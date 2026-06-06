import { describe, it, expect } from "vitest";
import type { Lease } from "@/types";
import { DEFAULT_MOVE_IN_CHECKLIST, DEFAULT_MOVE_OUT_CHECKLIST } from "@/types";
import { generateLeaseReceivables } from "./leaseReceivables";
import { computeCycles, getCurrentCycle, getNextCycle } from "./leaseCycles";

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
  it("monthly formula: one rent + one charges receivable per month, all open", () => {
    n = 0;
    const res = generateLeaseReceivables(lease(), { currencyCode: "EUR", genId, today: "2026-01-01" });
    expect(res.receivables.length).toBe(24);
    expect(res.receivables.filter(r => r.itemType === "rent")).toHaveLength(12);
    expect(res.receivables.filter(r => r.itemType === "charges")).toHaveLength(12);
    expect(res.prepaymentReceipt).toBeNull();
    expect(res.allocations).toHaveLength(0);
    expect(res.receivables.every(r => r.outstandingAmount === r.expectedAmount)).toBe(true);
  });

  it("6-month formula: 2 bundled cycles on a 12-month lease (rent + charges per cycle)", () => {
    n = 0;
    const res = generateLeaseReceivables(
      lease({ rentFormula: 6, advanceCycleLeadDays: 400 }),
      { currencyCode: "EUR", genId, today: "2026-01-01" }
    );
    expect(res.receivables.length).toBe(4); // 2 cycles × (rent + charges)
    const rents = res.receivables.filter(r => r.itemType === "rent").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    expect(rents).toHaveLength(2);
    expect(rents[0].expectedAmount).toBe(6000);
    expect(rents[0].dueDate).toBe("2026-01-01");
    expect(rents[0].cycleIndex).toBe(1);
    expect(rents[0].cycleEndDate).toBe("2026-06-30");
    expect(rents[1].dueDate).toBe("2026-07-01");
    expect(rents[1].cycleEndDate).toBe("2026-12-31");
    const charges = res.receivables.filter(r => r.itemType === "charges");
    expect(charges.every(c => c.expectedAmount === 600)).toBe(true);
  });

  it("3-month formula with leftover month produces a final truncated cycle", () => {
    n = 0;
    const res = generateLeaseReceivables(
      lease({ rentFormula: 3, endDate: "2026-04-30", advanceCycleLeadDays: 400 }), // 4 months total
      { currencyCode: "EUR", genId, today: "2026-01-01" }
    );
    const rents = res.receivables.filter(r => r.itemType === "rent").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    expect(rents).toHaveLength(2);
    expect(rents[0].expectedAmount).toBe(3000);
    expect(rents[1].expectedAmount).toBe(1000); // truncated to 1 month
    expect(rents[1].cycleEndDate).toBe("2026-04-30");
  });
});

describe("computeCycles", () => {
  it("monthly leases produce one cycle per month", () => {
    const cycles = computeCycles(lease());
    expect(cycles).toHaveLength(12);
    expect(cycles[0]).toMatchObject({ index: 1, months: 1, startDate: "2026-01-01", endDate: "2026-01-31", total: 1100 });
  });

  it("getCurrentCycle / getNextCycle locate cycles around today", () => {
    const cycles = computeCycles(lease({ rentFormula: 6 }));
    expect(getCurrentCycle(cycles, "2026-03-15")?.index).toBe(1);
    expect(getNextCycle(cycles, "2026-03-15")?.index).toBe(2);
    expect(getCurrentCycle(cycles, "2026-08-01")?.index).toBe(2);
    expect(getNextCycle(cycles, "2026-08-01")).toBeNull();
  });
});
