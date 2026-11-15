import { describe, expect, it } from "vitest";
import { autoAllocate, leaseIncludesTenant, receiptMatchesReceivable, receiptScopeError } from "@/lib/reconciliation";
import type { CashReceipt, ReceivableItem } from "@/types/receivables";

const property = { id: "property-gbp", currencyCode: "GBP" };
const unit = { id: "unit-gbp", propertyId: property.id };
const lease = {
  id: "lease-gbp", propertyId: property.id,
  tenantIds: ["tenant-a", "tenant-b"], primaryTenantId: "tenant-a", coTenantIds: ["tenant-b"],
};
const receipt = {
  tenantId: "tenant-a", leaseId: lease.id, propertyId: property.id,
  unitId: unit.id, currencyCode: "GBP",
};

describe("receipt scope", () => {
  it("accepts a tenant on the lease and an unlinked foreign-currency receipt", () => {
    expect(receiptScopeError(receipt, [lease], [property], [unit])).toBeNull();
    expect(receiptScopeError({ ...receipt, tenantId: "tenant-b" }, [lease], [property], [unit])).toBeNull();
    expect(receiptScopeError({ tenantId: null, leaseId: null, propertyId: null, unitId: null, currencyCode: "GBP" }, [], [property], []))
      .toBeNull();
  });

  it("rejects a missing lease or an unrelated tenant, property or unit", () => {
    expect(receiptScopeError({ ...receipt, leaseId: "missing" }, [lease], [property], [unit])).toMatch(/no longer exists/);
    expect(receiptScopeError({ ...receipt, tenantId: "tenant-c" }, [lease], [property], [unit])).toMatch(/tenant does not belong/);
    expect(receiptScopeError({ ...receipt, propertyId: "other" }, [lease], [property], [unit])).toMatch(/property must match/);
    expect(receiptScopeError({ ...receipt, unitId: "other" }, [lease], [property], [unit])).toMatch(/unit must belong/);
    expect(receiptScopeError({ ...receipt, currencyCode: "EUR" }, [lease], [property], [unit])).toBeNull();
  });

  it("supports legacy leases without tenantIds", () => {
    expect(leaseIncludesTenant(lease, "tenant-b")).toBe(true);
    expect(leaseIncludesTenant(lease, "tenant-c")).toBe(false);
    expect(receiptScopeError({ ...receipt, tenantId: "tenant-b" }, [{ ...lease, tenantIds: [] }], [property], [unit]))
      .toBeNull();
  });

  it("does not allocate a property-scoped receipt to another property of the same tenant", () => {
    const tenantReceipt = {
      leaseId: null, tenantId: "tenant-a", propertyId: "property-gbp", currencyCode: "GBP",
    };
    const otherPropertyItem = {
      leaseId: "lease-other", tenantId: "tenant-a", propertyId: "property-other", currencyCode: "GBP",
    };
    expect(receiptMatchesReceivable(tenantReceipt, otherPropertyItem)).toBe(false);
    expect(receiptMatchesReceivable({ ...tenantReceipt, propertyId: null }, otherPropertyItem)).toBe(true);
    expect(receiptMatchesReceivable(tenantReceipt, { ...otherPropertyItem, propertyId: "property-gbp" })).toBe(true);
  });

  it("auto-allocates small amounts without floating-point fractions", () => {
    const cash = {
      id: "receipt-1", tenantId: "tenant-a", leaseId: null,
      propertyId: "property-gbp", currencyCode: "GBP",
      amountReceived: 0.3, unmatchedAmount: 0.3, status: "unmatched",
    } as CashReceipt;
    const items = [0.1, 0.2].map((amount, index) => ({
      id: `item-${index}`, tenantId: "tenant-a", leaseId: null,
      propertyId: "property-gbp", currencyCode: "GBP",
      allocatedAmount: 0, outstandingAmount: amount, status: "open", priority: index,
      dueDate: `2026-01-0${index + 1}`,
    })) as ReceivableItem[];
    const result = autoAllocate(cash, items, "2026-01-15");
    expect(result.allocations.map(row => row.allocatedAmount)).toEqual([0.1, 0.2]);
    expect(result.updatedReceivables.map(row => row.outstandingAmount)).toEqual([0, 0]);
    expect(result.updatedReceipt.unmatchedAmount).toBe(0);
  });

  it("keeps overdue rent ahead of older charges regardless of their age gap", () => {
    const cash = {
      id: "receipt-1", tenantId: "tenant-a", leaseId: null,
      propertyId: "property-gbp", currencyCode: "GBP",
      amountReceived: 100, unmatchedAmount: 100, status: "unmatched",
    } as CashReceipt;
    const items = [
      { id: "old-charges", itemType: "charges", dueDate: "1990-01-01" },
      { id: "new-rent", itemType: "rent", dueDate: "2026-01-01" },
    ].map(row => ({ ...row, tenantId: "tenant-a", leaseId: null,
      propertyId: "property-gbp", currencyCode: "GBP", allocatedAmount: 0,
      outstandingAmount: 100, status: "overdue", expectedAmount: 100,
    })) as ReceivableItem[];

    const result = autoAllocate(cash, items, "2026-02-01");
    expect(result.allocations.map(row => row.receivableItemId)).toEqual(["new-rent"]);
    expect(result.updatedReceivables.find(row => row.id === "old-charges")?.outstandingAmount).toBe(100);
  });
});
