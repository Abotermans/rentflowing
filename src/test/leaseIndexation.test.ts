import { describe, expect, it } from "vitest";
import type { Lease } from "@/types";
import { computeLeaseIndexation, getCurrentUnitRentShares, getIndexedMonthlyRent, getIndexedRentTotal } from "@/lib/leaseIndexation";
import { generateLeaseReceivables, reconcileActivatedAmendmentReceivables } from "@/lib/leaseReceivables";

const lease = (overrides: Partial<Lease> = {}): Lease => ({
  id: "l1",
  leaseReference: "LEASE-001",
  propertyId: "p1",
  tenantIds: ["t1"],
  billingTenantId: "t1",
  primaryTenantId: "t1",
  coTenantIds: [],
  unitId: "u1",
  lifecycleStage: "active",
  startDate: "2026-01-01",
  endDate: "2027-03-31",
  monthlyRent: 1000,
  monthlyCharges: 100,
  dueDayOfMonth: 1,
  depositOrGuaranteeAmount: null,
  noticePeriodText: "",
  signedDate: "2025-12-15",
  notes: "",
  noticeGiven: false,
  noticeDate: null,
  intendedMoveOutDate: null,
  terminationReason: null,
  moveInScheduledDate: null,
  moveInActualDate: null,
  moveInMeterReading: null,
  moveInWaterMeterReading: null,
  moveInChecklist: {
    leaseSigned: false,
    firstPaymentReceived: false,
    guaranteeConfirmed: false,
    keysHandedOver: false,
    meterReadingCaptured: false,
    tenantDocumentsComplete: false,
  },
  moveOutScheduledDate: null,
  moveOutActualDate: null,
  moveOutMeterReading: null,
  moveOutWaterMeterReading: null,
  moveOutChecklist: {
    noticeConfirmed: false,
    moveOutDateConfirmed: false,
    keysReturned: false,
    moveOutMeterReadingCaptured: false,
    balanceReviewed: false,
    guaranteeReviewCompleted: false,
  },
  moveOutNotes: "",
  keyHandoverCount: 0,
  keyReturnCount: 0,
  returnStatus: null,
  returnNotes: "",
  rentFormula: 1,
  hasAdvancePayment: false,
  advancePaymentAmount: null,
  advancePaymentDate: null,
  advanceAllocationMethod: null,
  advanceAppliedTo: null,
  advanceAllocationStartDate: null,
  advanceAllocationDurationMonths: null,
  fixedMonthlyReductionAmount: null,
  chargesBillingMode: "provision-reconciled",
  pricingMode: "separated",
  payerAccounts: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

describe("lease indexation", () => {
  it("distributes current indexed rent across reconciled unit shares", () => {
    const source = lease({
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 110,
    });
    const assignments = [
      { unitId: "u1", rentShare: 900 },
      { unitId: "u2", rentShare: 100 },
    ];

    expect([...getCurrentUnitRentShares(source, assignments, "2027-01-01")!]).toEqual([
      ["u1", 990], ["u2", 110],
    ]);
    expect([...getCurrentUnitRentShares(source, assignments, "2026-12-31")!]).toEqual([
      ["u1", 900], ["u2", 100],
    ]);
  });

  it("does not invent a per-unit rent when shares are missing or inconsistent", () => {
    const source = lease();
    expect(getCurrentUnitRentShares(source, [{ unitId: "u1", rentShare: null }], "2026-06-01")).toBeNull();
    expect(getCurrentUnitRentShares(source, [{ unitId: "u1", rentShare: 900 }], "2026-06-01")).toBeNull();
    expect(getCurrentUnitRentShares(source, [
      { unitId: "u1", rentShare: 900 }, { unitId: "u1", rentShare: 100 },
    ], "2026-06-01")).toBeNull();
    expect(getCurrentUnitRentShares(source, [
      { unitId: "u1", rentShare: 900 }, { unitId: "u2", rentShare: 100.01 },
    ], "2026-06-01")).toBeNull();
    expect(getCurrentUnitRentShares(lease({ monthlyRent: 0.3 }), [
      { unitId: "u1", rentShare: 0.1 }, { unitId: "u2", rentShare: 0.2 },
    ], "2026-06-01")).not.toBeNull();
  });

  it("does not apply before the first yearly anniversary", () => {
    const source = lease({
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 110,
    });

    expect(computeLeaseIndexation(source, "2026-12-31").applicable).toBe(false);
    expect(getIndexedMonthlyRent(source, "2026-12-31")).toBe(1000);
  });

  it("preserves the contractual rent before indexation despite whole-euro rounding", () => {
    const source = lease({
      monthlyRent: 1000.49,
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 110,
      indexationRoundingMode: "nearest-euro",
    });

    expect(getIndexedMonthlyRent(source, "2026-12-31")).toBe(1000.49);
    expect(getIndexedRentTotal(source, "2026-12-31", 3)).toBe(3001.47);
    expect(getIndexedMonthlyRent(source, "2027-01-01")).toBe(1101);
  });

  it("does not round a lease with indexation disabled", () => {
    const source = lease({
      monthlyRent: 1000.49,
      indexationEnabled: false,
      indexationRoundingMode: "nearest-euro",
    });

    expect(getIndexedMonthlyRent(source, "2027-01-01")).toBe(1000.49);
    expect(getIndexedRentTotal(source, "2027-01-01", 3)).toBe(3001.47);
  });

  it("applies the index ratio after the anniversary", () => {
    const source = lease({
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 110,
    });

    expect(getIndexedMonthlyRent(source, "2027-01-01")).toBe(1100);
  });

  it("rounds indexed half cents consistently before creating rent receivables", () => {
    const source = lease({
      monthlyRent: 0.29,
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 150,
    });
    expect(getIndexedMonthlyRent(source, "2027-01-01")).toBe(0.44);
    expect(getIndexedRentTotal(source, "2027-01-01", 3)).toBe(1.32);
    expect(getIndexedMonthlyRent({ ...source, indexationCapPercent: 50 }, "2027-01-01")).toBe(0.44);
    expect(getIndexedRentTotal({ ...source, indexationRoundingMode: "none" }, "2027-01-01", 3)).toBe(1.31);
  });

  it("caps indexation when a contractual cap is set", () => {
    const source = lease({
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 120,
      indexationCapPercent: 5,
    });

    expect(getIndexedMonthlyRent(source, "2027-01-01")).toBe(1050);
  });

  it("rounds only the final billable total when intermediate rounding is disabled", () => {
    const source = lease({
      rentFormula: 3,
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 112.3456,
      indexationRoundingMode: "none",
    });

    expect(getIndexedMonthlyRent(source, "2027-01-01")).toBeCloseTo(1123.456);
    expect(getIndexedRentTotal(source, "2027-01-01", 3)).toBe(3370.37);
    expect(getIndexedRentTotal({ ...source, indexationRoundingMode: "nearest-cent" }, "2027-01-01", 3)).toBe(3370.38);

    const result = generateLeaseReceivables(source, {
      currencyCode: "EUR", genId: prefix => `${prefix}-1`, today: "2027-01-01", leadDays: 90,
    });
    const rent = result.receivables.find(item => item.itemType === "rent" && item.periodMonth === "2027-01");
    expect(rent?.expectedAmount).toBe(3370.37);
    expect(rent?.outstandingAmount).toBe(3370.37);
  });

  it("generates indexed rent receivables while keeping charges separate", () => {
    let seq = 0;
    const result = generateLeaseReceivables(lease({
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 110,
    }), {
      currencyCode: "EUR",
      genId: prefix => `${prefix}-${++seq}`,
      today: "2027-01-01",
      leadDays: 90,
    });

    const januaryRent = result.receivables.find(r => r.itemType === "rent" && r.periodMonth === "2027-01");
    const januaryCharges = result.receivables.find(r => r.itemType === "charges" && r.periodMonth === "2027-01");
    expect(januaryRent?.expectedAmount).toBe(1100);
    expect(januaryCharges?.expectedAmount).toBe(100);
  });

  it("replaces future unpaid rent after an indexation amendment without touching past or paid items", () => {
    let seq = 0;
    const options = { currencyCode: "EUR", genId: (prefix: string) => `${prefix}-${++seq}`, today: "2027-01-01", leadDays: 90 };
    const original = generateLeaseReceivables(lease(), options).receivables;
    const paidFebruary = original.find(item => item.itemType === "rent" && item.periodMonth === "2027-02")!;
    paidFebruary.allocatedAmount = paidFebruary.expectedAmount;
    paidFebruary.outstandingAmount = 0;
    paidFebruary.status = "paid";

    const indexed = generateLeaseReceivables(lease({
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: 110,
    }), { ...options, scheduleStartDate: "2027-01-01" }).receivables;
    const result = reconcileActivatedAmendmentReceivables(original, indexed, "l1", "2027-01-01");

    expect(result.nextReceivables.find(item => item.itemType === "rent" && item.periodMonth === "2026-12")?.expectedAmount).toBe(1000);
    expect(result.nextReceivables.find(item => item.itemType === "rent" && item.periodMonth === "2027-01")?.expectedAmount).toBe(1100);
    expect(result.nextReceivables.find(item => item.id === paidFebruary.id)).toBe(paidFebruary);
    expect(result.nextReceivables.filter(item => item.itemType === "rent" && item.periodMonth === "2027-02")).toHaveLength(1);
  });

  it("preserves a future receivable linked to a receipt even if its cached allocated amount is zero", () => {
    let seq = 0;
    const source = lease({ startDate: "2027-01-01", endDate: "2027-02-28" });
    const original = generateLeaseReceivables(source, {
      currencyCode: "EUR", genId: prefix => `${prefix}-${++seq}`, today: "2027-01-01", leadDays: 90,
    }).receivables;
    const linked = original.find(item => item.itemType === "rent" && item.periodMonth === "2027-02")!;
    const regenerated = generateLeaseReceivables({ ...source, monthlyRent: 1100 }, {
      currencyCode: "EUR", genId: prefix => `${prefix}-${++seq}`, today: "2027-01-01", leadDays: 90,
      scheduleStartDate: "2027-02-01",
    }).receivables;
    const result = reconcileActivatedAmendmentReceivables(original, regenerated, "l1", "2027-02-01", new Set([linked.id]));
    expect(result.removedReceivables.map(item => item.id)).not.toContain(linked.id);
    expect(result.nextReceivables.filter(item => item.itemType === "rent" && item.periodMonth === "2027-02")).toEqual([linked]);
  });
});
