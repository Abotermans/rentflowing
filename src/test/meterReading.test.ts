import { describe, expect, it } from "vitest";
import { normalizeMeterReading } from "@/lib/meterReading";

describe("meter reading input", () => {
  it("accepts decimal commas and spaces", () => {
    expect(normalizeMeterReading("1 234,5")).toBe("1234.5");
    expect(normalizeMeterReading("42.25")).toBe("42.25");
    expect(normalizeMeterReading("0")).toBe("0");
  });

  it("distinguishes an empty reading from an invalid reading", () => {
    expect(normalizeMeterReading("  ")).toBeNull();
    expect(normalizeMeterReading("-1")).toBeUndefined();
    expect(normalizeMeterReading("abc")).toBeUndefined();
    expect(normalizeMeterReading("1,2,3")).toBeUndefined();
  });
});
