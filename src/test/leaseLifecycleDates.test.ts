import { describe, expect, it } from "vitest";
import { computeCycles, getCyclePaidAmount, getRentFormulaSegmentStart } from "@/lib/leaseCycles";
import { getEffectiveLeaseTerms, getOriginalLeaseTerms } from "@/lib/amendments";
import {
  getOpenEndedReceivableThroughDate,
  reconcileActivatedAmendmentReceivables,
} from "@/lib/leaseReceivables";
import type { ReceivableItem } from "@/types/receivables";
import type { Lease, LeaseUnitAssignment, Unit } from "@/types";
import { getMoveOutStatus } from "@/types";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

const cycles = (startDate: string, endDate: string, rentFormula = 1) => computeCycles({
  startDate, endDate, rentFormula, monthlyRent: 100, monthlyCharges: 10,
});

describe("lease cycle date boundaries", () => {
  it("shows move-out completion on the property's day at a cross-border midnight", () => {
    const instant = new Date("2026-10-31T23:30:00Z");
    const lease = { moveOutActualDate: "2026-11-01" } as Lease;
    const brusselsDay = propertyBusinessDateISO({ countryCode: "BE" }, instant);
    const londonDay = propertyBusinessDateISO({ countryCode: "GB" }, instant);

    expect(getMoveOutStatus(lease, brusselsDay)).toBe("completed");
    expect(getMoveOutStatus(lease, londonDay)).toBe("scheduled");
  });

  it("does not emit a cycle beginning after the lease ends", () => {
    expect(cycles("2026-01-15", "2026-02-14").map(c => [c.startDate, c.endDate, c.months])).toEqual([
      ["2026-01-15", "2026-02-14", 1],
    ]);
  });

  it("keeps month-end anniversaries within February and resumes from the original anchor", () => {
    expect(cycles("2026-01-31", "2026-03-31").map(c => [c.startDate, c.endDate])).toEqual([
      ["2026-01-31", "2026-02-27"],
      ["2026-02-28", "2026-03-30"],
      ["2026-03-31", "2026-03-31"],
    ]);
  });

  it("clamps the open-ended horizon at the target month's last day", () => {
    expect(getOpenEndedReceivableThroughDate("2026-01-31", 1)).toBe("2026-02-27");
    expect(getOpenEndedReceivableThroughDate("2024-01-31", 1)).toBe("2024-02-28");
  });

  it("extends an open-ended horizon through a complete advance cycle", () => {
    expect(getOpenEndedReceivableThroughDate("2026-12-20", 6, "2026-01-01", 30)).toBe("2027-06-30");
    expect(getOpenEndedReceivableThroughDate("2026-10-17", 6, "2026-01-01", 30)).toBe("2026-12-31");
  });
});

describe("amendment receivable reconciliation", () => {
  it("does not insert duplicate regenerated schedule entries", () => {
    const item = {
      id: "r1", leaseId: "lease-1", unitId: "unit-1", itemType: "rent",
      cycleIndex: 1, cycleEndDate: "2026-06-30", periodMonth: "2026-01",
      dueDate: "2026-01-01", origin: "lease-schedule", allocatedAmount: 0,
    } as ReceivableItem;
    const result = reconcileActivatedAmendmentReceivables(
      [], [item, { ...item, id: "r2" }], "lease-1", "2026-01-01",
    );
    expect(result.freshReceivables.map(r => r.id)).toEqual(["r1"]);
  });

  it("preserves cancelled, disputed, and written-off future schedule decisions", () => {
    const statuses = ["cancelled", "disputed", "written-off", "open", "overdue"] as const;
    const existing = statuses.map((status, index) => ({
      id: status, leaseId: "lease-1", unitId: "unit-1", itemType: "rent" as const,
      cycleIndex: null, cycleEndDate: null,
      periodMonth: `2027-0${index + 1}`, dueDate: `2027-0${index + 1}-01`,
      origin: "lease-schedule" as const, allocatedAmount: 0, status,
    })) as ReceivableItem[];
    const regenerated = existing.map(item => ({ ...item, id: `new-${item.id}`, status: "open" as const }));
    const result = reconcileActivatedAmendmentReceivables(existing, regenerated, "lease-1", "2027-01-01");
    expect(result.removedReceivables.map(item => item.id)).toEqual(["open", "overdue"]);
    expect(result.nextReceivables.map(item => item.id)).toEqual([
      "cancelled", "disputed", "written-off", "new-open", "new-overdue",
    ]);
  });
});

