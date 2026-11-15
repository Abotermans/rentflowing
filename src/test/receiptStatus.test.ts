import { describe, expect, it } from "vitest";
import { computeReceiptStatus, isReceiptAllocatable } from "@/types/receivables";

describe("receipt status", () => {
  it("does not classify invalid or negative receipts as matched", () => {
    expect(computeReceiptStatus({ amountReceived: -50, unmatchedAmount: -50, status: "matched" })).toBe("exception");
    expect(computeReceiptStatus({ amountReceived: 100, unmatchedAmount: -1, status: "matched" })).toBe("exception");
    expect(computeReceiptStatus({ amountReceived: 100, unmatchedAmount: 101, status: "unmatched" })).toBe("exception");
  });

  it("preserves explicit refund and reversal statuses", () => {
    expect(computeReceiptStatus({ amountReceived: -50, unmatchedAmount: -50, status: "refunded" })).toBe("refunded");
    expect(computeReceiptStatus({ amountReceived: 100, unmatchedAmount: 0, status: "reversed" })).toBe("reversed");
  });

  it("allows only valid, nonterminal unmatched receipts to be allocated", () => {
    const receipt = { amountReceived: 100, unmatchedAmount: 50, status: "partially-matched" as const };
    expect(isReceiptAllocatable(receipt)).toBe(true);
    for (const status of ["exception", "reversed", "refunded"] as const) {
      expect(isReceiptAllocatable({ ...receipt, status })).toBe(false);
    }
    expect(isReceiptAllocatable({ ...receipt, status: "matched" })).toBe(false);
    expect(isReceiptAllocatable({ ...receipt, status: "imported" })).toBe(true);
    expect(isReceiptAllocatable({ ...receipt, unmatchedAmount: 0 })).toBe(false);
    expect(isReceiptAllocatable({ ...receipt, unmatchedAmount: 101 })).toBe(false);
    expect(isReceiptAllocatable({ ...receipt, amountReceived: Number.NaN })).toBe(false);
  });
});
