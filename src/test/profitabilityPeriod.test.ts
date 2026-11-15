import { describe, expect, it } from "vitest";
import { defaultPeriod } from "@/lib/profitability";

describe("trailing profitability period", () => {
  it("clamps a leap-day anniversary before advancing to the next day", () => {
    expect(defaultPeriod("2024-02-29")).toEqual({ start: "2023-03-01", end: "2024-02-29" });
  });

  it("keeps ordinary and post-leap anniversaries aligned", () => {
    expect(defaultPeriod("2025-02-28")).toEqual({ start: "2024-02-29", end: "2025-02-28" });
    expect(defaultPeriod("2026-11-07")).toEqual({ start: "2025-11-08", end: "2026-11-07" });
  });
});
