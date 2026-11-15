import { describe, expect, it } from "vitest";
import { groupReceivableBalances } from "@/lib/receivableBalances";
import type { ReceivableItem } from "@/types/receivables";

type Item = Pick<ReceivableItem, "status" | "outstandingAmount" | "dueDate" | "currencyCode"> & { propertyId: string };

const item = (status: Item["status"], currencyCode: string, amount: number, dueDate: string, propertyId = "p1"): Item => ({
  status, currencyCode, outstandingAmount: amount, dueDate, propertyId,
});

describe("receivable balance groups", () => {
  it("keeps currencies separate and excludes cancelled and written-off balances", () => {
    const result = groupReceivableBalances([
      item("overdue", "GBP", 120, "2026-01-01"),
      item("open", "EUR", 50, "2026-01-01"),
      item("open", "GBP", 30, "2026-12-01"),
      item("cancelled", "EUR", 80, "2026-01-01"),
      item("written-off", "GBP", 90, "2026-01-01"),
    ], () => "2026-11-05");
    expect(result).toEqual({
      outstanding: [
        { currencyCode: "EUR", amount: 50 },
        { currencyCode: "GBP", amount: 150 },
      ],
      overdue: [
        { currencyCode: "EUR", amount: 50 },
        { currencyCode: "GBP", amount: 120 },
      ],
    });
  });

  it("uses each receivable's property date and leaves today's due item out of overdue", () => {
    const result = groupReceivableBalances([
      item("open", "EUR", 100, "2026-11-05", "brussels"),
      item("open", "GBP", 200, "2026-11-05", "london"),
    ], entry => entry.propertyId === "brussels" ? "2026-11-06" : "2026-11-05");
    expect(result.overdue).toEqual([{ currencyCode: "EUR", amount: 100 }]);
  });
});
