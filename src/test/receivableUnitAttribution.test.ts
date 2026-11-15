import { describe, expect, it } from "vitest";
import type { Lease, LeaseUnitAssignment, Unit } from "@/types";
import type { ReceivableItem } from "@/types/receivables";
import { expectedScheduledCycleAmount, getReceivableUnitAttribution, receivableAmountForUnit } from "@/lib/receivableUnitAttribution";
import { generateLeaseReceivables } from "@/lib/leaseReceivables";

const units = [
  { id: "apartment", propertyId: "property", unitType: "apartment" },
  { id: "parking", propertyId: "property", unitType: "parking" },
] as Unit[];

function lease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: "lease", propertyId: "property", startDate: "2026-01-01", endDate: "2026-12-31",
    dueDayOfMonth: 5, rentFormula: 1, monthlyRent: 1000, monthlyCharges: 100,
    indexationEnabled: false, ...overrides,
  } as Lease;
}

function assignments(overrides: Partial<LeaseUnitAssignment> = {}): LeaseUnitAssignment[] {
  return [
    { leaseId: "lease", unitId: "apartment", startDate: "2026-01-01", endDate: null,
      rentShare: 900, chargesShare: 100, ...overrides },
    { leaseId: "lease", unitId: "parking", startDate: "2026-01-01", endDate: null,
      rentShare: 100, chargesShare: 0 },
  ] as LeaseUnitAssignment[];
}

function item(overrides: Partial<ReceivableItem> = {}): ReceivableItem {
  return {
    id: "receivable", leaseId: "lease", propertyId: "property", unitId: "parking",
    origin: "lease-schedule", itemType: "rent", periodMonth: "2026-01",
    dueDate: "2026-01-05", cycleEndDate: "2026-01-31", expectedAmount: 1000,
    ...overrides,
  } as ReceivableItem;
}

