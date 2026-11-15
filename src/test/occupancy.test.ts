import { describe, expect, it } from "vitest";
import { classifyUnitOccupancy, getDerivedOccupancy, getOccupancyRate, isUnitOccupiedOn } from "@/lib/occupancy";
import { getActiveLeaseForUnit, isUnitAssignedToActiveLease, leaseOccupiesOn } from "@/lib/leaseAssignments";
import type { Lease, LeaseUnitAssignment } from "@/types";

const lease = {
  id: "lease-1",
  unitId: "unit-1",
  lifecycleStage: "active",
  startDate: "2020-01-01",
  endDate: null,
  moveOutActualDate: null,
} as Lease;

describe("assignment-derived occupancy", () => {
  it("counts leased ancillary units in the rate when they are in the unit total", () => {
    expect(getOccupancyRate(1, 1, 2)).toBe(100);
    expect(getOccupancyRate(1, 0, 2)).toBe(50);
    expect(getOccupancyRate(0, 0, 0)).toBe(0);
  });

  it("does not report an archived unit as vacant", () => {
    expect(classifyUnitOccupancy({ unitType: "parking", currentStatus: "archived" }, false)).toBe("archived");
    expect(classifyUnitOccupancy({ unitType: "parking", currentStatus: "archived" }, true)).toBe("ancillaryLeased");
    expect(classifyUnitOccupancy({ unitType: "apartment", currentStatus: "occupied" }, false)).toBe("vacant");
  });

  it("uses the same lease date window for occupancy lookups", () => {
    const assignment = {
      id: "assignment-current", leaseId: lease.id, unitId: "unit-1",
      startDate: "2026-01-01", endDate: null,
    } as LeaseUnitAssignment;
    const signed = { ...lease, lifecycleStage: "signed" as const, startDate: "2026-01-10", endDate: "2026-01-31" };

    expect(leaseOccupiesOn(signed, "2026-01-09")).toBe(false);
    expect(leaseOccupiesOn(signed, "2026-01-10")).toBe(true);
    expect(getActiveLeaseForUnit("unit-1", [signed], [assignment], "2026-01-10")?.lease.id).toBe(lease.id);
    expect(isUnitAssignedToActiveLease("unit-1", [signed], [assignment], "2026-01-10")).toBe(true);
    expect(getDerivedOccupancy("unit-1", "vacant", [signed], [assignment], undefined, "2026-01-10").derived).toBe("occupied");

    expect(leaseOccupiesOn(signed, "2026-02-01")).toBe(false);
    expect(getActiveLeaseForUnit("unit-1", [signed], [assignment], "2026-02-01")).toBeUndefined();
    expect(isUnitAssignedToActiveLease("unit-1", [signed], [assignment], "2026-02-01")).toBe(false);
    expect(getDerivedOccupancy("unit-1", "occupied", [signed], [assignment], undefined, "2026-02-01").derived).toBe("vacant");

    expect(leaseOccupiesOn({ ...signed, lifecycleStage: "draft" }, "2026-01-10")).toBe(false);
    expect(leaseOccupiesOn({ ...signed, moveOutActualDate: "2026-01-20" }, "2026-01-21")).toBe(false);
  });

  it("counts a started signed lease in occupied-only historical cost allocation", () => {
    const assignment = {
      id: "assignment-cost", leaseId: lease.id, unitId: "unit-1",
      startDate: "2026-01-01", endDate: "2026-06-30",
    } as LeaseUnitAssignment;
    const signed = { ...lease, lifecycleStage: "signed" as const, startDate: "2026-01-01", endDate: "2026-06-30" };

    expect(isUnitOccupiedOn("unit-1", "2026-03-01", [signed], [assignment])).toBe(true);
    expect(isUnitOccupiedOn("unit-1", "2025-12-31", [signed], [assignment])).toBe(false);
    expect(isUnitOccupiedOn("unit-1", "2026-07-01", [signed], [assignment])).toBe(false);
    expect(isUnitOccupiedOn("unit-1", "2026-03-01", [{ ...signed, lifecycleStage: "draft" }], [assignment])).toBe(false);
    expect(isUnitOccupiedOn("unit-1", "2026-03-01", [{ ...signed, lifecycleStage: "ended" }], [assignment])).toBe(true);
  });

  it("does not fall back to the lease's legacy unit when its assignment has ended", () => {
    const oldAssignment = {
      id: "assignment-1",
      leaseId: lease.id,
      unitId: "unit-1",
      startDate: "2020-01-01",
      endDate: "2020-12-31",
    } as LeaseUnitAssignment;

    const occupancy = getDerivedOccupancy("unit-1", "occupied", [lease], [oldAssignment]);

    expect(occupancy.derived).toBe("vacant");
    expect(occupancy.inconsistent).toBe(true);
    expect(occupancy.activeLease).toBeUndefined();
  });

  it("still supports legacy leases with no assignment for the unit", () => {
    const occupancy = getDerivedOccupancy("unit-1", "occupied", [lease], []);

    expect(occupancy.derived).toBe("occupied");
    expect(occupancy.activeLease?.id).toBe(lease.id);
  });

  it("uses the property's calendar date for assignment-derived occupancy", () => {
    const assignment = {
      id: "assignment-2", leaseId: lease.id, unitId: "unit-1",
      startDate: "2026-10-18", endDate: null,
    } as LeaseUnitAssignment;

    expect(getDerivedOccupancy("unit-1", "vacant", [lease], [assignment], undefined, "2026-10-17")
      .derived).toBe("vacant");
    expect(getDerivedOccupancy("unit-1", "vacant", [lease], [assignment], undefined, "2026-10-18")
      .derived).toBe("occupied");
  });

  it("does not show a stale active lease as occupying after its end or actual move-out", () => {
    const assignment = {
      id: "assignment-3", leaseId: lease.id, unitId: "unit-1",
      startDate: "2026-01-01", endDate: "2026-12-31",
    } as LeaseUnitAssignment;
    const ended = { ...lease, startDate: "2026-01-01", endDate: "2026-06-30" };
    const movedOut = { ...lease, startDate: "2026-01-01", endDate: "2026-12-31", moveOutActualDate: "2026-06-20" };

    expect(getDerivedOccupancy("unit-1", "occupied", [ended], [assignment], undefined, "2026-07-01").derived).toBe("vacant");
    expect(getDerivedOccupancy("unit-1", "occupied", [movedOut], [assignment], undefined, "2026-06-21").derived).toBe("vacant");
    expect(getDerivedOccupancy("unit-1", "occupied", [movedOut], [], undefined, "2026-06-21").derived).toBe("vacant");
    expect(getDerivedOccupancy("unit-1", "occupied", [ended], [assignment], undefined, "2026-06-30").derived).toBe("occupied");
  });

  it("does not show occupancy before the lease starts even if its assignment starts earlier", () => {
    const assignment = {
      id: "assignment-4", leaseId: lease.id, unitId: "unit-1",
      startDate: "2026-01-01", endDate: null,
    } as LeaseUnitAssignment;
    const futureLease = { ...lease, startDate: "2026-07-01" };

    expect(getDerivedOccupancy("unit-1", "occupied", [futureLease], [assignment], undefined, "2026-06-30").derived).toBe("vacant");
    expect(getDerivedOccupancy("unit-1", "occupied", [futureLease], [assignment], undefined, "2026-07-01").derived).toBe("occupied");
  });
});
