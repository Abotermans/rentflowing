import { describe, expect, it } from "vitest";
import { findOverlappingLeases } from "@/lib/integrity/leaseDateOverlap";
import type { IntegrityState } from "@/lib/integrity/types";

function state(leaseDates: { startDate?: string; endDate?: string; moveOutActualDate?: string }): IntegrityState {
  return {
    leases: [{ id: "other", lifecycleStage: "active", ...leaseDates }],
    leaseUnitAssignments: [{
      leaseId: "other", unitId: "unit", startDate: "2026-01-01", endDate: null,
    }],
  } as unknown as IntegrityState;
}

describe("date-based lease unit availability", () => {
  it("releases an open assignment at the lease end boundary", () => {
    const s = state({ endDate: "2026-06-30" });
    expect(findOverlappingLeases(null, [{
      unitId: "unit", startDate: "2026-06-30", endDate: null,
    }], s)).toEqual([]);
    expect(findOverlappingLeases(null, [{
      unitId: "unit", startDate: "2026-06-29", endDate: "2026-07-01",
    }], s)).toMatchObject([{ otherStart: "2026-01-01", otherEnd: "2026-06-30" }]);
  });

  it("uses actual move-out when it precedes the contractual end", () => {
    const s = state({ endDate: "2026-12-31", moveOutActualDate: "2026-05-15" });
    expect(findOverlappingLeases(null, [{
      unitId: "unit", startDate: "2026-05-15", endDate: null,
    }], s)).toEqual([]);
  });

  it("does not reserve dates before the other lease begins", () => {
    const s = state({ startDate: "2026-03-01", endDate: "2026-12-31" });
    expect(findOverlappingLeases(null, [{
      unitId: "unit", startDate: "2026-01-01", endDate: "2026-03-01",
    }], s)).toEqual([]);
  });
});