describe("advance billing cycle display", () => {
  it("starts the current formula's cycles on the applied amendment effective date", () => {
    const lease = { id: "lease-1", startDate: "2026-01-01" } as Lease;
    const amendments = [
      { id: "am-1", leaseId: lease.id, status: "ended", effectiveDate: "2026-07-15" },
      { id: "am-2", leaseId: lease.id, status: "active", effectiveDate: "2027-02-10" },
      { id: "am-3", leaseId: lease.id, status: "scheduled", effectiveDate: "2027-08-01" },
    ] as LeaseAmendment[];
    const changes = [
      { amendmentId: "am-1", fieldName: "rentFormula" },
      { amendmentId: "am-2", fieldName: "baseMonthlyRentTotal" },
      { amendmentId: "am-3", fieldName: "rentFormula" },
    ] as LeaseAmendmentChange[];

    const segmentStart = getRentFormulaSegmentStart(lease, "2027-03-01", amendments, changes);
    expect(segmentStart).toBe("2026-07-15");
    expect(cycles(segmentStart, "2027-08-31", 6).map(cycle => cycle.startDate)).toEqual([
      "2026-07-15", "2027-01-15", "2027-07-15",
    ]);
  });

  it("does not count an old cycle 1 as paid toward a new formula's cycle 1", () => {
    const [newCycle] = cycles("2026-07-15", "2027-01-14", 6);
    const oldItem = {
      cycleIndex: 1, periodMonth: "2026-01", cycleEndDate: "2026-06-30", itemType: "rent", allocatedAmount: 600,
    } as ReceivableItem;
    const newItem = {
      cycleIndex: 1, periodMonth: "2026-07", cycleEndDate: "2027-01-14", itemType: "rent", allocatedAmount: 200,
    } as ReceivableItem;
    expect(getCyclePaidAmount(newCycle, [oldItem, newItem])).toBe(200);
  });
});

