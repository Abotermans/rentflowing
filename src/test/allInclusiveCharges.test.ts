import { describe, expect, it } from "vitest";
import type { Lease, LeaseUnitAssignment, Unit } from "@/types";
import type { ReceiptAllocation } from "@/types/receivables";
import type { CostAllocationResult, CostEntry } from "@/types/costs";
import { computeLeaseCostOverview } from "@/lib/chargesReconciliation";
import { generateLeaseReceivables } from "@/lib/leaseReceivables";
import { getUnitProfitability, type ProfitabilityInputs } from "@/lib/profitability";

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
  endDate: "2026-01-31",
  monthlyRent: 1200,
  monthlyCharges: 0,
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
  chargesBillingMode: "flat-rate",
  pricingMode: "all-inclusive",
  payerAccounts: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const unit = (overrides: Partial<Unit> = {}): Unit => ({
  id: "u1",
  propertyId: "p1",
  unitCode: "U1",
  unitLabel: "Unit 1",
  unitType: "apartment",
  floor: null,
  surfaceArea: null,
  bedrooms: 0,
  bathrooms: 0,
  furnished: false,
  currentStatus: "occupied",
  baseRent: 1200,
  rentTiers: [],
  baseCharges: null,
  availableFrom: null,
  notes: "",
  milliemeShares: {},
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
  rentShare: 1200,
  chargesShare: 0,
  notes: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const costEntry = (overrides: Partial<CostEntry> = {}): CostEntry => ({
  id: "ce1",
  categoryId: "cc1",
  propertyId: "p1",
  unitId: null,
  label: "Actual building charge",
  description: "",
  frequency: "one-off",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  amount: 300,
  currencyCode: "EUR",
  isTax: false,
  recoveryType: "tenant-recoverable",
  allocationRuleId: "ar1",
  vendorName: "",
  invoiceReference: "",
  status: "active",
  notes: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const allocation = (overrides: Partial<CostAllocationResult> = {}): CostAllocationResult => ({
  id: "car1",
  costEntryId: "ce1",
  propertyId: "p1",
  unitId: "u1",
  allocatedAmount: 300,
  recoveryType: "tenant-recoverable",
  recoverableAmount: 300,
  ownerBurdenAmount: 0,
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const receiptAllocation = (overrides: Partial<ReceiptAllocation> = {}): ReceiptAllocation => ({
  id: "al1",
  cashReceiptId: "cr1",
  receivableItemId: "ri-1",
  allocatedAmount: 1200,
  allocationType: "manual",
  allocationDate: "2026-01-01",
  notes: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

describe("all-inclusive lease charges", () => {
  it("generates only the bundled rent receivable and no contractual charge line", () => {
    const result = generateLeaseReceivables(lease(), {
      currencyCode: "EUR",
      genId: prefix => `${prefix}-1`,
      today: "2026-01-01",
      leadDays: 31,
      assignments: [assignment()],
      units: [unit()],
    });

    expect(result.receivables).toHaveLength(1);
    expect(result.receivables[0].itemType).toBe("rent");
    expect(result.receivables[0].expectedAmount).toBe(1200);
    expect(result.receivables.some(receivable => receivable.itemType === "charges")).toBe(false);
  });

  it("still shows actual allocated charges on the lease cost overview", () => {
    const overview = computeLeaseCostOverview(
      lease(),
      [assignment()],
      [unit()],
      [allocation()],
      [costEntry()],
      { todayISO: "2026-01-31" },
    );

    expect(overview.lines).toHaveLength(1);
    expect(overview.totals.allocated).toBe(300);
    expect(overview.totals.recoverable).toBe(300);
  });

  it("uses actual charges in unit operational return without charge receivables", () => {
    const receivableResult = generateLeaseReceivables(lease(), {
      currencyCode: "EUR",
      genId: prefix => `${prefix}-1`,
      today: "2026-01-01",
      leadDays: 31,
      assignments: [assignment()],
      units: [unit()],
    });
    receivableResult.receivables[0] = {
      ...receivableResult.receivables[0],
      allocatedAmount: 1200,
      outstandingAmount: 0,
      status: "paid",
    };

    const inputs: ProfitabilityInputs = {
      units: [unit()],
      leases: [lease()],
      assignments: [assignment()],
      receivables: receivableResult.receivables,
      receipts: [],
      allocations: [],
      costEntries: [costEntry()],
      costAllocations: [allocation()],
    };
    const profitability = getUnitProfitability("u1", inputs, null, { start: "2026-01-01", end: "2026-01-31" });

    expect(profitability.revenue.billedRent).toBe(1200);
    expect(profitability.revenue.collectedRent).toBe(1200);
    expect(profitability.costs.allocatedCharges).toBe(300);
    expect(profitability.recovery.provisionsBilled).toBe(0);
    expect(profitability.recovery.ownerBorne).toBe(300);
    expect(profitability.noi).toBe(900);
  });

  it("does not double-count collected rent when a paid receivable also has allocations", () => {
    const receivableResult = generateLeaseReceivables(lease(), {
      currencyCode: "EUR",
      genId: prefix => `${prefix}-1`,
      today: "2026-01-01",
      leadDays: 31,
      assignments: [assignment()],
      units: [unit()],
    });
    receivableResult.receivables[0] = {
      ...receivableResult.receivables[0],
      allocatedAmount: 1200,
      outstandingAmount: 0,
      status: "paid",
    };

    const inputs: ProfitabilityInputs = {
      units: [unit()],
      leases: [lease()],
      assignments: [assignment()],
      receivables: receivableResult.receivables,
      receipts: [],
      allocations: [receiptAllocation({ receivableItemId: receivableResult.receivables[0].id })],
      costEntries: [costEntry()],
      costAllocations: [allocation()],
    };
    const profitability = getUnitProfitability("u1", inputs, null, { start: "2026-01-01", end: "2026-01-31" });

    expect(profitability.revenue.collectedRent).toBe(1200);
  });
});
