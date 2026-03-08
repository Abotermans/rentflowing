import { describe, it, expect } from "vitest";
import { getDerivedOccupancy, getUnitOccupancyWarnings } from "./occupancy";
import type { Lease } from "@/types";
import { DEFAULT_MOVE_IN_CHECKLIST, DEFAULT_MOVE_OUT_CHECKLIST } from "@/types";

function makeLease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: "lease-1",
    leaseReference: "L-001",
    propertyId: "prop-1",
    unitId: "unit-1",
    primaryTenantId: "tenant-1",
    coTenantIds: [],
    leaseStatus: "active",
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    monthlyRent: 1000,
    monthlyCharges: 100,
    dueDayOfMonth: 1,
    depositOrGuaranteeAmount: null,
    noticePeriodText: "3 months",
    signedDate: null,
    notes: "",
    noticeGiven: false,
    noticeDate: null,
    intendedMoveOutDate: null,
    terminationReason: null,
    moveInScheduledDate: null,
    moveInActualDate: null,
    moveInMeterReading: null,
    moveInChecklist: { ...DEFAULT_MOVE_IN_CHECKLIST },
    moveOutScheduledDate: null,
    moveOutActualDate: null,
    moveOutMeterReading: null,
    moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST },
    moveOutNotes: "",
    keyHandoverCount: 0,
    keyReturnCount: 0,
    returnStatus: null,
    returnNotes: "",
    hasAdvancePayment: false,
    advancePaymentAmount: null,
    advancePaymentDate: null,
    advanceAllocationMethod: null,
    advanceAppliedTo: null,
    advanceAllocationStartDate: null,
    advanceAllocationDurationMonths: null,
    fixedMonthlyReductionAmount: null,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    ...overrides,
  };
}

describe("getDerivedOccupancy", () => {
  it("returns vacant when no active lease exists", () => {
    const result = getDerivedOccupancy("unit-1", "vacant", []);
    expect(result.derived).toBe("vacant");
    expect(result.inconsistent).toBe(false);
  });

  it("returns occupied with active lease and move-in completed", () => {
    const lease = makeLease({ moveInActualDate: "2024-01-15" });
    const result = getDerivedOccupancy("unit-1", "occupied", [lease]);
    expect(result.derived).toBe("occupied");
    expect(result.inconsistent).toBe(false);
    expect(result.activeLease).toBe(lease);
  });

  it("returns occupied with active lease and no move-in tracking", () => {
    const lease = makeLease();
    const result = getDerivedOccupancy("unit-1", "occupied", [lease]);
    expect(result.derived).toBe("occupied");
    expect(result.inconsistent).toBe(false);
  });

  it("returns under-notice when noticeGiven is true", () => {
    const lease = makeLease({
      noticeGiven: true,
      intendedMoveOutDate: "2024-06-30",
    });
    const result = getDerivedOccupancy("unit-1", "occupied", [lease]);
    expect(result.derived).toBe("under-notice");
    expect(result.availableFromDate).toBe("2024-06-30");
    expect(result.inconsistent).toBe(false);
  });

  it("returns move-in-pending when move-in scheduled but not completed", () => {
    const lease = makeLease({
      moveInScheduledDate: "2024-02-01",
      moveInActualDate: null,
    });
    const result = getDerivedOccupancy("unit-1", "occupied", [lease]);
    expect(result.derived).toBe("move-in-pending");
  });

  it("returns move-out-scheduled when move-out scheduled without notice", () => {
    const lease = makeLease({
      moveOutScheduledDate: "2024-12-31",
      moveOutActualDate: null,
      moveInActualDate: "2024-01-15",
    });
    const result = getDerivedOccupancy("unit-1", "occupied", [lease]);
    expect(result.derived).toBe("move-out-scheduled");
    expect(result.availableFromDate).toBe("2024-12-31");
  });

  // Inconsistency: manual=occupied but no active lease
  it("flags inconsistency when manual is occupied but no active lease", () => {
    const result = getDerivedOccupancy("unit-1", "occupied", []);
    expect(result.derived).toBe("vacant");
    expect(result.inconsistent).toBe(true);
    expect(result.inconsistencyMessage).toContain("no active lease");
  });

  // Inconsistency: manual=vacant but active lease exists
  it("flags inconsistency when manual is vacant but active lease exists", () => {
    const lease = makeLease();
    const result = getDerivedOccupancy("unit-1", "vacant", [lease]);
    expect(result.derived).toBe("occupied");
    expect(result.inconsistent).toBe(true);
    expect(result.inconsistencyMessage).toContain("vacant");
  });

  // Inconsistency: manual=reserved but lease is occupied
  it("flags inconsistency when manual is reserved but active occupied lease", () => {
    const lease = makeLease({ moveInActualDate: "2024-01-15" });
    const result = getDerivedOccupancy("unit-1", "reserved", [lease]);
    expect(result.derived).toBe("occupied");
    expect(result.inconsistent).toBe(true);
    expect(result.inconsistencyMessage).toContain("reserved");
  });

  // Under-notice unit should still be occupied (not vacant)
  it("under-notice lease keeps unit occupied, not vacant", () => {
    const lease = makeLease({
      noticeGiven: true,
      intendedMoveOutDate: "2024-06-30",
    });
    const result = getDerivedOccupancy("unit-1", "occupied", [lease]);
    expect(result.derived).toBe("under-notice");
    expect(result.derived).not.toBe("vacant");
  });

  // Only considers active leases, ignores ended/terminated
  it("ignores non-active leases", () => {
    const endedLease = makeLease({ leaseStatus: "ended" });
    const result = getDerivedOccupancy("unit-1", "vacant", [endedLease]);
    expect(result.derived).toBe("vacant");
    expect(result.inconsistent).toBe(false);
  });

  // Only matches the correct unitId
  it("ignores leases for other units", () => {
    const lease = makeLease({ unitId: "unit-2" });
    const result = getDerivedOccupancy("unit-1", "vacant", [lease]);
    expect(result.derived).toBe("vacant");
  });

  // Notice takes precedence over move-out-scheduled
  it("notice takes precedence over move-out-scheduled", () => {
    const lease = makeLease({
      noticeGiven: true,
      intendedMoveOutDate: "2024-06-30",
      moveOutScheduledDate: "2024-07-01",
    });
    const result = getDerivedOccupancy("unit-1", "occupied", [lease]);
    expect(result.derived).toBe("under-notice");
    expect(result.availableFromDate).toBe("2024-06-30");
  });
});

describe("getUnitOccupancyWarnings", () => {
  it("returns empty for consistent vacant unit", () => {
    expect(getUnitOccupancyWarnings("unit-1", "vacant", [])).toEqual([]);
  });

  it("returns inconsistency warning for occupied without lease", () => {
    const warnings = getUnitOccupancyWarnings("unit-1", "occupied", []);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("no active lease");
  });

  it("returns under-notice warning with availability date", () => {
    const lease = makeLease({
      noticeGiven: true,
      intendedMoveOutDate: "2024-06-30",
    });
    const warnings = getUnitOccupancyWarnings("unit-1", "occupied", [lease]);
    expect(warnings.some((w) => w.includes("under notice"))).toBe(true);
    expect(warnings.some((w) => w.includes("2024-06-30"))).toBe(true);
  });

  it("returns move-in-pending warning", () => {
    const lease = makeLease({
      moveInScheduledDate: "2024-02-01",
      moveInActualDate: null,
    });
    const warnings = getUnitOccupancyWarnings("unit-1", "occupied", [lease]);
    expect(warnings.some((w) => w.includes("Move-in is scheduled"))).toBe(true);
  });
});
