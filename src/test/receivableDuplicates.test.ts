import { describe, expect, it } from "vitest";
import { reviewScheduledReceivableDuplicates } from "@/lib/receivableDuplicates";
import type { ReceivableItem, ReceiptAllocation } from "@/types/receivables";

const item = (id: string, overrides: Partial<ReceivableItem> = {}): ReceivableItem => ({
  id, leaseId: "lease-1", tenantId: "tenant-1", propertyId: "property-1", unitId: "unit-1",
  itemType: "rent", label: "Rent", periodMonth: "2026-10", dueDate: "2026-10-01",
  currencyCode: "EUR", expectedAmount: 1000, allocatedAmount: 0, outstandingAmount: 1000,
  status: "open", priority: 10, origin: "lease-schedule", notes: "",
  cycleIndex: 10, cycleEndDate: "2026-10-31", createdAt: "2026-10-01", updatedAt: "2026-10-01",
  ...overrides,
});

describe("scheduled receivable duplicate review", () => {
  it("keeps one untouched row and removes an identical open duplicate", () => {
    const review = reviewScheduledReceivableDuplicates([item("a"), item("b")], []);
    expect(review.removable.map(row => row.id)).toEqual(["b"]);
    expect(review.ambiguousGroups).toEqual([]);
  });

  it("keeps paid and receipt-linked rows while removing an untouched duplicate", () => {
    const paid = item("paid", { allocatedAmount: 1000, outstandingAmount: 0, status: "paid" });
    const linked = item("linked");
    const allocation = { receivableItemId: "linked" } as ReceiptAllocation;
    const review = reviewScheduledReceivableDuplicates([paid, linked, item("open")], [allocation]);
    expect(review.removable.map(row => row.id)).toEqual(["open"]);
    expect(review.ambiguousGroups).toHaveLength(1);
  });

  it("flags the same lease billing slot across units without deleting either row", () => {
    const review = reviewScheduledReceivableDuplicates([
      item("unit-a"),
      item("unit-b", { unitId: "unit-2" }),
    ], []);
    expect(review.removable).toEqual([]);
    expect(review.ambiguousGroups).toHaveLength(1);
    expect(review.ambiguousGroups[0].map(row => row.id)).toEqual(["unit-a", "unit-b"]);
  });

  it("flags a protected different-currency bill anchored to another unit", () => {
    const review = reviewScheduledReceivableDuplicates([
      item("paid-eur", { allocatedAmount: 1000, outstandingAmount: 0, status: "paid" }),
      item("open-gbp", { unitId: "unit-2", currencyCode: "GBP" }),
    ], [{ receivableItemId: "paid-eur" } as ReceiptAllocation]);
    expect(review.removable).toEqual([]);
    expect(review.ambiguousGroups).toHaveLength(1);
  });

  it("merges the same financial slot across cycle resets but not different amounts, currencies or manual items", () => {
    const review = reviewScheduledReceivableDuplicates([
      item("base"),
      item("amount", { expectedAmount: 1100, outstandingAmount: 1100 }),
      item("currency", { currencyCode: "GBP" }),
      item("cycle", { cycleEndDate: "2026-11-30" }),
      item("manual", { origin: "manual" }),
    ], []);
    expect(review.removable.map(row => row.id)).toEqual(["cycle"]);
    expect(review.ambiguousGroups).toHaveLength(1);
  });
});