describe("lease receivable unit attribution", () => {
  it("splits a whole-lease rent row by stable assignment shares, not its stored unit", () => {
    const context = { leases: [lease()], assignments: assignments(), units };
    const receivable = item();
    expect(getReceivableUnitAttribution(receivable, context).kind).toBe("split");
    expect(receivableAmountForUnit(receivable, 1000, "apartment", context)).toBe(900);
    expect(receivableAmountForUnit(receivable, 1000, "parking", context)).toBe(100);
    expect(receivableAmountForUnit(receivable, 0.01, "apartment", context)).toBe(0.01);
    expect(receivableAmountForUnit(receivable, 0.01, "parking", context)).toBe(0);
  });

  it("uses the charge shares independently of rent shares", () => {
    const context = { leases: [lease()], assignments: assignments(), units };
    const receivable = item({ itemType: "charges", expectedAmount: 100 });
    expect(receivableAmountForUnit(receivable, 100, "apartment", context)).toBe(100);
    expect(receivableAmountForUnit(receivable, 100, "parking", context)).toBe(0);
  });

  it("retains proportional unit shares after an indexed rent increase", () => {
    const indexed = lease({ startDate: "2025-01-01", endDate: "2027-12-31",
      indexationEnabled: true, indexationBaseDate: "2025-01-01",
      indexationBaseIndex: 100, indexationCurrentIndex: 105 });
    const context = { leases: [indexed], assignments: assignments({ startDate: "2025-01-01" }), units };
    const receivable = item({ expectedAmount: 1050 });
    expect(receivableAmountForUnit(receivable, 1050, "apartment", context)).toBe(945);
    expect(receivableAmountForUnit(receivable, 1050, "parking", context)).toBe(105);
  });

  it("splits stable advance cycles without changing the contractual receivable", () => {
    const context = { leases: [lease({ rentFormula: 6 })], assignments: assignments(), units };
    const receivable = item({ cycleEndDate: "2026-06-30", expectedAmount: 6000 });
    expect(receivableAmountForUnit(receivable, 6000, "apartment", context)).toBe(5400);
    expect(receivableAmountForUnit(receivable, 6000, "parking", context)).toBe(600);
  });

  it("finds cycles before and after an amendment that restarts the rent formula", () => {
    const amended = lease({ rentFormula: 6, primaryTenantId: "tenant", billingTenantId: "tenant",
      tenantIds: ["tenant"], coTenantIds: [] });
    const context = {
      leases: [amended], assignments: assignments(), units,
      amendments: [{ id: "amendment", leaseId: "lease", amendmentNumber: 1,
        title: "New formula", reason: "", notes: "", effectiveDate: "2026-04-01",
        signedDate: "2026-03-20", status: "active" as const, supersedesAmendmentId: null,
        createdAt: "2026-03-20", updatedAt: "2026-04-01" }],
      amendmentChanges: [{ id: "change", amendmentId: "amendment", fieldName: "rentFormula" as const,
        changeType: "set" as const, oldValue: 1, newValue: 6,
        createdAt: "2026-03-20", updatedAt: "2026-04-01" }],
    };
    const before = item();
    const after = item({ id: "after", periodMonth: "2026-04", dueDate: "2026-04-05",
      cycleEndDate: "2026-09-30", expectedAmount: 6000 });
    expect(receivableAmountForUnit(before, 1000, "parking", context)).toBe(100);
    expect(receivableAmountForUnit(after, 6000, "parking", context)).toBe(600);
  });

  it("attributes the first amended cycle when its due date is moved to the effective date", () => {
    const amended = lease({ rentFormula: 6, primaryTenantId: "tenant", billingTenantId: "tenant",
      tenantIds: ["tenant"], coTenantIds: [] });
    const activeAssignments = assignments();
    const effectiveDate = "2026-04-15";
    const context = {
      leases: [amended], assignments: activeAssignments, units,
      amendments: [{ id: "amendment", leaseId: "lease", amendmentNumber: 1,
        title: "New formula", reason: "", notes: "", effectiveDate,
        signedDate: "2026-04-10", status: "active" as const, supersedesAmendmentId: null,
        createdAt: "2026-04-10", updatedAt: effectiveDate }],
      amendmentChanges: [{ id: "change", amendmentId: "amendment", fieldName: "rentFormula" as const,
        changeType: "set" as const, oldValue: 1, newValue: 6,
        createdAt: "2026-04-10", updatedAt: effectiveDate }],
    };
    const [firstRent] = generateLeaseReceivables({ ...amended, lifecycleStage: "active" }, {
      currencyCode: "EUR", genId: () => "amended-rent", today: effectiveDate,
      leadDays: 0, assignments: activeAssignments, units, scheduleStartDate: effectiveDate,
    }).receivables.filter(receivable => receivable.itemType === "rent");

    expect(firstRent.dueDate).toBe(effectiveDate);
    expect(firstRent.expectedAmount).toBe(6000);
    expect(expectedScheduledCycleAmount(firstRent, amended, context)).toBe(6000);
    expect(receivableAmountForUnit(firstRent, 6000, "apartment", context)).toBe(5400);
    expect(receivableAmountForUnit(firstRent, 6000, "parking", context)).toBe(600);
  });

  it("refuses mismatched charge shares rather than inventing a unit allocation", () => {
    const context = { leases: [lease({ monthlyCharges: 160 })], assignments: assignments(), units };
    const receivable = item({ itemType: "charges", expectedAmount: 160 });
    expect(getReceivableUnitAttribution(receivable, context)).toMatchObject({ kind: "unavailable" });
    expect(receivableAmountForUnit(receivable, 160, "apartment", context)).toBe(0);
  });

  it("refuses a one-cent mismatch in assignment shares or billed cycle amount", () => {
    const driftedShares = assignments({ rentShare: 900.01 });
    expect(getReceivableUnitAttribution(item(), {
      leases: [lease()], assignments: driftedShares, units,
    })).toMatchObject({ kind: "unavailable" });

    const driftedBill = item({ expectedAmount: 1000.01 });
    expect(getReceivableUnitAttribution(driftedBill, {
      leases: [lease()], assignments: assignments(), units,
    })).toMatchObject({ kind: "unavailable" });
  });

  it("refuses a single assignment whose share does not cover the whole lease rent", () => {
    const context = { leases: [lease()], assignments: [assignments()[1]], units };
    expect(getReceivableUnitAttribution(item(), context)).toMatchObject({ kind: "unavailable", unitIds: ["parking"] });
    expect(receivableAmountForUnit(item(), 1000, "parking", context)).toBe(0);
  });

  it("keeps a complete single-unit schedule on its assigned unit", () => {
    const context = { leases: [lease({ monthlyRent: 100 })], assignments: [assignments()[1]], units };
    const receivable = item({ expectedAmount: 100 });
    expect(receivableAmountForUnit(receivable, 100, "parking", context)).toBe(100);
  });

  it("refuses duplicate whole-lease rows anchored to different units", () => {
    const first = item();
    const second = item({ id: "second", unitId: "apartment" });
    const context = { leases: [lease()], assignments: assignments(), units, receivables: [first, second] };
    expect(getReceivableUnitAttribution(first, context)).toMatchObject({ kind: "unavailable" });
    expect(getReceivableUnitAttribution(second, context)).toMatchObject({ kind: "unavailable" });
    expect(receivableAmountForUnit(first, 1000, "parking", context)).toBe(0);
  });

  it("accepts separate unit rows when their amounts match the contractual shares", () => {
    const parking = item({ expectedAmount: 100 });
    const apartment = item({ id: "apartment-rent", unitId: "apartment", expectedAmount: 900 });
    const context = { leases: [lease()], assignments: assignments(), units,
      receivables: [parking, apartment] };
    expect(getReceivableUnitAttribution(parking, context)).toMatchObject({ kind: "direct", unitId: "parking" });
    expect(receivableAmountForUnit(parking, 100, "parking", context)).toBe(100);
    expect(receivableAmountForUnit(apartment, 900, "apartment", context)).toBe(900);
  });

  it("refuses a billing cycle that crosses an assignment change", () => {
    const context = { leases: [lease()], assignments: assignments({ endDate: "2026-01-14" })
      .concat([{ leaseId: "lease", unitId: "apartment", startDate: "2026-01-15",
        endDate: null, rentShare: 900, chargesShare: 100 } as LeaseUnitAssignment]), units };
    expect(getReceivableUnitAttribution(item(), context)).toMatchObject({ kind: "unavailable" });
  });

  it("keeps a manually entered unit receivable on its selected unit", () => {
    const context = { leases: [lease()], assignments: assignments(), units };
    const receivable = item({ origin: "manual", expectedAmount: 30 });
    expect(receivableAmountForUnit(receivable, 30, "parking", context)).toBe(30);
    expect(receivableAmountForUnit(receivable, 30, "apartment", context)).toBe(0);
  });
});
