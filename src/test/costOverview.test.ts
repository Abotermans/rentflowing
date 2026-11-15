import { describe, expect, it } from "vitest";
import { buildCostOverview } from "@/lib/costOverview";
import type { Property, Unit } from "@/types";
import type { CostAllocationResult, CostEntry } from "@/types/costs";

const property = { id: "p1", currencyCode: "GBP", locale: "en-GB", milliemeBase: 1000, isPartiallyOwned: true } as Property;
const unit = (id: string, share: number): Unit => ({
  id, propertyId: "p1", unitCode: id, unitLabel: id, unitType: "apartment",
  floor: null, surfaceArea: null, bedrooms: 0, bathrooms: 0, furnished: false,
  currentStatus: "vacant", baseRent: null, rentTiers: [], baseCharges: null,
  availableFrom: null, notes: "", milliemeShares: { general: share },
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
});
const units = [unit("u1", 20), unit("u2", 25)];
const entry = (id: string, amount: number, currencyCode: string, overrides: Partial<CostEntry> = {}) => ({
  id, propertyId: "p1", unitId: null, amount, currencyCode, status: "active",
  isTax: false, recoveryType: "owner-only", ...overrides,
}) as CostEntry;
const allocation = (costEntryId: string, unitId: string, allocatedAmount: number, recoverableAmount = 0) => ({
  id: `${costEntryId}-${unitId}`, costEntryId, propertyId: "p1", unitId,
  allocatedAmount, recoverableAmount, ownerBurdenAmount: allocatedAmount - recoverableAmount,
}) as CostAllocationResult;

