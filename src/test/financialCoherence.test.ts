import { describe, expect, it, vi } from "vitest";
import type { Lease, LeaseUnitAssignment, Property, Unit } from "@/types";
import type { ReceivableItem } from "@/types/receivables";
import type { AllocationRule, CostAllocationResult, CostEntry } from "@/types/costs";
import { computeAllocations } from "@/lib/costAllocation";
import { recognizeAmountForPeriod } from "@/lib/costRecognition";
import { computeLeaseCostOverview, computeReconciliation, findOverlappingReconciliation } from "@/lib/chargesReconciliation";
import {
  getPropertyCostSummary,
  getPropertyProfitability,
  getPropertyRevenueSummary,
  getPropertyRecoverySummary,
  getUnitCostSummary,
  getUnitProfitability,
  getUnitRevenueSummary,
  getUnitRecoverySummary,
  type ProfitabilityInputs,
} from "@/lib/profitability";

const period = { start: "2026-01-01", end: "2026-01-31" };

function unit(id = "u1", overrides: Partial<Unit> = {}): Unit {
  return {
    id, propertyId: "p1", unitCode: id, unitLabel: id,
    currentStatus: "occupied", surfaceArea: 10, milliemeShares: { general: 1 },
    ...overrides,
  } as Unit;
}

function cost(overrides: Partial<CostEntry> = {}): CostEntry {
  return {
    id: "c1", propertyId: "p1", unitId: null, label: "Charge", invoiceReference: "",
    startDate: "2026-01-01", endDate: null, amount: 1200,
    recoveryType: "tenant-recoverable", isTax: false, status: "active",
    recognitionMode: "immediate", amortizationStartDate: null, amortizationEndDate: null,
    ...overrides,
  } as CostEntry;
}

function rule(overrides: Partial<AllocationRule> = {}): AllocationRule {
  return {
    id: "r1", propertyId: "p1", method: "equal", applyOnlyToOccupiedUnits: false,
    includeUnavailableUnits: true, shareKey: "general", milliemeAllocationMode: "normalized",
    ...overrides,
  } as AllocationRule;
}

function rows(entry: CostEntry, units: Unit[]): CostAllocationResult[] {
  return computeAllocations(entry, rule(), units).map((row, index) => ({
    ...row, id: `a${index}`, createdAt: "2026-01-01", updatedAt: "2026-01-01",
  }));
}

function inputs(units: Unit[], entry: CostEntry, allocations: CostAllocationResult[]): ProfitabilityInputs {
  return {
    units, leases: [], assignments: [], receivables: [], receipts: [], allocations: [],
    costEntries: [entry], costAllocations: allocations,
  };
}

const property = { id: "p1", isPartiallyOwned: false, milliemeBase: 1000 } as Property;
const lease = { id: "l1", unitId: "u1", startDate: "2026-01-01", endDate: "2026-01-31", moveOutActualDate: null } as Lease;
const assignment = { leaseId: "l1", unitId: "u1", startDate: "2026-01-01", endDate: null } as LeaseUnitAssignment;

