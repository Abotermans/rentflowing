import { describe, expect, it } from "vitest";
import { canWritePortfolioData } from "@/hooks/use-portfolio-write-access";

describe("portfolio write access", () => {
  it("allows portfolio managers to edit operational data", () => {
    for (const role of ["owner", "admin", "editor"]) {
      expect(canWritePortfolioData(role)).toBe(true);
    }
  });

  it("keeps viewers and unloaded portfolios read-only", () => {
    for (const role of ["viewer", null, undefined, "unknown"]) {
      expect(canWritePortfolioData(role)).toBe(false);
    }
  });
});
