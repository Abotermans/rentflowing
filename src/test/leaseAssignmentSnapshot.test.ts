import { describe, expect, it } from "vitest";
import { getActiveLeaseForUnit, getLeaseAssignedUnits } from "@/lib/leaseAssignments";
import type { Lease, LeaseUnitAssignment, Unit } from "@/types";

describe("lease assignment snapshots", () => {
  const units = [
    { id: "unit-old", unitType: "apartment" },
    { id: "unit-new", unitType: "apartment" },
  ] as Unit[];
  const assignments = [
    { id: "old", leaseId: "lease-1", unitId: "unit-old", startDate: "2026-01-01", endDate: "2026-10-31" },
    { id: "new", leaseId: "lease-1", unitId: "unit-new", startDate: "2026-11-01", endDate: null },
  ] as LeaseUnitAssignment[];
  const leases = [{
    id: "lease-1", lifecycleStage: "signed", startDate: "2026-01-01", endDate: null,
    moveOutActualDate: null,
  }] as Lease[];

  it("uses the requested business date for active-only rows", () => {
    expect(getLeaseAssignedUnits("lease-1", assignments, units, { activeOnly: true, onDate: "2026-10-31" })
      .map(row => row.unit.id)).toEqual(["unit-old"]);
    expect(getLeaseAssignedUnits("lease-1", assignments, units, { activeOnly: true, onDate: "2026-11-01" })
      .map(row => row.unit.id)).toEqual(["unit-new"]);
  });

  it("finds occupancy only inside the assignment window", () => {
    expect(getActiveLeaseForUnit("unit-new", leases, assignments, "2026-10-31")).toBeUndefined();
    expect(getActiveLeaseForUnit("unit-new", leases, assignments, "2026-11-01")?.lease.id).toBe("lease-1");
  });
});
