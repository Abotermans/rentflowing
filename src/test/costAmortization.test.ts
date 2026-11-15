import { describe, expect, it } from "vitest";
import type { Lease, LeaseUnitAssignment, Property, Unit } from "@/types";
import type { CashReceipt, ReceivableItem, ReceiptAllocation } from "@/types/receivables";
import type { AllocationRule, CostAllocationResult, CostEntry } from "@/types/costs";
import { computeAllocations } from "@/lib/costAllocation";
import { recognizeAmountForPeriod } from "@/lib/costRecognition";
import { getPropertyCostSummary, getPropertyRecoverySummary, getUnitCostSummary, getUnitRecoverySummary, type ProfitabilityInputs } from "@/lib/profitability";

const property = (overrides: Partial<Property> = {}): Property => ({
  id: "p1",
  name: "Property",
  referenceCode: "P1",
  address1: "",
  address2: "",
  city: "",
  postalCode: "",
  regionOrState: "",
  countryCode: "FR",
  locale: "fr-FR",
  currencyCode: "EUR",
  measurementSystem: "metric",
  propertyType: "residential",
  ownerName: "",
  description: "",
  status: "active",
  milliemeBase: 1000,
  milliemeKeys: ["general"],
  isPartiallyOwned: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const unit = (id = "u1", share = 100): Unit => ({
  id,
  propertyId: "p1",
  unitCode: id.toUpperCase(),
  unitLabel: id.toUpperCase(),
  unitType: "apartment",
  floor: null,
  surfaceArea: 10,
  bedrooms: 0,
  bathrooms: 0,
  furnished: false,
  currentStatus: "vacant",
  baseRent: null,
  rentTiers: [],
  baseCharges: null,
  availableFrom: null,
  notes: "",
  milliemeShares: { general: share },
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const entry = (overrides: Partial<CostEntry> = {}): CostEntry => ({
  id: "ce1",
  categoryId: "cc1",
  propertyId: "p1",
  unitId: "u1",
  label: "Major repair",
  description: "",
  frequency: "one-off",
  startDate: "2026-01-01",
  endDate: null,
  amount: 1200,
  currencyCode: "EUR",
  recognitionMode: "immediate",
  amortizationStartDate: null,
  amortizationEndDate: null,
  isTax: false,
  recoveryType: "owner-only",
  allocationRuleId: null,
  vendorName: "",
  invoiceReference: "",
  status: "active",
  notes: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const rule = (overrides: Partial<AllocationRule> = {}): AllocationRule => ({
  id: "ar1",
  propertyId: "p1",
  name: "Equal",
  method: "equal",
  applyOnlyToOccupiedUnits: false,
  includeUnavailableUnits: true,
  notes: "",
  shareKey: "general",
  milliemeAllocationMode: "normalized",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const inputs = (overrides: Partial<ProfitabilityInputs> = {}): ProfitabilityInputs => ({
  units: [unit()],
  leases: [] as Lease[],
  assignments: [] as LeaseUnitAssignment[],
  receivables: [] as ReceivableItem[],
  receipts: [] as CashReceipt[],
  allocations: [] as ReceiptAllocation[],
  costEntries: [],
  costAllocations: [] as CostAllocationResult[],
  ...overrides,
});

describe("cost amortization", () => {
  it("recognizes half cents on the first day while preserving the invoice total", () => {
    const firstDay = recognizeAmountForPeriod(0.29, "2026-01-01", "2026-01-02", {
      start: "2026-01-01", end: "2026-01-01",
    });
    const secondDay = recognizeAmountForPeriod(0.29, "2026-01-01", "2026-01-02", {
      start: "2026-01-02", end: "2026-01-02",
    });
    expect([firstDay, secondDay]).toEqual([0.15, 0.14]);
    expect(firstDay + secondDay).toBeCloseTo(0.29, 10);
  });
  it("keeps an informational unit invoice out of owner profitability", () => {
    const data = inputs({ costEntries: [entry({ recoveryType: "informational" })] });
    const period = { start: "2026-01-01", end: "2026-01-31" };

    expect(getUnitCostSummary("u1", data, period).totalActual).toBe(0);
    expect(getUnitRecoverySummary("u1", data, period).ownerBorne).toBe(0);
    expect(getPropertyCostSummary("p1", data, period, property()).totalActual).toBe(0);
    expect(getPropertyRecoverySummary("p1", data, period, property()).ownerBorne).toBe(0);
  });

  it("keeps informational unit allocations out of owner profitability", () => {
    const cost = entry({ unitId: null, allocationRuleId: "ar1", recoveryType: "informational" });
    const units = [unit("u1"), unit("u2")];
    const costAllocations = computeAllocations(cost, rule(), units, [], property()) as CostAllocationResult[];
    const data = inputs({ units, costEntries: [cost], costAllocations });
    const period = { start: "2026-01-01", end: "2026-01-31" };

    expect(costAllocations.map(row => row.allocatedAmount)).toEqual([600, 600]);
    expect(costAllocations.map(row => row.ownerBurdenAmount)).toEqual([0, 0]);
    expect(getUnitCostSummary("u1", data, period).totalActual).toBe(0);
    expect(getUnitRecoverySummary("u1", data, period).ownerBorne).toBe(0);
    expect(getPropertyCostSummary("p1", data, period, property()).totalActual).toBe(0);
    expect(getPropertyRecoverySummary("p1", data, period, property()).ownerBorne).toBe(0);
  });

  it("keeps immediate one-off direct costs recognized on the cost start date", () => {
    const summary = getUnitCostSummary("u1", inputs({ costEntries: [entry()] }), { start: "2026-01-01", end: "2026-01-31" });
    expect(summary.totalActual).toBe(1200);
  });

  it("does not amortize an immediate direct cost over its service period", () => {
    const cost = entry({ endDate: "2026-12-31", recoveryType: "tenant-recoverable" });
    const data = inputs({ costEntries: [cost] });
    const january = { start: "2026-01-01", end: "2026-01-31" };
    const february = { start: "2026-02-01", end: "2026-02-28" };

    expect(getUnitCostSummary("u1", data, january).totalActual).toBe(1200);
    expect(getUnitCostSummary("u1", data, february).totalActual).toBe(0);
    expect(getUnitRecoverySummary("u1", data, january).actualRecoverable).toBe(1200);
    expect(getUnitRecoverySummary("u1", data, february).actualRecoverable).toBe(0);
  });

  it("recognizes an allocated immediate cost at the invoice start, not across the allocation window", () => {
    const cost = entry({ unitId: null, allocationRuleId: "ar1", endDate: "2026-12-31" });
    const allocations = computeAllocations(cost, rule(), [unit("u1"), unit("u2")], [], property()) as CostAllocationResult[];
    const data = inputs({ units: [unit("u1"), unit("u2")], costEntries: [cost], costAllocations: allocations });

    expect(allocations[0].periodEnd).toBe("2026-12-31");
    expect(getUnitCostSummary("u1", data, { start: "2026-01-01", end: "2026-01-31" }).totalActual).toBe(600);
    expect(getUnitCostSummary("u1", data, { start: "2026-02-01", end: "2026-02-28" }).totalActual).toBe(0);
    expect(getPropertyCostSummary("p1", data, { start: "2026-01-01", end: "2026-01-31" }, property()).totalActual).toBe(1200);
    expect(getPropertyCostSummary("p1", data, { start: "2026-02-01", end: "2026-02-28" }, property()).totalActual).toBe(0);
  });

  it("recognizes amortized direct unit costs across the amortization window", () => {
    const cost = entry({ recognitionMode: "amortized", amortizationStartDate: "2026-01-01", amortizationEndDate: "2026-12-31" });
    const january = getUnitCostSummary("u1", inputs({ costEntries: [cost] }), { start: "2026-01-01", end: "2026-01-31" });
    const fullYear = getUnitCostSummary("u1", inputs({ costEntries: [cost] }), { start: "2026-01-01", end: "2026-12-31" });

    expect(january.totalActual).toBe(101.92);
    expect(fullYear.totalActual).toBe(1200);
  });

  it("stores amortization dates on allocation rows and recognizes allocated unit shares over time", () => {
    const cost = entry({ unitId: null, allocationRuleId: "ar1", recognitionMode: "amortized", amortizationStartDate: "2026-01-01", amortizationEndDate: "2026-12-31" });
    const allocationRows = computeAllocations(cost, rule(), [unit("u1"), unit("u2")], [], property()) as CostAllocationResult[];
    const january = getUnitCostSummary("u1", inputs({ units: [unit("u1"), unit("u2")], costEntries: [cost], costAllocations: allocationRows }), { start: "2026-01-01", end: "2026-01-31" });

    expect(allocationRows[0].allocatedAmount).toBe(600);
    expect(allocationRows[0].periodStart).toBe("2026-01-01");
    expect(allocationRows[0].periodEnd).toBe("2026-12-31");
    expect(january.totalActual).toBe(50.96);
  });

  it("applies partial ownership before amortized property recognition", () => {
    const cost = entry({ unitId: null, amount: 1000, recognitionMode: "amortized", amortizationStartDate: "2026-01-01", amortizationEndDate: "2026-12-31" });
    const prop = property({ isPartiallyOwned: true });
    const units = [unit("u1", 20), unit("u2", 25)];
    const fullYear = getPropertyCostSummary("p1", inputs({ units, costEntries: [cost] }), { start: "2026-01-01", end: "2026-12-31" }, prop);

    expect(fullYear.totalActual).toBe(45);
  });

  it("applies recovery split to the recognized amortized portion", () => {
    const cost = entry({ recognitionMode: "amortized", amortizationStartDate: "2026-01-01", amortizationEndDate: "2026-12-31", recoveryType: "tenant-recoverable" });
    const january = getUnitRecoverySummary("u1", inputs({ costEntries: [cost] }), { start: "2026-01-01", end: "2026-01-31" });

    expect(january.actualRecoverable).toBe(101.92);
    expect(january.ownerBorne).toBe(101.92);
  });
});
