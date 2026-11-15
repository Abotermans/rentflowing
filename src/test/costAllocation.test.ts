import { describe, expect, it } from "vitest";
import { computeAllocations } from "@/lib/costAllocation";
import { getEffectivePropertyCostAmount } from "@/lib/propertyOwnership";
import { splitCostRecovery } from "@/lib/costRecovery";
import type { Lease, LeaseUnitAssignment, Property, Unit } from "@/types";
import type { AllocationRule, CostEntry } from "@/types/costs";

const property = (overrides: Partial<Property> = {}): Property => ({
  id: "p1",
  name: "Test Property",
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

const unit = (id: string, share: number): Unit => ({
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

const entry = (amount = 1000): CostEntry => ({
  id: "ce1",
  categoryId: "cc1",
  propertyId: "p1",
  unitId: null,
  label: "Invoice",
  description: "",
  frequency: "one-off",
  startDate: "2026-01-01",
  endDate: null,
  amount,
  currencyCode: "EUR",
  isTax: false,
  recoveryType: "owner-only",
  allocationRuleId: "ar1",
  vendorName: "",
  invoiceReference: "",
  status: "active",
  notes: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const rule = (overrides: Partial<AllocationRule> = {}): AllocationRule => ({
  id: "ar1",
  propertyId: "p1",
  name: "Rule",
  method: "millieme",
  applyOnlyToOccupiedUnits: false,
  includeUnavailableUnits: true,
  notes: "",
  shareKey: "general",
  milliemeAllocationMode: "normalized",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

describe("computeAllocations partial ownership", () => {
  it("keeps existing normalized millieme behavior for full properties", () => {
    const results = computeAllocations(entry(1000), rule(), [unit("u1", 20), unit("u2", 30)], [], property());

    expect(results.map(r => r.allocatedAmount)).toEqual([400, 600]);
  });

  it("allocates actual invoice shares in absolute millieme mode for partial properties", () => {
    const results = computeAllocations(
      entry(1000),
      rule({ milliemeAllocationMode: "absolute" }),
      [unit("u1", 20), unit("u2", 25)],
      [],
      property({ isPartiallyOwned: true }),
    );

    expect(results.map(r => r.allocatedAmount)).toEqual([20, 25]);
    expect(results.reduce((sum, r) => sum + r.allocatedAmount, 0)).toBe(45);
  });

  it("rounds half-cent owned shares and recovery to the correct cent", () => {
    const partial = property({ isPartiallyOwned: true });
    const units = [unit("u1", 500)];
    expect(getEffectivePropertyCostAmount(entry(0.29), partial, units)).toBe(0.15);
    expect(computeAllocations(entry(0.29), rule({ milliemeAllocationMode: "absolute" }),
      units, [], partial)[0].allocatedAmount).toBe(0.15);
    expect(splitCostRecovery(0.29, "partially-recoverable", 50)).toEqual({
      recoverableAmount: 0.15, ownerBurdenAmount: 0.14,
    });
  });

  it("uses general ownership for the cost base while distributing a normalized special key", () => {
    const units = [
      { ...unit("u1", 20), milliemeShares: { general: 20, elevator: 200 } },
      { ...unit("u2", 25), milliemeShares: { general: 25, elevator: 300 } },
    ];
    const partialProperty = property({ isPartiallyOwned: true, milliemeKeys: ["general", "elevator"] });
    const results = computeAllocations(
      entry(1000),
      rule({ shareKey: "elevator", milliemeAllocationMode: "normalized" }),
      units, [], partialProperty,
    );

    expect(results.map(result => result.allocatedAmount)).toEqual([18, 27]);
    expect(results.reduce((sum, result) => sum + result.allocatedAmount, 0)).toBe(45);
    expect(getEffectivePropertyCostAmount(entry(1000), partialProperty, units)).toBe(45);
  });

  it("scales equal allocations to owned share for partial properties", () => {
    const results = computeAllocations(
      entry(1000),
      rule({ method: "equal", shareKey: null }),
      [unit("u1", 20), unit("u2", 25)],
      [],
      property({ isPartiallyOwned: true }),
    );

    expect(results.map(r => r.allocatedAmount)).toEqual([22.5, 22.5]);
  });

  it("leaves non-partial equal allocations unchanged", () => {
    const results = computeAllocations(
      entry(1000),
      rule({ method: "equal", shareKey: null }),
      [unit("u1", 20), unit("u2", 25)],
      [],
      property({ isPartiallyOwned: false }),
    );

    expect(results.map(r => r.allocatedAmount)).toEqual([500, 500]);
  });

  it("splits a partial cost by its explicit recoverable percentage", () => {
    const results = computeAllocations(
      { ...entry(100), recoveryType: "partially-recoverable", recoverablePercentage: 30 },
      rule({ method: "equal" }),
      [unit("u1", 20), unit("u2", 25)],
      [],
      property(),
    );

    expect(results.map(r => [r.allocatedAmount, r.recoverableAmount, r.ownerBurdenAmount]))
      .toEqual([[50, 15, 35], [50, 15, 35]]);
  });

  it("preserves the recoverable cents across many small unit shares", () => {
    const results = computeAllocations(
      { ...entry(0.05), recoveryType: "partially-recoverable", recoverablePercentage: 30 },
      rule({ method: "equal" }),
      [unit("u1", 1), unit("u2", 1), unit("u3", 1), unit("u4", 1), unit("u5", 1)],
      [],
      property(),
    );

    expect(results.reduce((sum, result) => sum + result.allocatedAmount, 0)).toBeCloseTo(0.05);
    expect(results.reduce((sum, result) => sum + result.recoverableAmount, 0)).toBeCloseTo(0.02);
    expect(results.reduce((sum, result) => sum + result.ownerBurdenAmount, 0)).toBeCloseTo(0.03);
  });
});

describe("occupied-only cost allocation", () => {
  const assignment = (unitId: string, leaseId: string, startDate: string, endDate: string): LeaseUnitAssignment => ({
    id: `${unitId}-${leaseId}`,
    leaseId,
    unitId,
    startDate,
    endDate,
  } as LeaseUnitAssignment);
  const lease = (id: string, lifecycleStage: Lease["lifecycleStage"], startDate: string, endDate: string): Lease => ({
    id,
    lifecycleStage,
    startDate,
    endDate,
    moveOutActualDate: null,
  } as Lease);
  const occupiedOnlyRule = rule({ method: "equal", applyOnlyToOccupiedUnits: true });

  it("rejects an occupied-only rule without dated lease context", () => {
    expect(() => computeAllocations(entry(100), occupiedOnlyRule, [unit("u1", 0)], [], property()))
      .toThrow("Occupied-only cost allocation requires lease assignments and leases.");
  });

  it("uses historical assignments even when the unit is vacant today", () => {
    const results = computeAllocations(
      { ...entry(100), startDate: "2025-06-01" },
      occupiedOnlyRule,
      [unit("u1", 0), { ...unit("u2", 0), currentStatus: "occupied" }],
      [], property(),
      {
        leases: [lease("l1", "ended", "2025-01-01", "2025-12-31")],
        assignments: [assignment("u1", "l1", "2025-01-01", "2025-12-31")],
      },
    );

    expect(results.map(result => [result.unitId, result.allocatedAmount])).toEqual([["u1", 100]]);
  });

  it("allocates to a signed lease whose term has already started", () => {
    const results = computeAllocations(
      { ...entry(100), startDate: "2026-06-01" },
      occupiedOnlyRule,
      [unit("u1", 0)], [], property(),
      {
        leases: [lease("l1", "signed", "2026-01-01", "2026-12-31")],
        assignments: [assignment("u1", "l1", "2026-01-01", "2026-12-31")],
      },
    );

    expect(results.map(result => [result.unitId, result.allocatedAmount])).toEqual([["u1", 100]]);
  });

  it("excludes future, ended-before-cost, and unsigned lease assignments", () => {
    const results = computeAllocations(
      { ...entry(100), startDate: "2026-06-01" },
      occupiedOnlyRule,
      [unit("u1", 0), unit("u2", 0), unit("u3", 0), unit("u4", 0)],
      [], property(),
      {
        leases: [
          lease("future", "active", "2026-07-01", "2026-12-31"),
          lease("past", "ended", "2025-01-01", "2025-12-31"),
          lease("draft", "draft", "2026-01-01", "2026-12-31"),
          lease("current", "active", "2026-01-01", "2026-12-31"),
        ],
        assignments: [
          assignment("u1", "future", "2026-07-01", "2026-12-31"),
          assignment("u2", "past", "2025-01-01", "2025-12-31"),
          assignment("u3", "draft", "2026-01-01", "2026-12-31"),
          assignment("u4", "current", "2026-01-01", "2026-12-31"),
        ],
      },
    );

    expect(results.map(result => result.unitId)).toEqual(["u4"]);
  });

  it("stops allocating after the actual move-out even if the assignment was left open", () => {
    const results = computeAllocations(
      { ...entry(100), startDate: "2026-06-01" },
      occupiedOnlyRule,
      [unit("u1", 0)], [], property(),
      {
        leases: [{ ...lease("l1", "terminated", "2026-01-01", "2026-12-31"), moveOutActualDate: "2026-05-31" }],
        assignments: [assignment("u1", "l1", "2026-01-01", "2026-12-31")],
      },
    );

    expect(results).toEqual([]);
  });
});
