import { describe, expect, it } from "vitest";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

const amendment = {
  id: "am-1", leaseId: "lease-1", effectiveDate: "2026-06-15", status: "draft",
} as LeaseAmendment;

const state = {
  properties: [{ id: "property-1", countryCode: "BE" }],
  units: [{ id: "unit-1", propertyId: "property-1", unitType: "apartment", unitCode: "A1" }],
  leases: [{ id: "lease-1", propertyId: "property-1", lifecycleStage: "active",
    startDate: "2026-01-01", endDate: "2026-12-31" }],
  leaseUnitAssignments: [{ leaseId: "lease-1", unitId: "unit-1",
    startDate: "2026-01-01", endDate: null }],
  receivableItems: [], amendments: [amendment],
} as unknown as IntegrityState;

function change(fieldName: LeaseAmendmentChange["fieldName"], unitId?: string,
  changeType: LeaseAmendmentChange["changeType"] = "set"): LeaseAmendmentChange {
  return {
    id: "change-1", amendmentId: amendment.id, fieldName, changeType,
    oldValue: null, newValue: 100,
    metadata: unitId ? { unitId } : undefined,
    createdAt: "2026-06-01", updatedAt: "2026-06-01",
  };
}

function blockerCodes(changes: LeaseAmendmentChange[]): string[] {
  return validateAmendment(amendment, changes, state, amendment.effectiveDate)
    .blockers.map(blocker => blocker.code);
}

describe("amendment unit references", () => {
  it("blocks missing references instead of silently ignoring unit changes", () => {
    for (const field of ["unitAssignments", "unitRentShare", "unitChargesShare", "unitEndDate"] as const) {
      expect(blockerCodes([change(field)])).toContain("AMD_UNIT_REFERENCE_MISSING");
    }
  });

  it("blocks changes targeting a unit not assigned on the effective date", () => {
    for (const field of ["unitRentShare", "unitChargesShare", "unitEndDate"] as const) {
      expect(blockerCodes([change(field, "legacy-unit")])).toContain("AMD_UNIT_NOT_ASSIGNED");
    }
    expect(blockerCodes([change("unitAssignments", "legacy-unit", "remove")]))
      .toContain("AMD_UNIT_NOT_ASSIGNED");
  });

  it("blocks unknown assignment actions and allows an existing unit share change", () => {
    expect(blockerCodes([change("unitAssignments", "unit-1", "set")]))
      .toContain("AMD_UNIT_CHANGE_INVALID");
    expect(blockerCodes([change("unitRentShare", "unit-1")]))
      .not.toContain("AMD_UNIT_NOT_ASSIGNED");
  });

  it("rejects absent or nonnumeric rent and charges while allowing explicit zero", () => {
    for (const value of [null, "", " ", "bad", -1, Number.NaN, []]) {
      for (const [field, code] of [
        ["baseMonthlyRentTotal", "AMD_INVALID_RENT"],
        ["baseMonthlyChargesTotal", "AMD_INVALID_CHARGES"],
        ["unitRentShare", "AMD_INVALID_UNIT_AMOUNT"],
        ["unitChargesShare", "AMD_INVALID_UNIT_AMOUNT"],
      ] as const) {
        const item = change(field, field.startsWith("unit") ? "unit-1" : undefined);
        expect(blockerCodes([{ ...item, newValue: value }])).toContain(code);
      }
    }
    for (const field of ["baseMonthlyRentTotal", "baseMonthlyChargesTotal",
      "unitRentShare", "unitChargesShare"] as const) {
      const item = change(field, field.startsWith("unit") ? "unit-1" : undefined);
      expect(blockerCodes([{ ...item, newValue: 0 }]))
        .not.toContain(field === "baseMonthlyRentTotal" ? "AMD_INVALID_RENT"
          : field === "baseMonthlyChargesTotal" ? "AMD_INVALID_CHARGES" : "AMD_INVALID_UNIT_AMOUNT");
    }
  });
});
