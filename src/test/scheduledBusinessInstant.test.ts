import { describe, expect, it } from "vitest";
import { parseScheduledBusinessInstant } from "@/lib/scheduledBusinessInstant";

const serverNow = new Date("2026-11-04T22:00:00.000Z");

describe("scheduled business instant", () => {
  it("accepts a recent UTC dispatch time", () => {
    expect(parseScheduledBusinessInstant("2026-11-04T21:59:00Z", serverNow).toISOString())
      .toBe("2026-11-04T21:59:00.000Z");
    expect(parseScheduledBusinessInstant("2026-11-04T22:00:00.5Z", serverNow).toISOString())
      .toBe("2026-11-04T22:00:00.500Z");
  });

  it("rejects stale or future requests before they can change lease state", () => {
    expect(() => parseScheduledBusinessInstant("2026-11-04T21:44:59Z", serverNow))
      .toThrow("within 15 minutes");
    expect(() => parseScheduledBusinessInstant("2026-11-04T22:15:01Z", serverNow))
      .toThrow("within 15 minutes");
  });

  it("rejects malformed, non-UTC, and normalized impossible dates", () => {
    expect(() => parseScheduledBusinessInstant(null, serverNow)).toThrow("UTC businessInstant required");
    expect(() => parseScheduledBusinessInstant("2026-11-04T23:00:00+01:00", serverNow))
      .toThrow("UTC businessInstant required");
    expect(() => parseScheduledBusinessInstant("2026-11-04T22:00:00.1234Z", serverNow))
      .toThrow("UTC businessInstant required");
    expect(() => parseScheduledBusinessInstant("2026-11-04T22:00:60Z", serverNow))
      .toThrow("Invalid businessInstant");
  });
});
