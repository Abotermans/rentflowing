import { describe, expect, it } from "vitest";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

const amendment = {
  id: "am1", leaseId: "l1", effectiveDate: "2026-06-15", status: "draft",
} as LeaseAmendment;
const formulaChange: LeaseAmendmentChange = {
  id: "ch1", amendmentId: "am1", fieldName: "rentFormula", changeType: "set",
  oldValue: 3, newValue: 6, createdAt: "2026-06-01", updatedAt: "2026-06-01",
};

function state(receivableItems: IntegrityState["receivableItems"]): IntegrityState {
  return {
    properties: [{ id: "p1", countryCode: "BE" }],
    units: [{ id: "u1", propertyId: "p1", unitType: "apartment" }],
    leases: [{ id: "l1", propertyId: "p1", lifecycleStage: "active", startDate: "2026-01-01" }],
    leaseUnitAssignments: [{ leaseId: "l1", unitId: "u1", startDate: "2026-01-01", endDate: null }],
    receivableItems,
    amendments: [amendment],
  } as unknown as IntegrityState;
}

function receivable(overrides: Record<string, unknown>) {
  return {
    leaseId: "l1", dueDate: "2026-06-01", periodMonth: "2026-06",
    cycleEndDate: null, origin: "lease-schedule", itemType: "rent",
    status: "open", outstandingAmount: 100,
    allocatedAmount: 0, ...overrides,
  } as IntegrityState["receivableItems"][number];
}

describe("amendment receivable impact warning", () => {
  it("includes undated-period items and advance cycles crossing the effective date", () => {
    const result = validateAmendment(amendment, [], state([
      receivable({ periodMonth: null, dueDate: "2026-06-20" }),
      receivable({ periodMonth: "2026-04", dueDate: "2026-04-01", cycleEndDate: "2026-07-31" }),
      receivable({ periodMonth: "2026-05", dueDate: "2026-05-01" }),
      receivable({ periodMonth: "2026-07", status: "cancelled" }),
      receivable({ periodMonth: "2026-07", status: "written-off" }),
    ]), "2026-06-15");
    expect(result.warnings.find(warning => warning.code === "AMD_UNPAID_OVERLAP")?.message)
      .toContain("2 unpaid receivable(s)");
  });

  it("does not warn for settled or earlier monthly receivables", () => {
    const result = validateAmendment(amendment, [], state([
      receivable({ periodMonth: null, dueDate: "2026-05-20" }),
      receivable({ periodMonth: "2026-04", cycleEndDate: "2026-05-31" }),
      receivable({ periodMonth: "2026-07", outstandingAmount: 0, status: "paid" }),
    ]), "2026-06-15");
    expect(result.warnings.some(warning => warning.code === "AMD_UNPAID_OVERLAP")).toBe(false);
  });

  it("blocks a formula change through an already billed advance cycle", () => {
    const billedCycle = receivable({
      periodMonth: "2026-04", dueDate: "2026-04-01", cycleEndDate: "2026-07-31",
      status: "paid", allocatedAmount: 100, outstandingAmount: 0,
    });
    const result = validateAmendment(amendment, [formulaChange], state([billedCycle]), "2026-06-15");
    expect(result.blockers.map(blocker => blocker.code)).toContain("AMD_FORMULA_CROSSES_BILLED_CYCLE");
    expect(result.blockers.find(blocker => blocker.code === "AMD_FORMULA_CROSSES_BILLED_CYCLE")?.message)
      .toContain("Move the effective date after the billed cycle");
    expect(validateAmendment(amendment, [], state([billedCycle]), "2026-06-15")
      .blockers.some(blocker => blocker.code === "AMD_FORMULA_CROSSES_BILLED_CYCLE")).toBe(false);
  });

  it("allows a formula change after the earlier cycle ends or is cancelled", () => {
    const result = validateAmendment(amendment, [formulaChange], state([
      receivable({ dueDate: "2026-04-01", cycleEndDate: "2026-06-14" }),
      receivable({ dueDate: "2026-04-01", cycleEndDate: "2026-07-31", status: "cancelled" }),
    ]), "2026-06-15");
    expect(result.blockers.some(blocker => blocker.code === "AMD_FORMULA_CROSSES_BILLED_CYCLE")).toBe(false);
  });
});