describe("financial calculation coherence", () => {
  it("flags mixed receivable currencies for unit and property returns only in the affected period", () => {
    const data = inputs([unit()], cost({ status: "cancelled" }), []);
    data.receivables = [
      { id: "gbp-rent", unitId: "u1", propertyId: "p1", itemType: "rent", dueDate: "2026-01-05", currencyCode: "GBP", status: "open" },
      { id: "eur-rent", unitId: "u1", propertyId: "p1", itemType: "rent", dueDate: "2026-01-05", currencyCode: "EUR", status: "paid" },
      { id: "eur-cancelled", unitId: "u1", propertyId: "p1", itemType: "charges", dueDate: "2026-01-05", currencyCode: "EUR", status: "cancelled" },
    ] as ReceivableItem[];
    const gbpProperty = { ...property, currencyCode: "GBP" } as Property;
    expect(getUnitProfitability("u1", data, gbpProperty, period).currencyMismatches).toEqual(["EUR"]);
    expect(getPropertyProfitability("p1", data, gbpProperty, period).currencyMismatches).toEqual(["EUR"]);
    const february = { start: "2026-02-01", end: "2026-02-28" };
    expect(getUnitProfitability("u1", data, gbpProperty, february).currencyMismatches).toEqual([]);
    expect(getPropertyProfitability("p1", data, gbpProperty, february).currencyMismatches).toEqual([]);
  });

  it("flags a foreign-currency cost only while it is recognized", () => {
    const data = inputs([unit()], cost({ currencyCode: "EUR" }), []);
    const gbpProperty = { ...property, currencyCode: "GBP" } as Property;
    expect(getPropertyProfitability("p1", data, gbpProperty, period).currencyMismatches).toEqual(["EUR"]);
    expect(getPropertyProfitability("p1", data, gbpProperty, { start: "2026-02-01", end: "2026-02-28" }).currencyMismatches).toEqual([]);
  });

  it("flags scheduled receivables without a plausible unit assignment, but not mid-month starts or manual rows", () => {
    const data = inputs([unit()], cost({ status: "cancelled" }), []);
    data.assignments = [{ ...assignment, startDate: "2026-02-10", endDate: "2026-12-31" }];
    data.receivables = [
      { id: "orphan", leaseId: "l1", unitId: "u1", propertyId: "p1", itemType: "rent",
        origin: "lease-schedule", dueDate: "2026-01-05", cycleEndDate: "2026-01-31", status: "paid",
        expectedAmount: 100, allocatedAmount: 100 },
      { id: "mid-month", leaseId: "l1", unitId: "u1", propertyId: "p1", itemType: "rent",
        origin: "lease-schedule", dueDate: "2026-02-05", cycleEndDate: "2026-02-28", status: "open",
        expectedAmount: 100, allocatedAmount: 0 },
      { id: "manual", leaseId: "l1", unitId: "u1", propertyId: "p1", itemType: "rent",
        origin: "manual", dueDate: "2026-01-06", status: "open",
        expectedAmount: 50, allocatedAmount: 0 },
      { id: "cancelled", leaseId: "l1", unitId: "u1", propertyId: "p1", itemType: "charges",
        origin: "lease-schedule", dueDate: "2026-01-07", status: "cancelled",
        expectedAmount: 20, allocatedAmount: 0 },
    ] as ReceivableItem[];

    expect(getUnitProfitability("u1", data, property, period).assignmentMismatchCount).toBe(1);
    expect(getPropertyProfitability("p1", data, property, period).assignmentMismatchCount).toBe(1);
    const february = { start: "2026-02-01", end: "2026-02-28" };
    expect(getUnitProfitability("u1", data, property, february).assignmentMismatchCount).toBe(0);
    expect(getPropertyProfitability("p1", data, property, february).assignmentMismatchCount).toBe(0);
  });

  it("withholds unit returns when multi-unit receivables do not match the lease", () => {
    const data = inputs([unit("u1"), unit("u2")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", dueDayOfMonth: 5,
      rentFormula: 1, monthlyRent: 1100, monthlyCharges: 110 }];
    data.assignments = [
      { ...assignment, unitId: "u1", rentShare: 900, chargesShare: 100 },
      { ...assignment, unitId: "u2", rentShare: 100, chargesShare: 0 },
    ];
    data.receivables = [
      { id: "rent", leaseId: "l1", propertyId: "p1", unitId: "u2", itemType: "rent",
        origin: "lease-schedule", periodMonth: "2026-01", dueDate: "2026-01-05",
        cycleEndDate: "2026-01-31", expectedAmount: 1000, allocatedAmount: 0, status: "open" },
      { id: "charges", leaseId: "l1", propertyId: "p1", unitId: "u2", itemType: "charges",
        origin: "lease-schedule", periodMonth: "2026-01", dueDate: "2026-01-05",
        cycleEndDate: "2026-01-31", expectedAmount: 100, allocatedAmount: 0, status: "open" },
    ] as ReceivableItem[];

    expect(getUnitProfitability("u1", data, property, period).unitAttributionIssueCount).toBe(2);
    expect(getUnitProfitability("u2", data, property, period).unitAttributionIssueCount).toBe(2);
    expect(getPropertyProfitability("p1", data, property, period).unitAttributionIssueCount).toBe(0);
    expect(getPropertyRevenueSummary("p1", data, period).billedRent).toBe(1000);
  });

  it("reconciles unit and property totals for stable multi-unit billing and collection", () => {
    const data = inputs([unit("u1"), unit("u2")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", dueDayOfMonth: 5,
      rentFormula: 1, monthlyRent: 1000, monthlyCharges: 100 }];
    data.assignments = [
      { ...assignment, unitId: "u1", rentShare: 900, chargesShare: 100 },
      { ...assignment, unitId: "u2", rentShare: 100, chargesShare: 0 },
    ];
    data.receivables = [
      { id: "rent", leaseId: "l1", propertyId: "p1", unitId: "u2", itemType: "rent",
        origin: "lease-schedule", periodMonth: "2026-01", dueDate: "2026-01-05",
        cycleEndDate: "2026-01-31", expectedAmount: 1000, allocatedAmount: 1000, status: "paid" },
      { id: "charges", leaseId: "l1", propertyId: "p1", unitId: "u2", itemType: "charges",
        origin: "lease-schedule", periodMonth: "2026-01", dueDate: "2026-01-05",
        cycleEndDate: "2026-01-31", expectedAmount: 100, allocatedAmount: 40, status: "partially-paid" },
    ] as ReceivableItem[];
    data.allocations = [{ id: "allocation", cashReceiptId: "receipt", receivableItemId: "charges",
      allocatedAmount: 40, allocationType: "manual", allocationDate: "2026-01-05",
      notes: "", createdAt: "2026-01-05", updatedAt: "2026-01-05" }];

    const apartment = getUnitProfitability("u1", data, property, period);
    const parking = getUnitProfitability("u2", data, property, period);
    const wholeProperty = getPropertyProfitability("p1", data, property, period);
    expect(apartment.unitAttributionIssueCount).toBe(0);
    expect(parking.unitAttributionIssueCount).toBe(0);
    expect([apartment.revenue.billedRent, parking.revenue.billedRent]).toEqual([900, 100]);
    expect([apartment.revenue.theoreticalRent, parking.revenue.theoreticalRent]).toEqual([900, 100]);
    expect([apartment.revenue.collectedRent, parking.revenue.collectedRent]).toEqual([900, 100]);
    expect([apartment.recovery.provisionsBilled, parking.recovery.provisionsBilled]).toEqual([100, 0]);
    expect([apartment.recovery.provisionsCollected, parking.recovery.provisionsCollected]).toEqual([40, 0]);
    expect(wholeProperty.revenue.billedRent).toBe(1000);
    expect(wholeProperty.revenue.theoreticalRent).toBe(1000);
    expect(wholeProperty.recovery.provisionsCollected).toBe(40);
  });

  it("flags duplicate whole-lease rows before showing a property return", () => {
    const data = inputs([unit("u1"), unit("u2")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", dueDayOfMonth: 5,
      rentFormula: 1, monthlyRent: 1000, monthlyCharges: 0 }];
    data.assignments = [
      { ...assignment, unitId: "u1", rentShare: 900, chargesShare: 0 },
      { ...assignment, unitId: "u2", rentShare: 100, chargesShare: 0 },
    ];
    data.receivables = ["u1", "u2"].map((unitId, index) => ({
      id: `rent-${index}`, leaseId: "l1", propertyId: "p1", unitId, itemType: "rent",
      origin: "lease-schedule", periodMonth: "2026-01", cycleEndDate: "2026-01-31",
      dueDate: "2026-01-05", expectedAmount: 1000, allocatedAmount: 0, status: "open",
    })) as ReceivableItem[];

    expect(getPropertyProfitability("p1", data, property, period).scheduleCycleIssueCount).toBe(2);
    expect(getUnitProfitability("u1", data, property, period).unitAttributionIssueCount).toBe(2);
  });

  it("flags a duplicate billing slot even when its cycle end dates differ", () => {
    const data = inputs([unit("u1")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", dueDayOfMonth: 5,
      rentFormula: 1, monthlyRent: 1000, monthlyCharges: 0 }];
    data.assignments = [{ ...assignment, unitId: "u1", rentShare: 1000, chargesShare: 0 }];
    data.receivables = ["2026-01-31", "2026-02-28"].map((cycleEndDate, index) => ({
      id: `rent-${index}`, leaseId: "l1", propertyId: "p1", unitId: "u1", itemType: "rent",
      origin: "lease-schedule", periodMonth: "2026-01", cycleEndDate,
      dueDate: "2026-01-05", expectedAmount: 1000, allocatedAmount: 0, status: "open",
    })) as ReceivableItem[];

    expect(getPropertyProfitability("p1", data, property, period).scheduleCycleIssueCount).toBe(2);
  });

  it("flags a single scheduled row that differs from its contractual cycle", () => {
    const data = inputs([unit("u1")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", dueDayOfMonth: 5,
      rentFormula: 1, monthlyRent: 1000, monthlyCharges: 0 }];
    data.assignments = [{ ...assignment, unitId: "u1", rentShare: 1000, chargesShare: 0 }];
    data.receivables = [{ id: "rent", leaseId: "l1", propertyId: "p1", unitId: "u1",
      itemType: "rent", origin: "lease-schedule", periodMonth: "2026-01",
      cycleEndDate: "2026-01-31", dueDate: "2026-01-05", expectedAmount: 1200,
      allocatedAmount: 0, status: "open" }] as ReceivableItem[];

    expect(getPropertyProfitability("p1", data, property, period).scheduleCycleIssueCount).toBe(1);
    expect(getUnitProfitability("u1", data, property, period).unitAttributionIssueCount).toBe(1);
  });

  it("withholds a property return when a legacy schedule row cannot be checked against a cycle", () => {
    const data = inputs([unit("u1")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", dueDayOfMonth: 5,
      rentFormula: 1, monthlyRent: 1000, monthlyCharges: 0 }];
    data.assignments = [{ ...assignment, unitId: "u1", rentShare: 1000, chargesShare: 0 }];
    data.receivables = [{ id: "legacy-rent", leaseId: "l1", propertyId: "p1", unitId: "u1",
      itemType: "rent", origin: "lease-schedule", periodMonth: "2026-01",
      cycleEndDate: null, dueDate: "2026-01-05", expectedAmount: 1200,
      allocatedAmount: 0, status: "open" }] as ReceivableItem[];

    expect(getPropertyProfitability("p1", data, property, period).scheduleCycleIssueCount).toBe(1);
  });

  it("keeps separate per-unit schedule rows when they sum to the lease cycle", () => {
    const data = inputs([unit("u1"), unit("u2")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", dueDayOfMonth: 5,
      rentFormula: 1, monthlyRent: 1000, monthlyCharges: 0 }];
    data.assignments = [
      { ...assignment, unitId: "u1", rentShare: 900, chargesShare: 0 },
      { ...assignment, unitId: "u2", rentShare: 100, chargesShare: 0 },
    ];
    data.receivables = [["u1", 900], ["u2", 100]].map(([unitId, amount], index) => ({
      id: `rent-${index}`, leaseId: "l1", propertyId: "p1", unitId, itemType: "rent",
      origin: "lease-schedule", periodMonth: "2026-01", cycleEndDate: "2026-01-31",
      dueDate: "2026-01-05", expectedAmount: amount, allocatedAmount: 0, status: "open",
    })) as ReceivableItem[];

    expect(getPropertyProfitability("p1", data, property, period).scheduleCycleIssueCount).toBe(0);
    expect(getUnitProfitability("u1", data, property, period).revenue.billedRent).toBe(900);
    expect(getUnitProfitability("u2", data, property, period).revenue.billedRent).toBe(100);
    expect(getUnitProfitability("u1", data, property, period).unitAttributionIssueCount).toBe(0);
  });

  it("recognizes unit shares from a rent-formula cycle restarted by an amendment", () => {
    const data = inputs([unit("u1"), unit("u2")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", endDate: "2026-12-31",
      dueDayOfMonth: 5, rentFormula: 6, monthlyRent: 1000, monthlyCharges: 0,
      primaryTenantId: "tenant", billingTenantId: "tenant", tenantIds: ["tenant"], coTenantIds: [] }];
    data.assignments = [
      { ...assignment, unitId: "u1", rentShare: 900, chargesShare: 0 },
      { ...assignment, unitId: "u2", rentShare: 100, chargesShare: 0 },
    ];
    data.amendments = [{ id: "amendment", leaseId: "l1", amendmentNumber: 1,
      title: "Formula change", reason: "", notes: "", effectiveDate: "2026-04-15",
      signedDate: "2026-04-10", status: "active", supersedesAmendmentId: null,
      createdAt: "2026-04-10", updatedAt: "2026-04-15" }];
    data.amendmentChanges = [{ id: "change", amendmentId: "amendment", fieldName: "rentFormula",
      changeType: "set", oldValue: 1, newValue: 6,
      createdAt: "2026-04-10", updatedAt: "2026-04-15" }];
    data.receivables = [["u1", 5400], ["u2", 600]].map(([unitId, amount], index) => ({
      id: `rent-${index}`, leaseId: "l1", propertyId: "p1", unitId, itemType: "rent",
      origin: "lease-schedule", periodMonth: "2026-04", cycleEndDate: "2026-10-14",
      dueDate: "2026-04-15", expectedAmount: amount, allocatedAmount: 0, status: "open",
    })) as ReceivableItem[];
    const amendedPeriod = { start: "2026-04-15", end: "2026-10-14" };

    expect(getPropertyProfitability("p1", data, property, amendedPeriod).scheduleCycleIssueCount).toBe(0);
    expect(getUnitProfitability("u1", data, property, amendedPeriod).revenue.billedRent).toBe(5400);
    expect(getUnitProfitability("u2", data, property, amendedPeriod).revenue.billedRent).toBe(600);
  });

  it("does not block a unit return for successive non-overlapping assignments", () => {
    const data = inputs([unit("u1"), unit("u2")], cost({ status: "cancelled" }), []);
    data.leases = [{ ...lease, propertyId: "p1", endDate: "2026-02-28",
      monthlyRent: 100, monthlyCharges: 0, rentFormula: 1, dueDayOfMonth: 5 }];
    data.assignments = [
      { ...assignment, unitId: "u1", endDate: "2026-01-31", rentShare: 100, chargesShare: 0 },
      { ...assignment, unitId: "u2", startDate: "2026-02-01", rentShare: 100, chargesShare: 0 },
    ];
    data.receivables = [
      { id: "jan", leaseId: "l1", propertyId: "p1", unitId: "u1", itemType: "rent",
        origin: "lease-schedule", periodMonth: "2026-01", cycleEndDate: "2026-01-31", dueDate: "2026-01-05",
        expectedAmount: 100, allocatedAmount: 0, status: "open" },
    ] as ReceivableItem[];

    expect(getUnitProfitability("u1", data, property, period).unitAttributionIssueCount).toBe(0);
    expect(getUnitProfitability("u2", data, property, period).unitAttributionIssueCount).toBe(0);
  });

  it("treats reconciliation periods as inclusive without blocking the next day", () => {
    const history = [{ periodStart: "2026-01-01", periodEnd: "2026-01-31" }];
    expect(findOverlappingReconciliation({ start: "2026-01-31", end: "2026-02-28" }, history)).toBe(history[0]);
    expect(findOverlappingReconciliation({ start: "2026-02-01", end: "2026-02-28" }, history)).toBeUndefined();
  });

  it("recognizes overdue rent on the property's calendar day across a border", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T22:30:00Z"));
    try {
      const data = inputs([unit()], cost({ status: "cancelled" }), []);
      data.receivables = [{
        id: "rent-1", unitId: "u1", propertyId: "p1", itemType: "rent",
        dueDate: "2026-10-17", expectedAmount: 100, allocatedAmount: 0,
        outstandingAmount: 100, currencyCode: "EUR", status: "open",
      } as ReceivableItem];
      const win = { start: "2026-10-01", end: "2026-10-31" };
      const paris = { ...property, countryCode: "FR", timeZone: "Europe/Paris" } as Property;
      const london = { ...property, countryCode: "GB", timeZone: "Europe/London" } as Property;
      expect(getUnitProfitability("u1", data, paris, win).revenue.unpaidLoss).toBe(100);
      expect(getUnitProfitability("u1", data, london, win).revenue.unpaidLoss).toBe(0);
      expect(getPropertyProfitability("p1", data, paris, win).revenue.unpaidLoss).toBe(100);
      expect(getPropertyProfitability("p1", data, london, win).revenue.unpaidLoss).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("excludes cancelled rent and charges without hiding written-off debt", () => {
    const data = inputs([unit()], cost({ status: "cancelled" }), []);
    data.receivables = [
      {
        id: "cancelled-rent", unitId: "u1", propertyId: "p1", itemType: "rent",
        dueDate: "2026-01-05", expectedAmount: 500, allocatedAmount: 0, status: "cancelled",
      },
      {
        id: "written-off-rent", unitId: "u1", propertyId: "p1", itemType: "rent",
        dueDate: "2026-01-06", expectedAmount: 100, allocatedAmount: 0, status: "written-off",
      },
      {
        id: "cancelled-charges", unitId: "u1", propertyId: "p1", itemType: "charges",
        dueDate: "2026-01-07", expectedAmount: 50, allocatedAmount: 0, status: "cancelled",
      },
      {
        id: "cancelled-adjustment", unitId: "u1", propertyId: "p1", itemType: "charges-adjustment",
        dueDate: "2026-01-08", expectedAmount: 25, allocatedAmount: 0, status: "cancelled",
      },
    ] as ReceivableItem[];

    const unitRevenue = getUnitRevenueSummary("u1", data, period, "2026-02-01");
    const propertyRevenue = getPropertyRevenueSummary("p1", data, period, "2026-02-01");
    expect(unitRevenue.billedRent).toBe(100);
    expect(unitRevenue.unpaidLoss).toBe(100);
    expect(propertyRevenue.billedRent).toBe(100);
    expect(propertyRevenue.unpaidLoss).toBe(100);
    expect(getUnitRecoverySummary("u1", data, period).provisionsBilled).toBe(0);
    expect(getPropertyRecoverySummary("p1", data, period, property).provisionsBilled).toBe(0);
  });

  it("does not count vacancy before a unit becomes available", () => {
    const data = inputs([unit("u1", { baseRent: 1400, availableFrom: "2026-10-01" })], cost(), []);
    data.leases = [{ ...lease, lifecycleStage: "active", endDate: "2027-09-30" }];
    data.assignments = [{ ...assignment, endDate: "2027-09-30", startDate: "2026-10-01" }];
    const revenue = getUnitRevenueSummary("u1", data, { start: "2025-10-16", end: "2026-10-15" });
    expect(revenue.theoreticalRent).toBe(677.42);
    expect(revenue.vacancyLoss).toBe(0);
    expect(getPropertyRevenueSummary("p1", data, { start: "2025-10-16", end: "2026-10-15" })
      .theoreticalRent).toBe(677.42);
  });

  it("rounds half-cent mid-month vacancy consistently for unit and property returns", () => {
    const data = inputs([unit("u1", { baseRent: 1000.29, currentStatus: "vacant",
      availableFrom: "2026-04-01" })], cost({ status: "cancelled" }), []);
    const firstHalf = { start: "2026-04-01", end: "2026-04-15" };
    expect(getUnitRevenueSummary("u1", data, firstHalf)).toMatchObject({
      theoreticalRent: 500.15, vacancyLoss: 500.15,
    });
    expect(getPropertyRevenueSummary("p1", data, firstHalf)).toMatchObject({
      theoreticalRent: 500.15, vacancyLoss: 500.15,
    });
  });

  it("keeps a unit vacant when its only overlapping lease is a draft", () => {
    const data = inputs([unit("u1", { baseRent: 1400, availableFrom: "2026-10-01" })], cost(), []);
    data.leases = [{ ...lease, lifecycleStage: "draft", startDate: "2026-11-01", endDate: "2026-11-30" }];
    data.assignments = [{ ...assignment, startDate: "2026-11-01", endDate: "2026-11-30" }];
    expect(getUnitRevenueSummary("u1", data, { start: "2026-11-01", end: "2026-11-30" }).vacancyLoss).toBe(1400);
  });

  it("counts vacancy after lease end even when a stale assignment extends further", () => {
    const data = inputs([unit("u1", { baseRent: 1400, availableFrom: "2026-01-01" })], cost(), []);
    data.leases = [{ ...lease, lifecycleStage: "active", endDate: "2026-06-30" }];
    data.assignments = [{ ...assignment, endDate: "2026-12-31" }];

    expect(getUnitRevenueSummary("u1", data, { start: "2026-07-01", end: "2026-07-31" }).vacancyLoss).toBe(1400);
    expect(getPropertyRevenueSummary("p1", data, { start: "2026-07-01", end: "2026-07-31" }).vacancyLoss).toBe(1400);
  });

  it("prorates vacancy after a mid-month lease end without double-counting occupied days", () => {
    const data = inputs([unit("u1", { baseRent: 310, availableFrom: "2026-07-01" })], cost(), []);
    data.leases = [{ ...lease, lifecycleStage: "ended", startDate: "2026-07-01", endDate: "2026-07-10" }];
    data.assignments = [{ ...assignment, startDate: "2026-07-01", endDate: null }];

    const july = { start: "2026-07-01", end: "2026-07-31" };
    expect(getUnitRevenueSummary("u1", data, july)).toMatchObject({ theoreticalRent: 310, vacancyLoss: 210 });
    expect(getPropertyRevenueSummary("p1", data, july)).toMatchObject({ theoreticalRent: 310, vacancyLoss: 210 });
    expect(getUnitRevenueSummary("u1", data, { start: "2026-07-05", end: "2026-07-15" }))
      .toMatchObject({ theoreticalRent: 110, vacancyLoss: 50 });

    data.assignments = [...data.assignments, { ...assignment, id: "overlap", endDate: "2026-07-10" }];
    expect(getUnitRevenueSummary("u1", data, july).vacancyLoss).toBe(210);
  });

  it("uses billed rent as the unit theoretical fallback when no base rent is configured", () => {
    const data = inputs([unit("u1", { baseRent: null })], cost(), []);
    data.receivables = [{
      id: "rent-no-base", leaseId: null, unitId: "u1", propertyId: "p1",
      itemType: "rent", origin: "manual", dueDate: "2026-01-05",
      expectedAmount: 800, allocatedAmount: 0, status: "open",
    } as ReceivableItem];

    expect(getUnitRevenueSummary("u1", data, period)).toMatchObject({
      billedRent: 800, theoreticalRent: 800, vacancyLoss: 0,
    });
    expect(getPropertyRevenueSummary("p1", data, period)).toMatchObject({
      billedRent: 800, theoreticalRent: 800, vacancyLoss: 0,
    });
  });

  it("never allocates a negative share when cents are split across many units", () => {
    const units = Array.from({ length: 6 }, (_, index) => unit(`u${index + 1}`));
    for (const method of ["equal", "surface-area", "millieme"] as const) {
      const result = computeAllocations(cost({ amount: 0.04 }), rule({ method }), units);
      expect(result.every(row => row.allocatedAmount >= 0)).toBe(true);
      expect(result.reduce((sum, row) => sum + row.allocatedAmount, 0)).toBeCloseTo(0.04);
    }
  });

  it("keeps manual shares within the rule's eligible units", () => {
    const shares = [
      { id: "s1", allocationRuleId: "r1", unitId: "u1", percentageShare: 50, fixedAmountShare: null, coefficient: null },
      { id: "s2", allocationRuleId: "r1", unitId: "u2", percentageShare: 50, fixedAmountShare: null, coefficient: null },
    ];
    const result = computeAllocations(
      cost({ amount: 100 }), rule({ method: "manual-percentage", applyOnlyToOccupiedUnits: true }),
      [unit(), unit("u2", { currentStatus: "vacant" })], shares,
      property, { leases: [{ ...lease, lifecycleStage: "active" }], assignments: [assignment] },
    );
    expect(result.map(row => [row.unitId, row.allocatedAmount])).toEqual([["u1", 100]]);
  });

  it("excludes cancelled costs despite saved allocation rows", () => {
    const entry = cost({ status: "cancelled" });
    const allocations = rows(entry, [unit()]);
    const data = inputs([unit()], entry, allocations);
    const overview = computeLeaseCostOverview(lease, [assignment], [unit()], allocations, [entry]);
    const reconciliation = computeReconciliation(lease, period, [], allocations, [entry]);

    expect(getUnitCostSummary("u1", data, period).totalActual).toBe(0);
    expect(getUnitRecoverySummary("u1", data, period).actualRecoverable).toBe(0);
    expect(getPropertyCostSummary("p1", data, period, property).totalActual).toBe(0);
    expect(getPropertyRecoverySummary("p1", data, period, property).actualRecoverable).toBe(0);
    expect(overview.totals.recoverable).toBe(0);
    expect(reconciliation.actualRecoverable).toBe(0);
  });

  it("excludes informational costs despite stale recoverable allocation rows", () => {
    const entry = cost({ recoveryType: "informational" });
    const staleRows = rows(cost(), [unit()]);
    const data = inputs([unit()], entry, staleRows);

    expect(getUnitCostSummary("u1", data, period).totalActual).toBe(0);
    expect(getUnitRecoverySummary("u1", data, period).actualRecoverable).toBe(0);
    expect(getPropertyCostSummary("p1", data, period, property).totalActual).toBe(0);
    expect(getPropertyRecoverySummary("p1", data, period, property).actualRecoverable).toBe(0);
    expect(computeLeaseCostOverview(lease, [assignment], [unit()], staleRows, [entry]).totals.recoverable).toBe(0);
    expect(computeReconciliation(lease, period, [], staleRows, [entry]).actualRecoverable).toBe(0);
  });

  it("uses amortization dates for allocation rows without saved periods", () => {
    const entry = cost({ recognitionMode: "amortized", amortizationStartDate: "2026-01-01", amortizationEndDate: "2026-12-31" });
    const allocations = rows(entry, [unit()]).map(row => ({ ...row, periodStart: null, periodEnd: null }));
    const data = inputs([unit()], entry, allocations);
    const overview = computeLeaseCostOverview(lease, [assignment], [unit()], allocations, [entry]);
    const reconciliation = computeReconciliation(lease, period, [], allocations, [entry]);

    expect(getUnitCostSummary("u1", data, period).totalActual).toBe(101.92);
    expect(getUnitRecoverySummary("u1", data, period).actualRecoverable).toBe(101.92);
    expect(getPropertyCostSummary("p1", data, period, property).totalActual).toBe(101.92);
    expect(getPropertyRecoverySummary("p1", data, period, property).actualRecoverable).toBe(101.92);
    expect(overview.totals.recoverable).toBe(101.92);
    expect(reconciliation.actualRecoverable).toBe(101.92);
  });

  it("reconciles direct recoverable unit costs shown in the lease overview", () => {
    const entry = cost({ unitId: "u1", amount: 300, endDate: "2026-01-31" });
    const overview = computeLeaseCostOverview(lease, [assignment], [unit()], [], [entry]);
    const reconciliation = computeReconciliation(lease, period, [], [], [entry]);
    expect(overview.totals.recoverable).toBe(300);
    expect(reconciliation.actualRecoverable).toBe(300);
  });

  it("treats a direct unit cost as authoritative when stale allocation rows also exist", () => {
    const entry = cost({ unitId: "u1", allocationRuleId: "r1", amount: 300 });
    const staleRows = rows(cost({ amount: 300 }), [unit()]);
    const data = inputs([unit()], entry, staleRows);

    expect(getUnitCostSummary("u1", data, period).totalActual).toBe(300);
    expect(getUnitRecoverySummary("u1", data, period).actualRecoverable).toBe(300);
    expect(getPropertyCostSummary("p1", data, period, property).totalActual).toBe(300);
    expect(getPropertyRecoverySummary("p1", data, period, property).actualRecoverable).toBe(300);
    expect(computeLeaseCostOverview(lease, [assignment], [unit()], staleRows, [entry]).totals.recoverable).toBe(300);
    expect(computeReconciliation(lease, period, [], staleRows, [entry]).actualRecoverable).toBe(300);
  });

  it("reconciles costs across every unit assigned to the lease", () => {
    const entry = cost({ amount: 300, endDate: "2026-01-31" });
    const leaseAssignments = [
      { ...assignment, endDate: "2026-01-31" },
      { ...assignment, unitId: "u2", endDate: "2026-01-31" },
    ];
    const units = [unit("u1"), unit("u2")];
    const allocations = rows(entry, units);
    const reconciliation = computeReconciliation(lease, period, [], allocations, [entry], {
      assignments: leaseAssignments, units,
    });

    expect(reconciliation.actualRecoverable).toBe(300);
    expect(reconciliation.delta).toBe(-300);
    expect(reconciliation.lines.map(line => [line.unitId, line.proRatedRecoverable])).toEqual([
      ["u1", 150], ["u2", 150],
    ]);
  });

  it("does not treat a prior reconciliation adjustment as a new charges provision", () => {
    const receivables = [
      { id: "charges-feb", leaseId: lease.id, itemType: "charges", dueDate: "2026-02-05", allocatedAmount: 80 },
      { id: "prior-adjustment", leaseId: lease.id, itemType: "charges-adjustment", dueDate: "2026-02-10", allocatedAmount: 100 },
    ] as ReceivableItem[];

    const result = computeReconciliation(lease, { start: "2026-02-01", end: "2026-02-28" }, receivables, [], []);
    expect(result.provisionsCollected).toBe(80);
    expect(result.delta).toBe(80);
  });

  it("stops lease cost reconciliation at the earlier lease end or actual move-out", () => {
    const entry = cost({ unitId: "u1", amount: 310, endDate: "2026-01-31" });
    const leaseAssignments = [{ ...assignment, endDate: "2026-01-31" }];
    for (const dates of [
      { endDate: "2026-01-15", moveOutActualDate: "2026-01-25" },
      { endDate: "2026-01-25", moveOutActualDate: "2026-01-15" },
    ]) {
      const scopedLease = { ...lease, ...dates };
      const overview = computeLeaseCostOverview(scopedLease, leaseAssignments, [unit()], [], [entry], { todayISO: "2026-01-31" });
      const reconciliation = computeReconciliation(scopedLease, period, [], [], [entry], {
        assignments: leaseAssignments, units: [unit()],
      });

      expect(overview.totals.recoverable).toBe(150);
      expect(reconciliation.actualRecoverable).toBe(150);
    }
  });

  it("keeps the full owned property cost when absolute allocation excludes a vacant unit", () => {
    const units = [
      unit("u1", { milliemeShares: { general: 45 }, currentStatus: "occupied" }),
      unit("u2", { milliemeShares: { general: 55 }, currentStatus: "vacant" }),
    ];
    const partialProperty = { ...property, isPartiallyOwned: true };
    const entry = cost({ amount: 1000, recoveryType: "tenant-recoverable" });
    const absoluteRule = rule({ method: "millieme", milliemeAllocationMode: "absolute", applyOnlyToOccupiedUnits: true });
    const occupancy = { leases: [{ ...lease, lifecycleStage: "active" as const }], assignments: [assignment] };
    const allocationRows = computeAllocations(entry, absoluteRule, units, [], partialProperty, occupancy)
      .map((row, index) => ({ ...row, id: `allocated-${index}` } as CostAllocationResult));
    const data = inputs(units, entry, allocationRows);

    expect(allocationRows.map(row => row.allocatedAmount)).toEqual([45]);
    expect(getUnitCostSummary("u1", data, period).totalActual).toBe(45);
    expect(getUnitCostSummary("u2", data, period).totalActual).toBe(0);
    expect(getPropertyCostSummary("p1", data, period, partialProperty).totalActual).toBe(100);
    data.receivables = [{
      id: "collected-charges", leaseId: null, unitId: "u1", propertyId: "p1",
      itemType: "charges", origin: "manual", dueDate: "2026-01-05",
      expectedAmount: 45, allocatedAmount: 45, status: "paid",
    } as ReceivableItem];
    expect(getPropertyRecoverySummary("p1", data, period, partialProperty)).toMatchObject({
      actualRecoverable: 45, actualRecovered: 45, ownerBorne: 55,
    });

    const amortized = cost({ ...entry, recognitionMode: "amortized",
      amortizationStartDate: "2026-01-01", amortizationEndDate: "2026-01-31" });
    const amortizedRows = computeAllocations(amortized, absoluteRule, units, [], partialProperty, occupancy)
      .map((row, index) => ({ ...row, id: `amortized-${index}` } as CostAllocationResult));
    expect(getPropertyCostSummary("p1", inputs(units, amortized, amortizedRows),
      { start: "2026-01-01", end: "2026-01-15" }, partialProperty).totalActual).toBe(48.39);
  });

  it("does not report more recoverable property cost than the owned share when allocations are stale", () => {
    const units = [unit("u1", { milliemeShares: { general: 100 } })];
    const entry = cost({ amount: 1000, recoveryType: "tenant-recoverable" });
    const allocationRows = computeAllocations(entry, rule({ method: "equal" }), units, [], property)
      .map((row, index) => ({ ...row, id: `stale-${index}` } as CostAllocationResult));
    const partialProperty = { ...property, isPartiallyOwned: true };
    const data = inputs(units, entry, allocationRows);
    data.receivables = [{
      id: "collected-charges", leaseId: null, unitId: "u1", propertyId: "p1",
      itemType: "charges", origin: "manual", dueDate: "2026-01-05",
      expectedAmount: 1000, allocatedAmount: 1000, status: "paid",
    } as ReceivableItem];

    expect(allocationRows[0].allocatedAmount).toBe(1000);
    expect(getPropertyCostSummary("p1", data, period, partialProperty).totalActual).toBe(100);
    expect(getPropertyRecoverySummary("p1", data, period, partialProperty)).toMatchObject({
      actualRecoverable: 100, actualRecovered: 100, ownerBorne: 0,
    });

    const amortized = cost({ ...entry, recognitionMode: "amortized",
      amortizationStartDate: "2026-01-01", amortizationEndDate: "2026-01-31" });
    const halfMonth = { start: "2026-01-01", end: "2026-01-15" };
    expect(getPropertyRecoverySummary("p1", inputs(units, amortized, allocationRows),
      halfMonth, partialProperty).actualRecoverable).toBe(48.39);
  });

  it("uses the same explicit partial-recovery share in profitability and lease reconciliation", () => {
    const entry = cost({ unitId: "u1", amount: 300, endDate: "2026-01-31", recoveryType: "partially-recoverable", recoverablePercentage: 30 });
    const data = inputs([unit()], entry, []);
    const overview = computeLeaseCostOverview(lease, [assignment], [unit()], [], [entry]);
    const reconciliation = computeReconciliation(lease, period, [], [], [entry]);

    expect(getUnitRecoverySummary("u1", data, period).actualRecoverable).toBe(90);
    expect(getPropertyRecoverySummary("p1", data, period, property).actualRecoverable).toBe(90);
    expect(overview.totals.recoverable).toBe(90);
    expect(reconciliation.actualRecoverable).toBe(90);
  });

  it("preserves cents across adjacent amortization periods", () => {
    const monthlyTotal = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      const lastDay = new Date(Date.UTC(2026, index + 1, 0)).getUTCDate();
      return recognizeAmountForPeriod(0.01, "2026-01-01", "2026-12-31", {
        start: `2026-${month}-01`, end: `2026-${month}-${lastDay}`,
      });
    }).reduce((sum, amount) => sum + amount, 0);
    expect(monthlyTotal).toBeCloseTo(0.01);
  });
});