describe("effective amendment terms", () => {
  it.each([
    ["extension", "2027-12-31"],
    ["shortening", "2026-09-30"],
  ])("preserves the original end date before a per-unit %s", (_kind, amendedEnd) => {
    const state = {
      leases: [{ id: "lease-1", startDate: "2026-01-01", endDate: amendedEnd,
        monthlyRent: 1000, monthlyCharges: 100, primaryTenantId: "tenant-1",
        coTenantIds: [], tenantIds: ["tenant-1"], billingTenantId: "tenant-1",
        rentFormula: 1 } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" } as Unit],
      leaseUnitAssignments: [{ leaseId: "lease-1", unitId: "unit-1",
        startDate: "2026-01-01", endDate: amendedEnd,
        rentShare: 1000, chargesShare: 100 } as LeaseUnitAssignment],
      amendments: [{ id: "am-1", leaseId: "lease-1", status: "active",
        effectiveDate: "2026-07-01", amendmentNumber: 1 } as LeaseAmendment],
      amendmentChanges: [{ amendmentId: "am-1", fieldName: "unitEndDate",
        oldValue: "2026-12-31", newValue: amendedEnd,
        metadata: { unitId: "unit-1" } } as LeaseAmendmentChange],
    };

    expect(getOriginalLeaseTerms("lease-1", state)?.endDate).toBe("2026-12-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-06-30", state)?.endDate).toBe("2026-12-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-07-01", state)?.endDate).toBe(amendedEnd);
    if (amendedEnd === "2026-09-30") {
      expect(getEffectiveLeaseTerms("lease-1", "2026-10-01", state)?.endDate).toBe(amendedEnd);
    }
  });

  it("keeps the original end date when an amendment adds a longer-running unit", () => {
    const state = {
      leases: [{ id: "lease-1", startDate: "2026-01-01", endDate: "2027-12-31",
        monthlyRent: 1000, monthlyCharges: 100, primaryTenantId: "tenant-1",
        coTenantIds: [], tenantIds: ["tenant-1"], billingTenantId: "tenant-1",
        rentFormula: 1 } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" },
        { id: "unit-2", unitType: "parking" }] as Unit[],
      leaseUnitAssignments: [
        { leaseId: "lease-1", unitId: "unit-1", startDate: "2026-01-01",
          endDate: "2026-12-31", rentShare: 1000, chargesShare: 100 },
        { leaseId: "lease-1", unitId: "unit-2", startDate: "2026-07-01",
          endDate: "2027-12-31", rentShare: 100, chargesShare: 0 },
      ] as LeaseUnitAssignment[],
      amendments: [{ id: "am-1", leaseId: "lease-1", status: "active",
        effectiveDate: "2026-07-01", amendmentNumber: 1 } as LeaseAmendment],
      amendmentChanges: [{ amendmentId: "am-1", fieldName: "unitAssignments",
        changeType: "add", oldValue: null, newValue: { rentShare: 100, chargesShare: 0 },
        metadata: { unitId: "unit-2", endDate: "2027-12-31",
          originalLeaseEndDate: "2026-12-31" } } as LeaseAmendmentChange],
    };

    expect(getOriginalLeaseTerms("lease-1", state)?.endDate).toBe("2026-12-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-06-30", state)?.endDate).toBe("2026-12-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-07-01", state)?.endDate).toBe("2027-12-31");
  });

  it("orders per-unit and legacy lease-end changes by their effective dates", () => {
    const state = {
      leases: [{ id: "lease-1", startDate: "2026-01-01", endDate: "2027-12-31",
        monthlyRent: 1000, monthlyCharges: 100, primaryTenantId: "tenant-1",
        coTenantIds: [], tenantIds: ["tenant-1"], billingTenantId: "tenant-1",
        rentFormula: 1 } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" } as Unit],
      leaseUnitAssignments: [{ leaseId: "lease-1", unitId: "unit-1",
        startDate: "2026-01-01", endDate: "2027-03-31",
        rentShare: 1000, chargesShare: 100 } as LeaseUnitAssignment],
      amendments: [
        { id: "am-1", leaseId: "lease-1", status: "ended", effectiveDate: "2026-07-01", amendmentNumber: 1 },
        { id: "am-2", leaseId: "lease-1", status: "active", effectiveDate: "2026-10-01", amendmentNumber: 2 },
      ] as LeaseAmendment[],
      amendmentChanges: [
        { amendmentId: "am-1", fieldName: "unitEndDate", oldValue: "2026-12-31",
          newValue: "2027-03-31", metadata: { unitId: "unit-1" } },
        { amendmentId: "am-2", fieldName: "leaseEndDate", oldValue: "2027-03-31",
          newValue: "2027-12-31" },
      ] as LeaseAmendmentChange[],
    };

    expect(getOriginalLeaseTerms("lease-1", state)?.endDate).toBe("2026-12-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-06-30", state)?.endDate).toBe("2026-12-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-08-01", state)?.endDate).toBe("2027-03-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-11-01", state)?.endDate).toBe("2027-12-31");
  });

  it("preserves intermediate end dates across successive per-unit amendments", () => {
    const state = {
      leases: [{ id: "lease-1", startDate: "2026-01-01", endDate: "2027-06-30",
        monthlyRent: 1000, monthlyCharges: 100, primaryTenantId: "tenant-1",
        coTenantIds: [], tenantIds: ["tenant-1"], billingTenantId: "tenant-1",
        rentFormula: 1 } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" },
        { id: "unit-2", unitType: "parking" }] as Unit[],
      leaseUnitAssignments: [
        { leaseId: "lease-1", unitId: "unit-1", startDate: "2026-01-01",
          endDate: "2027-06-30", rentShare: 900, chargesShare: 100 },
        { leaseId: "lease-1", unitId: "unit-2", startDate: "2026-01-01",
          endDate: "2026-09-30", rentShare: 100, chargesShare: 0 },
      ] as LeaseUnitAssignment[],
      amendments: [
        { id: "am-1", leaseId: "lease-1", status: "ended", effectiveDate: "2026-07-01", amendmentNumber: 1 },
        { id: "am-2", leaseId: "lease-1", status: "active", effectiveDate: "2026-10-01", amendmentNumber: 2 },
      ] as LeaseAmendment[],
      amendmentChanges: [
        { amendmentId: "am-1", fieldName: "unitEndDate", oldValue: "2026-12-31",
          newValue: "2027-03-31", metadata: { unitId: "unit-1" } },
        { amendmentId: "am-2", fieldName: "unitEndDate", oldValue: "2027-03-31",
          newValue: "2027-06-30", metadata: { unitId: "unit-1" } },
      ] as LeaseAmendmentChange[],
    };

    expect(getOriginalLeaseTerms("lease-1", state)?.endDate).toBe("2026-12-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-08-01", state)?.endDate).toBe("2027-03-31");
    expect(getEffectiveLeaseTerms("lease-1", "2026-11-01", state)?.endDate).toBe("2027-06-30");
  });

  it("restores prior indexation settings and honors explicit nulls when an amendment disables them", () => {
    const state = {
      leases: [{ id: "lease-1", startDate: "2026-01-01", endDate: "2027-12-31", monthlyRent: 1000, monthlyCharges: 100, primaryTenantId: "tenant-1", coTenantIds: [], tenantIds: ["tenant-1"], billingTenantId: "tenant-1", rentFormula: 1, indexationEnabled: false, indexationBaseDate: null, indexationBaseIndex: null, indexationCurrentIndex: null, indexationCapPercent: null } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" } as Unit],
      leaseUnitAssignments: [{ leaseId: "lease-1", unitId: "unit-1", startDate: "2026-01-01", endDate: "2027-12-31", rentShare: 1000, chargesShare: 100 } as LeaseUnitAssignment],
      amendments: [{ id: "am-1", leaseId: "lease-1", status: "active", effectiveDate: "2026-07-01", amendmentNumber: 1 } as LeaseAmendment],
      amendmentChanges: [{
        amendmentId: "am-1", fieldName: "indexationSettings",
        oldValue: { indexationEnabled: true, indexationBaseDate: "2026-01-01", indexationBaseIndex: 100, indexationCurrentIndex: 110, indexationCapPercent: 5, indexationRoundingMode: "nearest-cent", indexationNotes: "Original" },
        newValue: { indexationEnabled: false, indexationBaseDate: null, indexationBaseIndex: null, indexationCurrentIndex: null, indexationCapPercent: null, indexationRoundingMode: "nearest-cent", indexationNotes: "" },
      } as LeaseAmendmentChange],
    };

    expect(getOriginalLeaseTerms("lease-1", state)).toMatchObject({ indexationEnabled: true, indexationBaseDate: "2026-01-01", indexationBaseIndex: 100, indexationCurrentIndex: 110 });
    expect(getEffectiveLeaseTerms("lease-1", "2026-05-01", state)).toMatchObject({ indexationEnabled: true, indexationBaseIndex: 100 });
    expect(getEffectiveLeaseTerms("lease-1", "2026-08-01", state)).toMatchObject({ indexationEnabled: false, indexationBaseDate: null, indexationBaseIndex: null, indexationCurrentIndex: null, indexationCapPercent: null });
  });

  it("applies superseded amendments only from their effective dates", () => {
    const state = {
      leases: [{ id: "lease-1", startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: 1300, monthlyCharges: 100, depositOrGuaranteeAmount: 300, noticePeriodText: "3 months", primaryTenantId: "tenant-1", coTenantIds: [], tenantIds: ["tenant-1"], billingTenantId: "tenant-1", rentFormula: 6 } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" } as Unit],
      leaseUnitAssignments: [
        { leaseId: "lease-1", unitId: "unit-1", startDate: "2026-01-01", endDate: "2026-05-31", rentShare: 1200, chargesShare: 100 } as LeaseUnitAssignment,
        { leaseId: "lease-1", unitId: "unit-1", startDate: "2026-06-01", endDate: "2026-12-31", rentShare: 1300, chargesShare: 100 } as LeaseUnitAssignment,
      ],
      amendments: [
        { id: "am-1", leaseId: "lease-1", status: "ended", effectiveDate: "2026-06-01", amendmentNumber: 1 } as LeaseAmendment,
        { id: "am-2", leaseId: "lease-1", status: "active", effectiveDate: "2026-09-01", amendmentNumber: 2 } as LeaseAmendment,
      ],
      amendmentChanges: [
        { amendmentId: "am-1", fieldName: "unitRentShare", oldValue: 1200, newValue: 1300 } as LeaseAmendmentChange,
        { amendmentId: "am-1", fieldName: "depositAmount", oldValue: 100, newValue: 200 } as LeaseAmendmentChange,
        { amendmentId: "am-2", fieldName: "depositAmount", oldValue: 200, newValue: 300 } as LeaseAmendmentChange,
        { amendmentId: "am-2", fieldName: "rentFormula", oldValue: 1, newValue: 6 } as LeaseAmendmentChange,
      ],
    };

    expect(getOriginalLeaseTerms("lease-1", state)).toMatchObject({ monthlyRent: 1200, depositAmount: 100, rentFormula: 1 });
    expect(getEffectiveLeaseTerms("lease-1", "2026-05-01", state)).toMatchObject({ monthlyRent: 1200, depositAmount: 100, rentFormula: 1 });
    expect(getEffectiveLeaseTerms("lease-1", "2026-07-01", state)).toMatchObject({ monthlyRent: 1300, depositAmount: 200, rentFormula: 1 });
    expect(getEffectiveLeaseTerms("lease-1", "2026-10-01", state)).toMatchObject({ monthlyRent: 1300, depositAmount: 300, rentFormula: 6 });
  });

  it("keeps original rent and charges when the lease record holds amended totals", () => {
    const state = {
      leases: [{ id: "lease-1", startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: 1300, monthlyCharges: 0, primaryTenantId: "tenant-1", coTenantIds: [], tenantIds: ["tenant-1"], billingTenantId: "tenant-1", rentFormula: 1 } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" } as Unit],
      leaseUnitAssignments: [
        { leaseId: "lease-1", unitId: "unit-1", startDate: "2026-01-01", endDate: "2026-05-31", rentShare: 1200, chargesShare: 100 } as LeaseUnitAssignment,
        { leaseId: "lease-1", unitId: "unit-1", startDate: "2026-06-01", endDate: "2026-12-31", rentShare: 1300, chargesShare: 0 } as LeaseUnitAssignment,
      ],
      amendments: [{ id: "am-1", leaseId: "lease-1", status: "active", effectiveDate: "2026-06-01", amendmentNumber: 1 } as LeaseAmendment],
      amendmentChanges: [
        { amendmentId: "am-1", fieldName: "unitRentShare", oldValue: 1200, newValue: 1300 } as LeaseAmendmentChange,
        { amendmentId: "am-1", fieldName: "unitChargesShare", oldValue: 100, newValue: 0 } as LeaseAmendmentChange,
      ],
    };

    expect(getOriginalLeaseTerms("lease-1", state)).toMatchObject({ monthlyRent: 1200, monthlyCharges: 100 });
    expect(getEffectiveLeaseTerms("lease-1", "2026-05-01", state)).toMatchObject({ monthlyRent: 1200, monthlyCharges: 100 });
    expect(getEffectiveLeaseTerms("lease-1", "2026-07-01", state)).toMatchObject({ monthlyRent: 1300, monthlyCharges: 0 });
  });

  it("keeps explicit base rent and charges changes even when assignment shares are unchanged", () => {
    const amendment = {
      id: "am-1", leaseId: "lease-1", status: "active", effectiveDate: "2026-07-01", amendmentNumber: 1,
    } as LeaseAmendment;
    const changes = [
      { amendmentId: "am-1", fieldName: "baseMonthlyRentTotal", oldValue: 1100, newValue: 1200 },
      { amendmentId: "am-1", fieldName: "baseMonthlyChargesTotal", oldValue: 90, newValue: 150 },
    ] as LeaseAmendmentChange[];
    const state = {
      leases: [{
        id: "lease-1", startDate: "2026-01-01", endDate: "2026-12-31",
        monthlyRent: 1000, monthlyCharges: 100, primaryTenantId: "tenant-1", coTenantIds: [],
        tenantIds: ["tenant-1"], billingTenantId: "tenant-1", rentFormula: 1,
      } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" } as Unit],
      leaseUnitAssignments: [{
        leaseId: "lease-1", unitId: "unit-1", startDate: "2026-01-01", endDate: null,
        rentShare: 1000, chargesShare: 100,
      } as LeaseUnitAssignment],
      amendments: [amendment], amendmentChanges: changes,
    };
    const terms = getEffectiveLeaseTerms("lease-1", "2026-07-01", state);
    expect(getOriginalLeaseTerms("lease-1", state)).toMatchObject({ monthlyRent: 1100, monthlyCharges: 90 });
    expect(terms?.monthlyRent).toBe(1200);
    expect(terms?.monthlyCharges).toBe(150);
  });

  it("prefers recorded original totals over empty shares when a unit change appears first", () => {
    const state = {
      leases: [{ id: "lease-1", startDate: "2026-01-01", endDate: "2026-12-31",
        monthlyRent: 1100, monthlyCharges: 140, primaryTenantId: "tenant-1",
        coTenantIds: [], tenantIds: ["tenant-1"], billingTenantId: "tenant-1",
        rentFormula: 1 } as Lease],
      units: [{ id: "unit-1", unitType: "apartment" } as Unit],
      leaseUnitAssignments: [{ leaseId: "lease-1", unitId: "unit-1",
        startDate: "2026-01-01", endDate: null, rentShare: null,
        chargesShare: null } as LeaseUnitAssignment],
      amendments: [{ id: "am-1", leaseId: "lease-1", status: "active",
        effectiveDate: "2026-07-01", amendmentNumber: 1 } as LeaseAmendment],
      amendmentChanges: [
        { amendmentId: "am-1", fieldName: "unitAssignments", changeType: "add",
          metadata: { unitId: "unit-2" }, newValue: { rentShare: 200, chargesShare: 40 } },
        { amendmentId: "am-1", fieldName: "baseMonthlyRentTotal", oldValue: 900, newValue: 1100 },
        { amendmentId: "am-1", fieldName: "baseMonthlyChargesTotal", oldValue: 100, newValue: 140 },
      ] as LeaseAmendmentChange[],
    };
    expect(getOriginalLeaseTerms("lease-1", state)).toMatchObject({ monthlyRent: 900, monthlyCharges: 100 });
  });
});
