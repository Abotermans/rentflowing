import { describe, expect, it } from "vitest";
import { canActivateAmendment } from "@/lib/integrity/amendmentIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";
import type { Lease, LeaseUnitAssignment, Unit } from "@/types";
import type { LeaseAmendment } from "@/types/amendments";

describe("amendment activation business date", () => {
  it("uses the supplied business date when deciding whether the effective date is past", () => {
    const lease = {
      id: "lease-1", propertyId: "property-1", lifecycleStage: "signed",
      startDate: "2026-01-01", endDate: "2026-12-31",
    } as Lease;
    const amendment = {
      id: "amendment-1", leaseId: lease.id, status: "scheduled",
      effectiveDate: "2026-02-01", amendmentNumber: 1,
    } as LeaseAmendment;
    const assignment = {
      id: "assignment-1", leaseId: lease.id, unitId: "unit-1",
      startDate: "2026-01-01", endDate: "2026-12-31",
    } as LeaseUnitAssignment;
    const unit = { id: "unit-1", propertyId: "property-1", unitType: "apartment" } as Unit;
    const state = {
      leases: [lease], amendments: [amendment], amendmentChanges: [],
      leaseUnitAssignments: [assignment], units: [unit], receivableItems: [],
    } as unknown as IntegrityState;

    expect(canActivateAmendment(amendment.id, state, "2026-02-01").warnings
      .some(warning => warning.code === "AMD_EFFECTIVE_IN_PAST")).toBe(false);
    expect(canActivateAmendment(amendment.id, state, "2026-02-02").warnings
      .some(warning => warning.code === "AMD_EFFECTIVE_IN_PAST")).toBe(true);
  });
});
