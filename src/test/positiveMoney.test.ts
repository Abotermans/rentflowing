import { describe, expect, it } from "vitest";
import { parseNonNegativeMoney, parsePositiveMoney, positiveMoneyCents, positiveMoneyIssue } from "@/lib/validation";

describe("positive money input", () => {
  it("parses exact non-negative amounts without silently rounding", () => {
    expect(parseNonNegativeMoney("0")).toBe(0);
    expect(parseNonNegativeMoney(" 0,30 ")).toBe(0.3);
    expect(parseNonNegativeMoney("12.50")).toBe(12.5);
    expect(parseNonNegativeMoney("-1")).toBeNull();
    expect(parseNonNegativeMoney("1.001")).toBeNull();
    expect(parseNonNegativeMoney("oops")).toBeNull();
  });
  it("accepts exact cent amounts in dot and comma notation", () => {
    expect(parsePositiveMoney("0,30")).toBe(0.3);
    expect(parsePositiveMoney(" 12.50 ")).toBe(12.5);
    expect(positiveMoneyCents(0.3)).toBe(30);
    expect(positiveMoneyIssue("1,25")).toBeNull();
  });

  it("distinguishes missing, nonpositive and malformed or sub-cent amounts", () => {
    expect(positiveMoneyIssue(" ")).toBe("required");
    expect(positiveMoneyIssue("0.00")).toBe("positive");
    expect(positiveMoneyIssue("-1")).toBe("positive");
    for (const input of ["1.001", "1,234", "1abc", "1e3", "1."]) {
      expect(parsePositiveMoney(input)).toBeNull();
      expect(positiveMoneyIssue(input)).toBe("invalid");
    }
    expect(positiveMoneyCents(0.001)).toBeNull();
    expect(positiveMoneyCents(0.1 + 0.2)).toBeNull();
    expect(positiveMoneyCents(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
