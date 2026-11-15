import { describe, expect, it } from "vitest";
import { reviewManualAllocationDraft } from "@/lib/manualAllocationDraft";

const items = [
  { id: "rent", outstandingAmount: 100 },
  { id: "charges", outstandingAmount: 25.5 },
];

describe("manual allocation draft", () => {
  it("accepts exact cent amounts with a dot or comma", () => {
    const result = reviewManualAllocationDraft({ rent: "10.25", charges: "5,50" }, items);
    expect(result.issues.size).toBe(0);
    expect(result.total).toBe(15.75);
    expect(result.allocations).toEqual([
      { receivableItemId: "rent", amount: 10.25 },
      { receivableItemId: "charges", amount: 5.5 },
    ]);
  });

  it("never interprets an incomplete or over-precise entry as a smaller payment", () => {
    const result = reviewManualAllocationDraft({ rent: "1e", charges: "1.234" }, items);
    expect(result.issues.get("rent")).toBe("invalid");
    expect(result.issues.get("charges")).toBe("invalid");
    expect(result.allocations).toEqual([]);
  });

  it("flags stale and over-balance rows while retaining valid lines for the preview only", () => {
    const result = reviewManualAllocationDraft({ rent: "101", charges: "5", gone: "10" }, items);
    expect(result.issues.get("rent")).toBe("exceeds");
    expect(result.issues.get("gone")).toBe("stale");
    expect(result.allocations).toEqual([{ receivableItemId: "charges", amount: 5 }]);
    expect(result.total).toBe(5);
  });
});
