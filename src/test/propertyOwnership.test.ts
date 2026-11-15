import { describe, expect, it } from "vitest";
import {
  getPropertyMilliemeBaseViolations,
  getUnitMilliemeCapacityViolations,
  displayMilliemeMaxPerUnit,
  MILLIEME_BASE_OPTIONS,
  multiplyMilliemeShare,
  parseMilliemeShareInput,
} from "@/lib/propertyOwnership";
import type { Property, Unit } from "@/types";

const property = (base: number): Pick<Property, "milliemeBase" | "milliemeKeys"> => ({
  milliemeBase: base,
  milliemeKeys: ["general"],
});

const unit = (id: string, share: number): Pick<Unit, "id" | "propertyId" | "milliemeShares"> => ({
  id,
  propertyId: "p1",
  milliemeShares: { general: share },
});

describe("property millieme ownership helpers", () => {
  it("keeps comma-decimal shares while rejecting negative and non-numeric input", () => {
    expect(parseMilliemeShareInput("12,5")).toEqual({ valid: true, value: 12.5 });
    expect(parseMilliemeShareInput("")).toEqual({ valid: true, value: null });
    expect(parseMilliemeShareInput("-1")).toEqual({ valid: false });
    expect(parseMilliemeShareInput("not a number")).toEqual({ valid: false });
    expect(parseMilliemeShareInput("1e309")).toEqual({ valid: false });
    expect(parseMilliemeShareInput("0x10")).toEqual({ valid: false });
  });

  it("supports the configured millieme base options without over-allocation", () => {
    for (const base of MILLIEME_BASE_OPTIONS) {
      const violations = getPropertyMilliemeBaseViolations(
        property(base),
        [unit("u1", base * 0.4), unit("u2", base * 0.6)],
        "p1",
      );

      expect(violations).toEqual([]);
    }
  });

  it("reports a property-level violation when existing unit shares exceed a reduced base", () => {
    const violations = getPropertyMilliemeBaseViolations(
      property(1000),
      [unit("u1", 700), unit("u2", 400)],
      "p1",
    );

    expect(violations).toEqual([
      { key: "general", base: 1000, totalShares: 1100, excess: 100 },
    ]);
  });

  it("uses the selected property base when checking a unit's remaining capacity", () => {
    const violations = getUnitMilliemeCapacityViolations(
      { propertyId: "p1", milliemeShares: { general: 2000 } },
      property(10000),
      [unit("u1", 8000)],
      "u2",
    );

    expect(violations).toEqual([]);
  });

  it("rejects unit shares above the remaining capacity for the selected base", () => {
    const violations = getUnitMilliemeCapacityViolations(
      { propertyId: "p1", milliemeShares: { general: 2500 } },
      property(10000),
      [unit("u1", 8000)],
      "u2",
    );

    expect(violations[0]).toMatchObject({
      key: "general",
      base: 10000,
      otherShares: 8000,
      maxForUnit: 2000,
    });
  });

  it("checks the combined share of all bulk-created units", () => {
    const sharesPerUnit = 30;
    const count = 4;
    const violations = getUnitMilliemeCapacityViolations(
      { propertyId: "p1", milliemeShares: { general: sharesPerUnit * count } },
      property(1000),
      [unit("u1", 900)],
    );
    expect(violations[0]?.maxForUnit).toBe(100);
    expect(violations[0]?.maxForUnit / count).toBe(25);
  });

  it("preserves fractional millieme capacity instead of rounding it like money", () => {
    expect(getUnitMilliemeCapacityViolations(
      { propertyId: "p1", milliemeShares: { general: 0.001 } },
      property(1000), [unit("u1", 999.999)], "u2",
    )).toEqual([]);

    expect(getUnitMilliemeCapacityViolations(
      { propertyId: "p1", milliemeShares: { general: 0.01 } },
      property(1000), [unit("u1", 999.994)], "u2",
    )[0]).toMatchObject({ otherShares: 999.994, maxForUnit: 0.006 });
  });

  it("reports sub-cent millieme excess when reducing a property base", () => {
    expect(getPropertyMilliemeBaseViolations(property(1000), [
      unit("u1", 999.994), unit("u2", 0.01),
    ], "p1")).toEqual([{ key: "general", base: 1000, totalShares: 1000.004, excess: 0.004 }]);
  });

  it("validates bulk millieme totals without floating-point false positives", () => {
    const total = multiplyMilliemeShare(0.1, 3);
    expect(total).toBe(0.3);
    expect(getUnitMilliemeCapacityViolations(
      { propertyId: "p1", milliemeShares: { general: total } },
      property(1000), [unit("u1", 999.7)],
    )).toEqual([]);
    expect(displayMilliemeMaxPerUnit(0.001, 1)).toBe(0.001);
  });
});
