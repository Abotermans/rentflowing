import { describe, expect, it, vi } from "vitest";
import { canChangeUnitStatus } from "@/lib/integrity/unitIntegrity";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";
import type { LeaseAmendment } from "@/types/amendments";
import { computeReceivableStatus } from "@/types/receivables";
import {
  businessTimeZoneChoices,
  defaultBusinessTimeZone,
  isValidBusinessTimeZone,
  propertyBusinessDateISO,
} from "@/lib/businessTimeZone";

describe("property business time zones", () => {
  it("defaults to the property's country and retains regional overrides", () => {
    expect(defaultBusinessTimeZone("BE")).toBe("Europe/Brussels");
    expect(defaultBusinessTimeZone("GB")).toBe("Europe/London");
    expect(defaultBusinessTimeZone("PT")).toBe("Europe/Lisbon");
    expect(businessTimeZoneChoices("Atlantic/Canary")).toContain("Atlantic/Canary");
    expect(isValidBusinessTimeZone("Europe/Brussels")).toBe(true);
    expect(isValidBusinessTimeZone("not/a-zone")).toBe(false);
  });

  it("uses the property's calendar day instead of the operator's clock", () => {
    const midnight = new Date("2026-06-30T22:30:00.000Z");
    expect(propertyBusinessDateISO({ countryCode: "BE" }, midnight)).toBe("2026-07-01");
    expect(propertyBusinessDateISO({ countryCode: "GB" }, midnight)).toBe("2026-06-30");
    expect(propertyBusinessDateISO({ countryCode: "ES", timeZone: "Atlantic/Canary" }, midnight))
      .toBe("2026-06-30");
  });

  it("tracks the chosen zone through the autumn clock change", () => {
    const instant = new Date("2026-10-25T22:30:00.000Z");
    expect(propertyBusinessDateISO({ countryCode: "BE" }, instant)).toBe("2026-10-25");
    expect(propertyBusinessDateISO({ countryCode: "FI" }, instant)).toBe("2026-10-26");
  });

  it("classifies a payment as overdue on the property's day", () => {
    const instant = new Date("2026-06-30T22:30:00.000Z");
    const receivable = {
      expectedAmount: 100,
      allocatedAmount: 0,
      outstandingAmount: 100,
      dueDate: "2026-06-30",
      status: "open" as const,
    };
    expect(computeReceivableStatus(receivable, propertyBusinessDateISO({ countryCode: "BE" }, instant)))
      .toBe("overdue");
    expect(computeReceivableStatus(receivable, propertyBusinessDateISO({ countryCode: "GB" }, instant)))
      .toBe("open");
  });

  it("checks unit status against the property's assignment day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T22:30:00.000Z"));
    try {
      const state = {
        properties: [{ id: "p1", countryCode: "BE", timeZone: "Europe/Brussels" }],
        units: [{ id: "u1", propertyId: "p1" }],
        leases: [{ id: "l1", unitId: null, lifecycleStage: "active", startDate: "2026-07-01", endDate: null }],
        leaseUnitAssignments: [{ id: "a1", leaseId: "l1", unitId: "u1", startDate: "2026-07-01", endDate: null }],
        receivableItems: [],
      } as unknown as IntegrityState;

      expect(canChangeUnitStatus("u1", "vacant", state).blockers[0]?.code).toBe("UNIT_ACTIVE_LEASE_EXISTS");
      const londonState = {
        ...state,
        properties: [{ ...state.properties[0], countryCode: "GB", timeZone: "Europe/London" }],
      } as IntegrityState;
      expect(canChangeUnitStatus("u1", "vacant", londonState).allowed).toBe(true);

      const endedState = {
        ...state,
        leases: [{ ...state.leases[0], startDate: "2026-06-01", endDate: "2026-06-30", unitId: "u1" }],
        leaseUnitAssignments: [{ ...state.leaseUnitAssignments[0], startDate: "2026-06-01", endDate: null }],
      } as IntegrityState;
      expect(canChangeUnitStatus("u1", "vacant", endedState).allowed).toBe(true);

      const legacyState = {
        ...londonState,
        leases: [{ ...state.leases[0], unitId: "u1" }],
        leaseUnitAssignments: [],
      } as IntegrityState;
      expect(canChangeUnitStatus("u1", "vacant", legacyState).allowed).toBe(true);
      expect(canChangeUnitStatus("u1", "vacant", { ...legacyState, properties: state.properties }).allowed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns about retroactive amendments on the property's day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T22:30:00.000Z"));
    try {
      const amendment = { id: "am1", leaseId: "l1", effectiveDate: "2026-06-30", status: "draft" } as LeaseAmendment;
      const state = {
        properties: [{ id: "p1", countryCode: "BE", timeZone: "Europe/Brussels" }],
        units: [{ id: "u1", propertyId: "p1", unitType: "apartment" }],
        leases: [{ id: "l1", propertyId: "p1", lifecycleStage: "active", startDate: "2026-06-01" }],
        leaseUnitAssignments: [{ leaseId: "l1", unitId: "u1", startDate: "2026-06-01", endDate: null }],
        receivableItems: [],
        amendments: [amendment],
      } as unknown as IntegrityState;
      const pastCode = "AMD_EFFECTIVE_IN_PAST";
      expect(validateAmendment(amendment, [], state).warnings.map(warning => warning.code)).toContain(pastCode);
      const londonState = {
        ...state,
        properties: [{ ...state.properties[0], countryCode: "GB", timeZone: "Europe/London" }],
      } as IntegrityState;
      expect(validateAmendment(amendment, [], londonState).warnings.map(warning => warning.code)).not.toContain(pastCode);
    } finally {
      vi.useRealTimers();
    }
  });
});
