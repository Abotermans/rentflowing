import { describe, expect, it } from "vitest";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

const amendment = {
  id: "am-1", leaseId: "lease-1", effectiveDate: "2026-06-15", status: "draft",
} as LeaseAmendment;
const state = {
  properties: [{ id: "property-1", countryCode: "BE" }],
  units: [{ id: "unit-1", propertyId: "property-1", unitType: "apartment" }],
  leases: [{ id: "lease-1", propertyId: "property-1", lifecycleStage: "active",
    startDate: "2026-01-01", endDate: "2026-12-31" }],
  leaseUnitAssignments: [{ leaseId: "lease-1", unitId: "unit-1",
    startDate: "2026-01-01", endDate: null }],
  receivableItems: [], amendments: [amendment],
} as unknown as IntegrityState;

function codes(newValue: unknown): string[] {
  const change = {
    id: "change-1", amendmentId: amendment.id, fieldName: "indexationSettings",
    changeType: "set", oldValue: null, newValue,
  } as LeaseAmendmentChange;
  return validateAmendment(amendment, [change], state, amendment.effectiveDate)
    .blockers.map(blocker => blocker.code);
}

describe("amendment indexation validation", () => {
  it("rejects malformed settings and nonnumeric index values", () => {
    for (const value of [null, [], {}, { indexationEnabled: "yes" },
      { indexationEnabled: true, indexationBaseIndex: "bad" },
      { indexationEnabled: true, indexationCurrentIndex: -1 },
      { indexationEnabled: true, indexationCapPercent: "bad" }]) {
      expect(codes(value)).toContain("AMD_INVALID_INDEXATION");
    }
  });

  it("permits unknown indices before indexation and an explicit zero cap", () => {
    expect(codes({ indexationEnabled: true, indexationBaseIndex: null,
      indexationCurrentIndex: null, indexationCapPercent: 0 }))
      .not.toContain("AMD_INVALID_INDEXATION");
    expect(codes({ indexationEnabled: false })).not.toContain("AMD_INVALID_INDEXATION");
  });
});
