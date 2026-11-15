import { describe, expect, it } from "vitest";
import { addNoticePeriod } from "@/lib/noticePeriod";

describe("addNoticePeriod", () => {
  it("clamps calendar months at the end of February", () => {
    expect(addNoticePeriod("2026-01-31", 1, "months")).toBe("2026-02-28");
    expect(addNoticePeriod("2024-01-31", 1, "months")).toBe("2024-02-29");
  });

  it("clamps leap day when adding a year", () => {
    expect(addNoticePeriod("2024-02-29", 1, "years")).toBe("2025-02-28");
  });

  it("adds days and weeks as calendar days", () => {
    expect(addNoticePeriod("2026-03-29", 1, "days")).toBe("2026-03-30");
    expect(addNoticePeriod("2026-12-28", 1, "weeks")).toBe("2027-01-04");
  });

  it("rejects invalid input", () => {
    expect(addNoticePeriod("2026-02-30", 1, "months")).toBe("");
    expect(addNoticePeriod("2026-01-01", 0, "months")).toBe("");
  });
});
