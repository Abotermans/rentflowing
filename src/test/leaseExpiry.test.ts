import { describe, expect, it } from "vitest";
import { isLeaseEndingWithinDays } from "@/lib/leaseExpiry";

describe("lease expiry windows", () => {
  const today = "2026-03-28";

  it("includes today and the calendar boundary, not past or later dates", () => {
    expect(isLeaseEndingWithinDays({ lifecycleStage: "active", endDate: today }, today, 2)).toBe(true);
    expect(isLeaseEndingWithinDays({ lifecycleStage: "active", endDate: "2026-03-30" }, today, 2)).toBe(true);
    expect(isLeaseEndingWithinDays({ lifecycleStage: "active", endDate: "2026-03-27" }, today, 2)).toBe(false);
    expect(isLeaseEndingWithinDays({ lifecycleStage: "active", endDate: "2026-03-31" }, today, 2)).toBe(false);
  });

  it("excludes open-ended and non-active leases", () => {
    expect(isLeaseEndingWithinDays({ lifecycleStage: "active", endDate: "" }, today, 90)).toBe(false);
    expect(isLeaseEndingWithinDays({ lifecycleStage: "ended", endDate: "2026-03-29" }, today, 90)).toBe(false);
  });
});
