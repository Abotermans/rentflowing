import { describe, expect, it } from "vitest";
import { isRecentScheduledJobSuccess, MAX_SCHEDULED_JOB_AGE_MS } from "@/lib/serverJobHealth";

describe("scheduled job health", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");

  it("requires a recent and valid successful run", () => {
    expect(isRecentScheduledJobSuccess(new Date(now - MAX_SCHEDULED_JOB_AGE_MS).toISOString(), now)).toBe(true);
    expect(isRecentScheduledJobSuccess(new Date(now - MAX_SCHEDULED_JOB_AGE_MS - 1).toISOString(), now)).toBe(false);
    expect(isRecentScheduledJobSuccess(new Date(now + 5 * 60 * 1000 + 1).toISOString(), now)).toBe(false);
    expect(isRecentScheduledJobSuccess(null, now)).toBe(false);
    expect(isRecentScheduledJobSuccess("not-a-date", now)).toBe(false);
  });
});
