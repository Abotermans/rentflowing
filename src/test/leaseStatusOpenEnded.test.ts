import { describe, expect, it } from "vitest";
import { advanceLeaseLifecycle, getLeaseStatus, type Lease } from "@/types";

const openLease = {
  startDate: "2020-01-01",
  endDate: "",
  noticeGiven: false,
} as Lease;

describe("open-ended lease status", () => {
  it("does not treat a blank end date as an overdue end", () => {
    expect(getLeaseStatus({ ...openLease, lifecycleStage: "active" })).toBe("active");
    expect(getLeaseStatus({ ...openLease, lifecycleStage: "signed" })).toBe("active");
  });

  it("keeps an explicitly ended open-ended lease ended", () => {
    expect(getLeaseStatus({ ...openLease, lifecycleStage: "ended" })).toBe("ended");
  });
});

describe("lease notice at the end boundary", () => {
  const underNotice = {
    ...openLease, lifecycleStage: "active" as const, noticeGiven: true,
    endDate: "2026-06-30",
  } as Lease;

  it("shows notice through the final day, then an overdue end", () => {
    expect(getLeaseStatus(underNotice, "2026-06-30")).toBe("under-notice");
    expect(getLeaseStatus(underNotice, "2026-07-01")).toBe("overdue-end");
  });
});

describe("signed lease lifecycle catch-up", () => {
  const signed = {
    startDate: "2026-03-01", endDate: "2026-04-30", lifecycleStage: "signed",
    endReason: null,
  } as Lease;

  it("ends a signed lease whose entire term has passed in one load", () => {
    const advanced = advanceLeaseLifecycle(signed, "2026-10-17");
    expect(advanced.lifecycleStage).toBe("ended");
    expect(advanced.endReason).toBe("natural-expiry");
    expect(getLeaseStatus(advanced)).toBe("ended");
  });

  it("keeps a signed lease active through its final day", () => {
    expect(advanceLeaseLifecycle(signed, "2026-04-30").lifecycleStage).toBe("active");
  });

  it("does not reopen a lease explicitly ended before its contractual end", () => {
    const ended = {
      ...signed,
      lifecycleStage: "ended" as const,
      endDate: "2027-02-28",
      moveOutActualDate: "2026-06-11",
      endReason: "notice-completed",
    } as Lease;
    expect(advanceLeaseLifecycle(ended, "2026-11-07")).toBe(ended);
    expect(getLeaseStatus(ended, "2026-11-07")).toBe("ended");
  });

  it("preserves an explicit ended stage even without a move-out date", () => {
    const ended = {
      ...signed,
      lifecycleStage: "ended" as const,
      endDate: "2027-12-31",
      moveOutActualDate: null,
      endReason: "natural-expiry",
    } as Lease;
    expect(advanceLeaseLifecycle(ended, "2026-11-07")).toBe(ended);
    expect(getLeaseStatus(ended, "2026-11-07")).toBe("ended");
  });
});
