import { describe, expect, it } from "vitest";
import { validateLeaseUnits, type DraftAssignment } from "@/lib/integrity/leaseUnitAssignmentIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";
import type { Unit } from "@/types";

const state = {
  units: [
    { id: "parking", propertyId: "property", unitCode: "P-1", unitType: "parking", currentStatus: "vacant" } as Unit,
    { id: "apartment", propertyId: "property", unitCode: "A-1", unitType: "apartment", currentStatus: "vacant" } as Unit,
    { id: "apartment-2", propertyId: "property", unitCode: "A-2", unitType: "apartment", currentStatus: "vacant" } as Unit,
  ],
  leases: [],
  leaseUnitAssignments: [],
} as unknown as IntegrityState;

function assignment(unitId: string, startDate: string, endDate = "2026-12-31"): DraftAssignment {
  return { unitId, startDate, endDate, rentShare: 100, chargesShare: 0 };
}

describe("lease unit assignment coverage", () => {
  it("blocks lease totals that disagree with the unit rent or charges amounts", () => {
    const result = validateLeaseUnits(null, "property", [
      { ...assignment("apartment", "2026-01-01"), rentShare: 100, chargesShare: 20 },
      { ...assignment("parking", "2026-01-01"), rentShare: 50, chargesShare: 10 },
    ], { monthlyRent: 150, monthlyCharges: 50 }, state);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LUA_CHARGES_TOTAL_MISMATCH", message: expect.stringContaining("30.00") }),
    ]));
    expect(result.blockers.some(blocker => blocker.code === "LUA_RENT_TOTAL_MISMATCH")).toBe(false);

    const rentMismatch = validateLeaseUnits(null, "property", [
      { ...assignment("apartment", "2026-01-01"), rentShare: 100, chargesShare: 20 },
      { ...assignment("parking", "2026-01-01"), rentShare: 50, chargesShare: 10 },
    ], { monthlyRent: 175, monthlyCharges: 30 }, state);
    expect(rentMismatch.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LUA_RENT_TOTAL_MISMATCH", message: expect.stringContaining("150.00") }),
    ]));
    expect(rentMismatch.blockers.some(blocker => blocker.code === "LUA_CHARGES_TOTAL_MISMATCH")).toBe(false);
  });

  it("blocks a stale unit selection even when another main unit remains valid", () => {
    const result = validateLeaseUnits(null, "property", [
      assignment("apartment", "2026-01-01"),
      assignment("removed-unit", "2026-01-01"),
    ], { monthlyRent: 200, monthlyCharges: 0 }, state);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LUA_UNIT_MISSING", message: expect.stringContaining("removed-unit") }),
    ]));
  });

  it("compares money totals at cent precision", () => {
    const result = validateLeaseUnits(null, "property", [
      { ...assignment("apartment", "2026-01-01"), rentShare: 0.1, chargesShare: 0.1 },
      { ...assignment("parking", "2026-01-01"), rentShare: 0.2, chargesShare: 0.2 },
    ], { monthlyRent: 0.1 + 0.2, monthlyCharges: 0.3 }, state);
    expect(result.blockers).toEqual([]);
  });

  it("rejects non-finite pricing while allowing zero rent and charges", () => {
    for (const amount of [NaN, Infinity, -Infinity, -1]) {
      const result = validateLeaseUnits(null, "property", [
        { ...assignment("apartment", "2026-01-01"), rentShare: amount },
      ], { monthlyRent: 0, monthlyCharges: 0 }, state);
      expect(result.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "LUA_SHARE_INVALID" }),
      ]));
    }
    const zero = validateLeaseUnits(null, "property", [
      { ...assignment("apartment", "2026-01-01"), rentShare: 0, chargesShare: 0 },
    ], { monthlyRent: 0, monthlyCharges: 0 }, state);
    expect(zero.blockers).toEqual([]);
  });

  it("blocks an ancillary-only first month before the main unit begins", () => {
    const result = validateLeaseUnits(null, "property", [
      assignment("parking", "2026-01-01"),
      assignment("apartment", "2026-02-01"),
    ], { monthlyRent: 200, monthlyCharges: 0 }, state);

    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LUA_MAIN_COVERAGE_GAP" }),
    ]));
  });

  it("allows an ancillary to join after the main unit", () => {
    const result = validateLeaseUnits(null, "property", [
      assignment("apartment", "2026-01-01"),
      { ...assignment("parking", "2026-02-01"), rentShare: 0 },
    ], { monthlyRent: 100, monthlyCharges: 0 }, state);

    expect(result.blockers).toEqual([]);
  });

  it("requires an amendment for a priced unit that joins or leaves later", () => {
    const joining = validateLeaseUnits(null, "property", [
      assignment("apartment", "2026-01-01"),
      assignment("parking", "2026-02-01"),
    ], { monthlyRent: 200, monthlyCharges: 0 }, state);
    expect(joining.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LUA_BILLING_WINDOW_MISMATCH", message: expect.stringContaining("2026-01-01") }),
    ]));

    const leaving = validateLeaseUnits(null, "property", [
      assignment("apartment", "2026-01-01", "2026-06-30"),
      assignment("parking", "2026-01-01", "2026-12-31"),
    ], { monthlyRent: 200, monthlyCharges: 0 }, state);
    expect(leaving.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LUA_BILLING_WINDOW_MISMATCH", message: expect.stringContaining("2026-07-01") }),
    ]));
  });

  it("requires an amendment for a priced unit handoff within one lease", () => {
    const result = validateLeaseUnits(null, "property", [
      assignment("apartment", "2026-01-01", "2026-06-30"),
      assignment("apartment-2", "2026-06-30", "2026-12-31"),
    ], { monthlyRent: 100, monthlyCharges: 0 }, state);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LUA_RENT_TOTAL_MISMATCH" }),
    ]));
  });

  it("blocks a gap after the only main unit ends while parking continues", () => {
    const result = validateLeaseUnits(null, "property", [
      assignment("apartment", "2026-01-01", "2026-06-30"),
      assignment("parking", "2026-01-01"),
    ], { monthlyRent: 200, monthlyCharges: 0 }, state);

    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LUA_MAIN_COVERAGE_GAP", message: expect.stringContaining("2026-07-01") }),
    ]));
  });

  it("accepts main assignments that meet on consecutive days", () => {
    const result = validateLeaseUnits(null, "property", [
      assignment("apartment", "2026-01-01", "2026-06-30"),
      assignment("apartment-2", "2026-07-01"),
    ], { monthlyRent: 200, monthlyCharges: 0 }, state);

    expect(result.blockers.some(blocker => blocker.code === "LUA_MAIN_COVERAGE_GAP")).toBe(false);
  });
});
