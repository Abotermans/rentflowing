import { describe, expect, it } from "vitest";
import { getMainLeaseUnit } from "@/lib/leaseAssignments";
import { canActivateLease, canMarkSigned } from "@/lib/integrity/leaseIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";
import type { Lease, LeaseUnitAssignment, Property, Unit } from "@/types";

const apartment = { id: "apartment", propertyId: "property", unitType: "apartment", unitCode: "A01" } as Unit;
const parking = { id: "parking", propertyId: "property", unitType: "parking", unitCode: "P01" } as Unit;
const assignment = (unitId: string) => ({
  leaseId: "lease", unitId, startDate: "2099-01-01", endDate: "2099-12-31",
}) as LeaseUnitAssignment;

describe("main lease assignment", () => {
  it("does not mistake an ancillary-only assignment for a main unit", () => {
    expect(getMainLeaseUnit("lease", [assignment("parking")], [apartment, parking])).toBeUndefined();
    expect(getMainLeaseUnit("lease", [], [apartment, parking])).toBeUndefined();
  });

  it("finds a main unit alongside an ancillary assignment", () => {
    expect(getMainLeaseUnit("lease", [assignment("parking"), assignment("apartment")], [apartment, parking]))
      .toBe(apartment);
  });

  it("blocks signature and activation without a main unit on the relevant date", () => {
    const lease = {
      id: "lease", propertyId: "property", lifecycleStage: "pending-signature",
      startDate: "2099-01-01", endDate: "2099-12-31", signedDate: "2098-12-01",
      tenantIds: ["tenant"], billingTenantId: "tenant",
    } as Lease;
    const state = (assignments: LeaseUnitAssignment[]): IntegrityState => ({
      properties: [{ id: "property", timeZone: "Europe/Brussels" } as Property],
      units: [apartment, parking], leases: [lease], leaseUnitAssignments: assignments,
      tenants: [], guarantees: [], amendments: [], amendmentChanges: [], receivableItems: [],
      cashReceipts: [], allocations: [], tickets: [], costCategories: [], costEntries: [],
      allocationRules: [], allocationRuleUnitShares: [], costAllocationResults: [],
    });
    expect(canActivateLease("lease", state([])).blockers.map(item => item.code)).toContain("LEASE_NO_UNITS");
    expect(canActivateLease("lease", state([assignment("parking")])).blockers.map(item => item.code))
      .toContain("LEASE_NO_MAIN_UNIT");
    expect(canMarkSigned("lease", state([assignment("parking")])).blockers.map(item => item.code))
      .toContain("LEASE_NO_MAIN_UNIT");
    expect(canActivateLease("lease", state([assignment("parking"), assignment("apartment")])).allowed).toBe(true);
    expect(canMarkSigned("lease", state([assignment("apartment")])).allowed).toBe(true);
    expect(canMarkSigned("lease", state([{ ...assignment("apartment"), startDate: "2099-02-01" }])).allowed)
      .toBe(false);
  });
});