describe("cost overview", () => {
  it("keeps mixed currencies separate and excludes inactive costs and their stale allocations", () => {
    const overview = buildCostOverview([
      entry("eur-direct", 200, "EUR", { unitId: "u1", recoveryType: "tenant-recoverable" }),
      entry("gbp-direct", 100, "GBP", { unitId: "u1", isTax: true }),
      entry("cancelled", 1000, "GBP", { status: "cancelled" }),
    ], [allocation("cancelled", "u2", 45)], [property], units);

    expect(overview.properties).toEqual([{
      propertyId: "p1",
      charges: [{ currencyCode: "EUR", locale: "en-GB", amount: 200 }],
      taxes: [{ currencyCode: "GBP", locale: "en-GB", amount: 100 }],
      ownerBorne: [{ currencyCode: "GBP", locale: "en-GB", amount: 100 }],
      recoverable: [{ currencyCode: "EUR", locale: "en-GB", amount: 200 }],
      total: [
        { currencyCode: "EUR", locale: "en-GB", amount: 200 },
        { currencyCode: "GBP", locale: "en-GB", amount: 100 },
      ],
    }]);
    expect(overview.units).toEqual([{
      unitId: "u1", propertyId: "p1",
      directCosts: [
        { currencyCode: "EUR", locale: "en-GB", amount: 200 },
        { currencyCode: "GBP", locale: "en-GB", amount: 100 },
      ],
      allocatedCosts: [],
      ownerBorne: [{ currencyCode: "GBP", locale: "en-GB", amount: 100 }],
      recoverable: [{ currencyCode: "EUR", locale: "en-GB", amount: 200 }],
      total: [
        { currencyCode: "EUR", locale: "en-GB", amount: 200 },
        { currencyCode: "GBP", locale: "en-GB", amount: 100 },
      ],
    }]);
  });

  it("uses persisted unit allocations for partial-property totals and recovery", () => {
    const overview = buildCostOverview(
      [entry("shared", 1000, "EUR", { recoveryType: "partially-recoverable", recoverablePercentage: 40 })],
      [allocation("shared", "u1", 18, 7.2), allocation("shared", "u2", 27, 10.8)],
      [property], units,
    );

    expect(overview.properties[0].total[0].amount).toBe(45);
    expect(overview.properties[0].ownerBorne[0].amount).toBe(27);
    expect(overview.properties[0].recoverable[0].amount).toBe(18);
    expect(overview.units.map(unit => unit.allocatedCosts[0].amount)).toEqual([18, 27]);
  });

  it("uses the managed share when a partial-property cost has no allocation rule", () => {
    const overview = buildCostOverview([entry("shared", 1000, "EUR")], [], [property], units);

    expect(overview.properties[0].total[0].amount).toBe(45);
    expect(overview.properties[0].ownerBorne[0].amount).toBe(45);
    expect(overview.units).toEqual([]);
  });

  it("retains the unallocated owned share at property level", () => {
    const managedUnits = [unit("u1", 45), unit("u2", 55)];
    const overview = buildCostOverview(
      [entry("shared", 1000, "EUR", { recoveryType: "tenant-recoverable" })],
      [allocation("shared", "u1", 45, 45)], [property], managedUnits,
    );

    expect(overview.properties[0].total[0].amount).toBe(100);
    expect(overview.properties[0].recoverable[0].amount).toBe(45);
    expect(overview.properties[0].ownerBorne[0].amount).toBe(55);
    expect(overview.units[0].total[0].amount).toBe(45);
    expect(overview.units).toHaveLength(1);
  });

  it("does not charge an informational remainder to the owner", () => {
    const row = { ...allocation("info", "u1", 20), ownerBurdenAmount: 0,
      recoveryType: "informational" } as CostAllocationResult;
    const overview = buildCostOverview(
      [entry("info", 1000, "EUR", { recoveryType: "informational" })],
      [row], [property], units,
    );

    expect(overview.properties[0].total[0].amount).toBe(45);
    expect(overview.properties[0].ownerBorne.reduce((sum, group) => sum + group.amount, 0)).toBe(0);
    expect(overview.units[0].ownerBorne.reduce((sum, group) => sum + group.amount, 0)).toBe(0);
  });

  it("flags an excessive informational allocation without inventing an owner charge", () => {
    const row = { ...allocation("info", "u1", 1000), ownerBurdenAmount: 0,
      recoveryType: "informational" } as CostAllocationResult;
    const overview = buildCostOverview(
      [entry("info", 1000, "EUR", { recoveryType: "informational" })],
      [row], [property], units,
    );

    expect(overview.allocationExcesses[0].excessAmount).toBe(955);
    expect(overview.properties[0].ownerBorne.reduce((sum, group) => sum + group.amount, 0)).toBe(0);
  });

  it("flags stale allocations and keeps property totals within its managed share", () => {
    const overview = buildCostOverview(
      [entry("shared", 1000, "EUR", { recoveryType: "partially-recoverable", recoverablePercentage: 40 })],
      [allocation("shared", "u1", 1000, 400)], [property], [unit("u1", 100)],
    );

    expect(overview.allocationExcesses).toEqual([{
      costEntryId: "shared", propertyId: "p1", excessAmount: 900, currencyCode: "EUR",
    }]);
    expect(overview.properties[0].total[0].amount).toBe(100);
    expect(overview.properties[0].ownerBorne[0].amount).toBe(60);
    expect(overview.properties[0].recoverable[0].amount).toBe(40);
    expect(overview.units[0].total[0].amount).toBe(1000);
  });

  it("includes the owner and recoverable portions of a partially recoverable direct unit cost", () => {
    const overview = buildCostOverview([
      entry("direct", 100, "EUR", {
        unitId: "u1", recoveryType: "partially-recoverable", recoverablePercentage: 40,
      }),
    ], [], [property], units);

    expect(overview.properties[0].ownerBorne[0].amount).toBe(60);
    expect(overview.properties[0].recoverable[0].amount).toBe(40);
    expect(overview.units[0].ownerBorne[0].amount).toBe(60);
    expect(overview.units[0].recoverable[0].amount).toBe(40);
  });
});
