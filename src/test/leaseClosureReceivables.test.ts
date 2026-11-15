import { describe, expect, it } from "vitest";
import { getLeaseClosureReceivablesToReview } from "../lib/leaseReceivables";
import type { ReceivableItem } from "../types/receivables";

const receivable = (overrides: Partial<ReceivableItem> = {}): ReceivableItem => ({
  id: "rent-1",
  leaseId: "lease-1",
  tenantId: "tenant-1",
  propertyId: "property-1",
  unitId: "unit-1",
  itemType: "rent",
  label: "Rent",
  periodMonth: "2026-01",
  dueDate: "2026-01-01",
  currencyCode: "EUR",
  expectedAmount: 600,
  allocatedAmount: 0,
  outstandingAmount: 600,
  status: "open",
  priority: 10,
  origin: "lease-schedule",
  notes: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  cycleIndex: 1,
  cycleEndDate: "2026-06-30",
  ...overrides,
});

describe("lease closure receivable review", () => {
  it("flags billed cycles that extend beyond the closure, including paid rows", () => {
    const crossing = receivable({ status: "paid", allocatedAmount: 600, outstandingAmount: 0 });
    const result = getLeaseClosureReceivablesToReview([crossing], "lease-1", "2026-03-31");
    expect(result.crossingCycles).toEqual([crossing]);
    expect(result.unknownCycleEnds).toEqual([]);
    expect(result.protectedFuture).toEqual([]);
  });

  it("flags legacy billed rows whose period end cannot be established", () => {
    const legacy = receivable({ id: "legacy", cycleEndDate: null, status: "paid", allocatedAmount: 600, outstandingAmount: 0 });
    const futureOpen = receivable({ id: "future", dueDate: "2026-07-01", cycleEndDate: null });
    const result = getLeaseClosureReceivablesToReview([legacy, futureOpen], "lease-1", "2026-03-31");
    expect(result.unknownCycleEnds).toEqual([legacy]);
    expect(result.crossingCycles).toEqual([]);
    expect(result.protectedFuture).toEqual([]);
  });

  it("does not flag a cycle ending on the closure date or a cancelled row", () => {
    const endingOnDate = receivable({ id: "boundary", cycleEndDate: "2026-03-31" });
    const cancelled = receivable({ id: "cancelled", status: "cancelled" });
    const result = getLeaseClosureReceivablesToReview([endingOnDate, cancelled], "lease-1", "2026-03-31");
    expect(result.crossingCycles).toEqual([]);
  });

  it("flags protected future rows but not open future rows that closure will prune", () => {
    const open = receivable({ id: "open", dueDate: "2026-07-01", cycleEndDate: "2026-07-31" });
    const paid = receivable({ id: "paid", dueDate: "2026-07-01", cycleEndDate: "2026-07-31", status: "paid", allocatedAmount: 600, outstandingAmount: 0 });
    const allocated = receivable({ id: "allocated", dueDate: "2026-07-01", cycleEndDate: "2026-07-31", allocatedAmount: 100, outstandingAmount: 500 });
    const linked = receivable({ id: "linked", dueDate: "2026-07-01", cycleEndDate: "2026-07-31" });
    const writtenOff = receivable({ id: "written-off", dueDate: "2026-07-01", cycleEndDate: "2026-07-31", status: "written-off" });
    const result = getLeaseClosureReceivablesToReview(
      [open, paid, allocated, linked, writtenOff], "lease-1", "2026-03-31", new Set(["linked"]),
    );
    expect(result.protectedFuture.map(item => item.id)).toEqual(["paid", "allocated", "linked", "written-off"]);
    expect(result.crossingCycles).toEqual([]);
  });

  it("ignores manual, unrelated-lease, and non-contractual future rows", () => {
    const result = getLeaseClosureReceivablesToReview([
      receivable({ id: "manual", origin: "manual" }),
      receivable({ id: "other", leaseId: "lease-2" }),
      receivable({ id: "deposit", itemType: "deposit" }),
    ], "lease-1", "2026-03-31");
    expect(result).toEqual({ crossingCycles: [], unknownCycleEnds: [], protectedFuture: [] });
  });
});
