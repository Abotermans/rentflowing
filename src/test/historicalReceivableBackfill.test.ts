import { describe, expect, it } from "vitest";
import type { Lease, LeaseUnitAssignment, LifecycleStage } from "@/types";
import type { ReceivableItem } from "@/types/receivables";
import {
  generateHistoricalPaidLeaseReceivables,
  generateLeaseReceivables,
  getOpenEndedReceivableThroughDate,
  getLeaseBillingSlotKey,
  getScheduledReceivableKey,
  reconcileActivatedAmendmentReceivables,
} from "@/lib/leaseReceivables";

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
  endDate: "2026-07-31",
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

const assignment = (overrides: Partial<LeaseUnitAssignment> = {}): LeaseUnitAssignment => ({
  id: "lua1",
  leaseId: "l1",
  unitId: "u1",
  startDate: "2026-01-01",
  endDate: null,
  rentShare: 1000,
  chargesShare: 100,
  notes: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const mainUnits = [{ id: "u1", unitType: "apartment" }] as const;

const receivable = (overrides: Partial<ReceivableItem> = {}): ReceivableItem => ({
  id: "ri-1",
  leaseId: "l1",
  tenantId: "t1",
  propertyId: "p1",
  unitId: "u1",
  itemType: "rent",
  label: "Monthly Rent",
  periodMonth: "2026-07",
  dueDate: "2026-07-01",
  currencyCode: "EUR",
  expectedAmount: 1000,
  allocatedAmount: 0,
  outstandingAmount: 1000,
  status: "open",
  priority: 10,
  origin: "lease-schedule",
  notes: "",
  cycleIndex: null,
  cycleEndDate: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const generate = (sourceLease: Lease, existingReceivables: ReceivableItem[] = []) => {
  let seq = 0;
  return generateHistoricalPaidLeaseReceivables(sourceLease, {
    currencyCode: "EUR",
    genId: prefix => `${prefix}-${++seq}`,
    today: "2026-06-25",
    assignments: [assignment({ leaseId: sourceLease.id })],
    units: mainUnits,
    existingReceivables,
  }).receivables;
};

describe("receivable relation requirements", () => {
  it("does not create scheduled receivables with an empty tenant or unit UUID", () => {
    const options = {
      currencyCode: "EUR",
      genId: () => "ri-1",
      today: "2026-06-25",
      leadDays: 30,
      assignments: [],
    };
    expect(generateLeaseReceivables(lease({ primaryTenantId: "" }), options).receivables).toHaveLength(0);
    expect(generateLeaseReceivables(lease({ unitId: "" }), options).receivables).toHaveLength(0);
  });

  it("does not backfill historical receivables without a unit", () => {
    expect(generateHistoricalPaidLeaseReceivables(lease({ unitId: "" }), {
      currencyCode: "EUR",
      genId: () => "ri-1",
      today: "2026-06-25",
      assignments: [],
    }).receivables).toHaveLength(0);
  });

  it("does not bill cycles after the last dated unit assignment ends", () => {
    const source = lease({ endDate: "2026-03-31" });
    const options = {
      currencyCode: "EUR",
      genId: () => crypto.randomUUID(),
      today: "2026-06-25",
      assignments: [assignment({ endDate: "2026-01-31" })],
      units: mainUnits,
    };
    expect(generateLeaseReceivables(source, { ...options, leadDays: 180 }).receivables
      .map(item => item.periodMonth)).toEqual(["2026-01", "2026-01"]);
    expect(generateHistoricalPaidLeaseReceivables(source, options).receivables
      .map(item => item.periodMonth)).toEqual(["2026-01", "2026-01"]);
  });

  it("attributes historical paid cycles to the main unit even when parking is first", () => {
    const source = lease({ endDate: "2026-01-31" });
    const result = generateHistoricalPaidLeaseReceivables(source, {
      currencyCode: "EUR", genId: () => crypto.randomUUID(), today: "2026-06-25",
      assignments: [assignment({ id: "parking-assignment", unitId: "parking-1" }), assignment()],
      units: [
        { id: "parking-1", unitType: "parking" },
        { id: "u1", unitType: "apartment" },
      ],
    });
    expect(result.receivables.map(item => item.unitId)).toEqual(["u1", "u1"]);
  });

  it("does not choose the first assignment without unit types", () => {
    const source = lease({ endDate: "2026-01-31" });
    const options = {
      currencyCode: "EUR", genId: () => crypto.randomUUID(), today: "2026-06-25",
      assignments: [assignment({ id: "parking-assignment", unitId: "parking-1" }), assignment()],
    };
    const historical = generateHistoricalPaidLeaseReceivables(source, options);
    const scheduled = generateLeaseReceivables(source, { ...options, leadDays: 30 });
    expect(historical.receivables).toHaveLength(0);
    expect(scheduled.receivables).toHaveLength(0);
    expect(historical.unassignedCycleStarts).toEqual(["2026-01-01"]);
    expect(scheduled.unassignedCycleStarts).toEqual(["2026-01-01"]);
  });
});

describe("scheduled receivable status date", () => {
  it("classifies generated items using the requested business date", () => {
    const source = lease({ endDate: "2026-01-31", dueDayOfMonth: 10 });
    const options = {
      currencyCode: "EUR",
      genId: () => "ri-1",
      leadDays: 0,
      assignments: [assignment()],
      units: mainUnits,
    };
    const beforeDue = generateLeaseReceivables(source, { ...options, today: "2026-01-09" }).receivables;
    const afterDue = generateLeaseReceivables(source, { ...options, today: "2026-01-11" }).receivables;
    expect(beforeDue.map(item => item.status)).toEqual(["open", "open"]);
    expect(afterDue.map(item => item.status)).toEqual(["overdue", "overdue"]);
  });

  it("opens the next cycle relative to its due date, not its start date", () => {
    const source = lease({ endDate: "2026-03-31", dueDayOfMonth: 25 });
    const options = {
      currencyCode: "EUR",
      genId: () => crypto.randomUUID(),
      leadDays: 10,
      assignments: [assignment()],
      units: mainUnits,
    };
    expect(generateLeaseReceivables(source, { ...options, today: "2026-01-30" }).receivables
      .map(item => item.periodMonth)).toEqual(["2026-01", "2026-01"]);
    expect(generateLeaseReceivables(source, { ...options, today: "2026-02-15" }).receivables
      .map(item => item.periodMonth)).toEqual(["2026-01", "2026-01", "2026-02", "2026-02"]);
    expect(getOpenEndedReceivableThroughDate("2026-02-15", 1, "2026-01-01", 10, 25))
      .toBe("2026-02-28");
  });
});

describe("generateHistoricalPaidLeaseReceivables", () => {
  it("creates paid monthly rent and charge receivables before the next due date", () => {
    const receivables = generate(lease());

    expect(receivables).toHaveLength(12);
    expect(receivables.map(r => r.periodMonth)).toEqual([
      "2026-01", "2026-01",
      "2026-02", "2026-02",
      "2026-03", "2026-03",
      "2026-04", "2026-04",
      "2026-05", "2026-05",
      "2026-06", "2026-06",
    ]);
    expect(receivables.every(r => r.status === "paid")).toBe(true);
    expect(receivables.every(r => r.outstandingAmount === 0)).toBe(true);
    expect(receivables.every(r => r.allocatedAmount === r.expectedAmount)).toBe(true);
  });

  it("does not create charges for all-inclusive leases", () => {
    const receivables = generate(lease({
      pricingMode: "all-inclusive",
      monthlyRent: 1100,
      monthlyCharges: 0,
    }));

    expect(receivables).toHaveLength(6);
    expect(receivables.every(r => r.itemType === "rent")).toBe(true);
  });

  it("excludes receivables due today because they are the next scheduled receivable", () => {
    const receivables = generate(lease({
      startDate: "2026-05-01",
      endDate: "2026-07-31",
      dueDayOfMonth: 25,
    }));

    expect(receivables).toHaveLength(2);
    expect(receivables.every(r => r.periodMonth === "2026-05")).toBe(true);
  });

  it("supports active open-ended leases by backfilling completed past due cycles only", () => {
    const receivables = generate(lease({ endDate: "" }));

    expect(receivables).toHaveLength(12);
    expect(receivables.at(-1)?.periodMonth).toBe("2026-06");
  });

  it("stops ended leases at the lease end date", () => {
    const receivables = generate(lease({
      lifecycleStage: "ended",
      endDate: "2026-03-31",
    }));

    expect(receivables).toHaveLength(6);
    expect(receivables.at(-1)?.periodMonth).toBe("2026-03");
  });

  it.each(["draft", "pending-signature", "signed"] as LifecycleStage[])(
    "does not backfill %s leases",
    lifecycleStage => {
      expect(generate(lease({ lifecycleStage }))).toHaveLength(0);
    },
  );

  it("skips receivables that already exist for the same schedule key", () => {
    const receivables = generate(lease());
    const duplicateProtected = generate(lease(), [receivables[0]]);

    expect(duplicateProtected).toHaveLength(11);
    expect(duplicateProtected.map(getScheduledReceivableKey)).not.toContain(getScheduledReceivableKey(receivables[0]));
  });

  it("does not backfill the same lease cycle when its unit anchor changed", () => {
    const existing = generate(lease())[0];
    const regenerated = generate(lease(), [{ ...existing, unitId: "u2" }]);

    expect(regenerated).toHaveLength(11);
    expect(regenerated.map(getLeaseBillingSlotKey)).not.toContain(getLeaseBillingSlotKey(existing));
  });

  it("creates paid advance-cycle receivables when the advance cycle is already due", () => {
    const receivables = generate(lease({
      rentFormula: 6,
      endDate: "2026-12-31",
      monthlyRent: 900,
      monthlyCharges: 90,
    }));

    expect(receivables).toHaveLength(2);
    expect(receivables.map(r => r.itemType)).toEqual(["rent", "charges"]);
    expect(receivables[0].expectedAmount).toBe(5400);
    expect(receivables[1].expectedAmount).toBe(540);
    expect(receivables.every(r => r.cycleIndex === 1)).toBe(true);
  });
});


describe("amendment receivable schedule segments", () => {
  it("bills a full advance cycle on an open-ended lease", () => {
    const openLease = lease({ endDate: "", rentFormula: 6, monthlyRent: 1000, monthlyCharges: 100 });
    const through = getOpenEndedReceivableThroughDate("2026-12-20", 6, openLease.startDate, 30);
    let sequence = 0;
    const result = generateLeaseReceivables(openLease, {
      currencyCode: "EUR",
      genId: prefix => `${prefix}-${++sequence}`,
      today: "2026-12-20",
      leadDays: 30,
      openEndedThroughDate: through,
    });
    const januaryRent = result.receivables.find(r => r.itemType === "rent" && r.dueDate === "2027-01-01");
    expect(januaryRent).toMatchObject({ expectedAmount: 6000, cycleEndDate: "2027-06-30" });
  });

  it("starts new advance cycles from the amendment effective date", () => {
    let seq = 0;
    const result = generateLeaseReceivables(lease({
      lifecycleStage: "active",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      rentFormula: 6,
      monthlyRent: 900,
      monthlyCharges: 90,
    }), {
      currencyCode: "EUR",
      genId: prefix => prefix + "-" + (++seq),
      today: "2026-07-01",
      leadDays: 400,
      assignments: [assignment({ startDate: "2026-01-01", endDate: null })],
      units: mainUnits,
      scheduleStartDate: "2026-07-01",
    });

    expect(result.receivables.map(r => [r.itemType, r.periodMonth, r.dueDate, r.cycleEndDate, r.expectedAmount])).toEqual([
      ["rent", "2026-07", "2026-07-01", "2026-12-31", 5400],
      ["charges", "2026-07", "2026-07-01", "2026-12-31", 540],
    ]);
    expect(result.receivables.every(r => r.cycleIndex === 1)).toBe(true);
  });

  it("does not place the first amended formula due date before its effective date", () => {
    const result = generateLeaseReceivables(lease({
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      dueDayOfMonth: 5,
      rentFormula: 6,
    }), {
      currencyCode: "EUR",
      genId: prefix => `${prefix}-new`,
      today: "2026-04-15",
      leadDays: 400,
      assignments: [assignment()],
      units: mainUnits,
      scheduleStartDate: "2026-04-15",
    });

    expect(result.receivables.filter(item => item.periodMonth === "2026-04")
      .map(item => item.dueDate)).toEqual(["2026-04-15", "2026-04-15"]);
    expect(result.receivables.filter(item => item.periodMonth === "2026-10")
      .map(item => item.dueDate)).toEqual(["2026-10-05", "2026-10-05"]);
  });

  it("keeps the original due day when the schedule has no amendment segment", () => {
    const startedMidMonth = lease({ startDate: "2026-04-15", dueDayOfMonth: 5 });
    const result = generateLeaseReceivables(startedMidMonth, {
      currencyCode: "EUR",
      genId: prefix => `${prefix}-original`,
      today: "2026-04-15",
      leadDays: 0,
      scheduleStartDate: startedMidMonth.startDate,
    });

    expect(result.receivables.filter(item => item.periodMonth === "2026-04")
      .map(item => item.dueDate)).toEqual(["2026-04-05", "2026-04-05"]);
  });

  it("includes due date and cycle end in advance receivable keys", () => {
    const first = {
      leaseId: "l1",
      unitId: "u1",
      itemType: "rent" as const,
      cycleIndex: 1,
      periodMonth: "2026-01",
      dueDate: "2026-01-01",
      cycleEndDate: "2026-06-30",
    };
    const second = {
      ...first,
      periodMonth: "2026-07",
      dueDate: "2026-07-01",
      cycleEndDate: "2026-12-31",
    };

    expect(getScheduledReceivableKey(first)).not.toBe(getScheduledReceivableKey(second));
  });

  it("activation replaces only unpaid lease-schedule receivables due on or after the effective date", () => {
    const past = receivable({
      id: "past",
      periodMonth: "2026-06",
      dueDate: "2026-06-01",
    });
    const futureRent = receivable({
      id: "future-rent",
      periodMonth: "2026-07",
      dueDate: "2026-07-01",
    });
    const futureCharges = receivable({
      id: "future-charges",
      itemType: "charges",
      label: "Monthly Charges",
      periodMonth: "2026-07",
      dueDate: "2026-07-01",
      expectedAmount: 100,
      outstandingAmount: 100,
      priority: 20,
    });
    const manualFuture = receivable({
      id: "manual-future",
      origin: "manual",
      itemType: "other",
      label: "Manual adjustment",
      dueDate: "2026-07-15",
    });
    const regenerated = [
      receivable({
        id: "new-advance-rent",
        label: "Rent — 6-month advance",
        expectedAmount: 5400,
        outstandingAmount: 5400,
        cycleIndex: 1,
        cycleEndDate: "2026-12-31",
      }),
      receivable({
        id: "new-advance-charges",
        itemType: "charges",
        label: "Charges — 6-month advance",
        expectedAmount: 540,
        outstandingAmount: 540,
        priority: 20,
        cycleIndex: 1,
        cycleEndDate: "2026-12-31",
      }),
    ];

    const result = reconcileActivatedAmendmentReceivables(
      [past, futureRent, futureCharges, manualFuture],
      regenerated,
      "l1",
      "2026-07-01",
    );

    expect(result.removedReceivables.map(r => r.id)).toEqual(["future-rent", "future-charges"]);
    expect(result.freshReceivables.map(r => r.id)).toEqual(["new-advance-rent", "new-advance-charges"]);
    expect(result.nextReceivables.map(r => r.id)).toEqual([
      "past",
      "manual-future",
      "new-advance-rent",
      "new-advance-charges",
    ]);
  });

  it("activation preserves allocated future receivables and skips regenerated duplicates for the same schedule key", () => {
    const allocatedFuture = receivable({
      id: "allocated-future",
      allocatedAmount: 250,
      outstandingAmount: 750,
      status: "partially-paid",
      cycleIndex: 1,
      cycleEndDate: "2026-12-31",
    });
    const regeneratedDuplicate = receivable({
      id: "regenerated-duplicate",
      cycleIndex: 1,
      cycleEndDate: "2026-12-31",
      expectedAmount: 5400,
      outstandingAmount: 5400,
    });
    const regeneratedCharges = receivable({
      id: "regenerated-charges",
      itemType: "charges",
      label: "Charges — 6-month advance",
      expectedAmount: 540,
      outstandingAmount: 540,
      priority: 20,
      cycleIndex: 1,
      cycleEndDate: "2026-12-31",
    });

    const result = reconcileActivatedAmendmentReceivables(
      [allocatedFuture],
      [regeneratedDuplicate, regeneratedCharges],
      "l1",
      "2026-07-01",
    );

    expect(result.removedReceivables).toEqual([]);
    expect(result.freshReceivables.map(r => r.id)).toEqual(["regenerated-charges"]);
    expect(result.nextReceivables.map(r => r.id)).toEqual(["allocated-future", "regenerated-charges"]);
  });

  it("does not double-bill a retained cycle when the lease due day changes", () => {
    const paid = receivable({
      id: "paid", dueDate: "2026-07-05", cycleEndDate: "2026-07-31",
      allocatedAmount: 1000, outstandingAmount: 0, status: "paid",
    });
    const replacement = receivable({
      id: "replacement", dueDate: "2026-07-20", cycleEndDate: "2026-07-31",
    });
    const result = reconcileActivatedAmendmentReceivables(
      [paid], [replacement], "l1", "2026-07-01",
    );

    expect(result.removedReceivables).toEqual([]);
    expect(result.freshReceivables).toEqual([]);
    expect(result.nextReceivables.map(item => item.id)).toEqual(["paid"]);
  });

  it("keeps an already-due open cycle instead of adding it again on a later due day", () => {
    const overdue = receivable({ id: "overdue", dueDate: "2026-07-05", status: "overdue" });
    const replacement = receivable({ id: "replacement", dueDate: "2026-07-20", cycleEndDate: "2026-07-31" });
    const result = reconcileActivatedAmendmentReceivables(
      [overdue], [replacement], "l1", "2026-07-15",
    );

    expect(result.freshReceivables).toEqual([]);
    expect(result.nextReceivables.map(item => item.id)).toEqual(["overdue"]);
  });

  it("allows distinct amendment segments in one month when their cycle ends differ", () => {
    const priorSegment = receivable({
      id: "prior", dueDate: "2026-07-01", cycleEndDate: "2026-07-14",
      allocatedAmount: 1000, outstandingAmount: 0, status: "paid",
    });
    const nextSegment = receivable({
      id: "next", dueDate: "2026-07-15", cycleEndDate: "2026-07-31",
    });
    const result = reconcileActivatedAmendmentReceivables(
      [priorSegment], [nextSegment], "l1", "2026-07-15",
    );

    expect(result.freshReceivables.map(item => item.id)).toEqual(["next"]);
  });
});
