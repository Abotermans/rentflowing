import { describe, expect, it } from "vitest";
import type { LeaseUnitAssignment } from "@/types";
import { applyAssignmentShareChange } from "@/lib/leaseAssignments";

const original: LeaseUnitAssignment = {
  id: "assignment-1", leaseId: "lease-1", unitId: "unit-1",
  startDate: "2026-10-01", endDate: "2027-09-30",
  rentShare: 1200, chargesShare: 150, notes: "",
  createdAt: "2026-09-01", updatedAt: "2026-09-01",
};

describe("amendment assignment share changes", () => {
  it("preserves the old rent before the effective date and the existing end", () => {
    const rows = applyAssignmentShareChange([original], "lease-1", "unit-1", "2026-10-15", "rentShare", 1300, "2026-10-15", () => "assignment-2");
    expect(rows).toMatchObject([
      { id: "assignment-1", startDate: "2026-10-01", endDate: "2026-10-14", rentShare: 1200 },
      { id: "assignment-2", startDate: "2026-10-15", endDate: "2027-09-30", rentShare: 1300 },
    ]);
  });

  it("applies rent and charges changes to the same new segment", () => {
    const rentRows = applyAssignmentShareChange([original], "lease-1", "unit-1", "2026-10-15", "rentShare", 1300, "2026-10-15", () => "assignment-2");
    const rows = applyAssignmentShareChange(rentRows, "lease-1", "unit-1", "2026-10-15", "chargesShare", 180, "2026-10-15", () => "unused");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rentShare: 1200, chargesShare: 150 });
    expect(rows[1]).toMatchObject({ rentShare: 1300, chargesShare: 180 });
  });
});
