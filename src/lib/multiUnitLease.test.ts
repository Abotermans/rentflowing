import { describe, it, expect } from "vitest";
import type { Lease, LeaseUnitAssignment, Unit } from "@/types";
import { DEFAULT_MOVE_IN_CHECKLIST, DEFAULT_MOVE_OUT_CHECKLIST } from "@/types";
import {
  getLeaseAssignedUnits,
  getPrimaryLeaseUnit,
  getAncillaryLeaseUnits,
  isUnitAssignedToActiveLease,
  closeOpenAssignmentsForLease,
  migrateLegacyLeaseAssignments,
} from "./leaseAssignments";
import { getDerivedOccupancy } from "./occupancy";
import { validateLeaseUnits } from "./integrity/leaseUnitAssignmentIntegrity";
import type { IntegrityState } from "./integrity/types";

function makeLease(over: Partial<Lease> = {}): Lease {
  return {
    id: "l1", leaseReference: "L-001", propertyId: "p1", unitId: "u-apt",
    primaryTenantId: "t1", coTenantIds: [], lifecycleStage: "active",
    startDate: "2024-01-01", endDate: "2099-01-01",
    monthlyRent: 1000, monthlyCharges: 100, dueDayOfMonth: 1,
    depositOrGuaranteeAmount: null, noticePeriodText: "3m", signedDate: null, notes: "",
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: null, moveInActualDate: null, moveInMeterReading: null, moveInWaterMeterReading: null,
    moveInChecklist: { ...DEFAULT_MOVE_IN_CHECKLIST },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null,
    moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST },
    moveOutNotes: "", keyHandoverCount: 0, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
    advanceAllocationMethod: null, advanceAppliedTo: null,
    advanceAllocationStartDate: null, advanceAllocationDurationMonths: null, fixedMonthlyReductionAmount: null,
    rentFormula: 1, createdAt: "2024-01-01", updatedAt: "2024-01-01",
    ...over,
  };
}

function makeUnit(over: Partial<Unit> & { id: string }): Unit {
  return {
    id: over.id, propertyId: "p1", unitCode: over.id, unitLabel: over.id,
    unitType: "apartment", floor: 0, surfaceArea: null,
    bedrooms: 1, bathrooms: 1, furnished: false,
    currentStatus: "vacant", baseRent: 1000, rentTiers: [], baseCharges: 100,
    availableFrom: null, notes: "", createdAt: "2024-01-01", updatedAt: "2024-01-01",
    ...over,
  };
}

function makeAssignment(over: Partial<LeaseUnitAssignment> & { id: string; leaseId: string; unitId: string }): LeaseUnitAssignment {
  return {
    assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null,
    rentShare: null, chargesShare: null, notes: "",
    createdAt: "2024-01-01", updatedAt: "2024-01-01",
    ...over,
  } as LeaseUnitAssignment;
}

function emptyState(over: Partial<IntegrityState> = {}): IntegrityState {
  return {
    properties: [], units: [], tenants: [], leases: [], guarantees: [],
    leaseUnitAssignments: [], receivableItems: [], cashReceipts: [], allocations: [],
    tickets: [], costCategories: [], costEntries: [], allocationRules: [],
    allocationRuleUnitShares: [], costAllocationResults: [],
    ...over,
  };
}

describe("Multi-unit lease helpers", () => {
  const apt = makeUnit({ id: "u-apt", unitType: "apartment" });
  const parking = makeUnit({ id: "u-park", unitType: "parking" });
  const cellar = makeUnit({ id: "u-cellar", unitType: "storage" });
  const lease = makeLease();
  const assignments: LeaseUnitAssignment[] = [
    makeAssignment({ id: "a1", leaseId: "l1", unitId: "u-apt", isPrimary: true, assignmentType: "primary" }),
    makeAssignment({ id: "a2", leaseId: "l1", unitId: "u-park", isPrimary: false, assignmentType: "parking" }),
    makeAssignment({ id: "a3", leaseId: "l1", unitId: "u-cellar", isPrimary: false, assignmentType: "cellar" }),
  ];

  it("primary-first ordering and ancillary split", () => {
    const all = getLeaseAssignedUnits("l1", assignments, [apt, parking, cellar]);
    expect(all.map(r => r.unit.id)).toEqual(["u-apt", "u-park", "u-cellar"]);
    expect(getPrimaryLeaseUnit("l1", assignments, [apt, parking, cellar])?.id).toBe("u-apt");
    const anc = getAncillaryLeaseUnits("l1", assignments, [apt, parking, cellar]);
    expect(anc.map(r => r.unit.id).sort()).toEqual(["u-cellar", "u-park"]);
  });

  it("isUnitAssignedToActiveLease covers both primary and ancillary", () => {
    expect(isUnitAssignedToActiveLease("u-apt", [lease], assignments)).toBe(true);
    expect(isUnitAssignedToActiveLease("u-park", [lease], assignments)).toBe(true);
    expect(isUnitAssignedToActiveLease("u-other", [lease], assignments)).toBe(false);
  });

  it("closeOpenAssignmentsForLease sets endDate on every open row", () => {
    const closed = closeOpenAssignmentsForLease("l1", "2025-06-01", assignments, "2025-06-01");
    expect(closed.every(a => a.leaseId !== "l1" || a.endDate === "2025-06-01")).toBe(true);
  });

  it("derived occupancy: ancillary unit is occupied with role 'ancillary'", () => {
    const o = getDerivedOccupancy("u-park", "vacant", [lease], assignments);
    expect(o.derived).toBe("occupied");
    expect(o.occupancyRole).toBe("ancillary");
    const p = getDerivedOccupancy("u-apt", "vacant", [lease], assignments);
    expect(p.occupancyRole).toBe("primary");
  });

  it("migrateLegacyLeaseAssignments seeds one primary row per unmigrated lease", () => {
    const legacy = makeLease({ id: "lleg", unitId: "u-legacy" });
    const out = migrateLegacyLeaseAssignments([legacy], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ leaseId: "lleg", unitId: "u-legacy", isPrimary: true, assignmentType: "primary" });
  });
});

describe("validateLeaseUnits — scenarios D/E/F/G", () => {
  const propUnits: Unit[] = [
    makeUnit({ id: "u1", propertyId: "p1" }),
    makeUnit({ id: "u2", propertyId: "p1", unitType: "parking" }),
    makeUnit({ id: "u-other", propertyId: "p2" }),
  ];

  it("F: no primary is blocked", () => {
    const r = validateLeaseUnits(null, "p1", [
      { unitId: "u1", assignmentType: "ancillary", isPrimary: false, startDate: "2024-01-01", endDate: null, rentShare: null, chargesShare: null },
    ], { monthlyRent: 0, monthlyCharges: 0 }, emptyState({ units: propUnits }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LUA_NO_PRIMARY")).toBe(true);
  });

  it("G: two primaries is blocked", () => {
    const r = validateLeaseUnits(null, "p1", [
      { unitId: "u1", assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null, rentShare: null, chargesShare: null },
      { unitId: "u2", assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null, rentShare: null, chargesShare: null },
    ], { monthlyRent: 0, monthlyCharges: 0 }, emptyState({ units: propUnits }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LUA_MULTIPLE_PRIMARY")).toBe(true);
  });

  it("D: cross-property unit is blocked", () => {
    const r = validateLeaseUnits(null, "p1", [
      { unitId: "u1", assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null, rentShare: null, chargesShare: null },
      { unitId: "u-other", assignmentType: "parking", isPrimary: false, startDate: "2024-01-01", endDate: null, rentShare: null, chargesShare: null },
    ], { monthlyRent: 0, monthlyCharges: 0 }, emptyState({ units: propUnits }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LUA_PROPERTY_MISMATCH")).toBe(true);
  });

  it("E: unit already on another active lease is blocked", () => {
    const existingLease = makeLease({ id: "lOther" });
    const existingAssignment = makeAssignment({
      id: "aOther", leaseId: "lOther", unitId: "u2",
      isPrimary: false, assignmentType: "parking",
    });
    const r = validateLeaseUnits(null, "p1", [
      { unitId: "u1", assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null, rentShare: null, chargesShare: null },
      { unitId: "u2", assignmentType: "parking", isPrimary: false, startDate: "2024-01-01", endDate: null, rentShare: null, chargesShare: null },
    ], { monthlyRent: 0, monthlyCharges: 0 }, emptyState({
      units: propUnits, leases: [existingLease], leaseUnitAssignments: [existingAssignment],
    }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LUA_UNIT_IN_OTHER_LEASE")).toBe(true);
  });

  it("Happy path A (1 apartment) is allowed", () => {
    const r = validateLeaseUnits(null, "p1", [
      { unitId: "u1", assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null, rentShare: 1000, chargesShare: 100 },
    ], { monthlyRent: 1000, monthlyCharges: 100 }, emptyState({ units: propUnits }));
    expect(r.allowed).toBe(true);
  });

  it("Happy path B (apartment + parking) is allowed", () => {
    const r = validateLeaseUnits(null, "p1", [
      { unitId: "u1", assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null, rentShare: 900, chargesShare: 100 },
      { unitId: "u2", assignmentType: "parking", isPrimary: false, startDate: "2024-01-01", endDate: null, rentShare: 100, chargesShare: 0 },
    ], { monthlyRent: 1000, monthlyCharges: 100 }, emptyState({ units: propUnits }));
    expect(r.allowed).toBe(true);
  });

  it("Strict per-unit: missing share is blocked", () => {
    const r = validateLeaseUnits(null, "p1", [
      { unitId: "u1", assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null, rentShare: null, chargesShare: 100 },
    ], { monthlyRent: 1000, monthlyCharges: 100 }, emptyState({ units: propUnits }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LUA_SHARE_MISSING")).toBe(true);
  });

  it("Strict per-unit: negative share is blocked", () => {
    const r = validateLeaseUnits(null, "p1", [
      { unitId: "u1", assignmentType: "primary", isPrimary: true, startDate: "2024-01-01", endDate: null, rentShare: -50, chargesShare: 0 },
    ], { monthlyRent: 0, monthlyCharges: 0 }, emptyState({ units: propUnits }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LUA_SHARE_NEGATIVE")).toBe(true);
  });
});

describe("Multi-unit lease — share aggregation", () => {
  it("migrateLegacyLeaseAssignments backfills primary share from lease totals", () => {
    const legacy = makeLease({ id: "lleg", unitId: "u-legacy", monthlyRent: 1200, monthlyCharges: 150 });
    const out = migrateLegacyLeaseAssignments([legacy], []);
    expect(out[0].rentShare).toBe(1200);
    expect(out[0].chargesShare).toBe(150);
  });

  it("migrateLegacyLeaseAssignments deducts pre-seeded ancillary shares from primary", () => {
    const legacy = makeLease({ id: "lleg", unitId: "u-legacy", monthlyRent: 1200, monthlyCharges: 150 });
    const anc = makeAssignment({
      id: "a-anc", leaseId: "lleg", unitId: "u-park",
      isPrimary: false, assignmentType: "parking", rentShare: 100, chargesShare: 0,
    });
    const out = migrateLegacyLeaseAssignments([legacy], [anc]);
    const primary = out.find(a => a.isPrimary && a.leaseId === "lleg");
    expect(primary?.rentShare).toBe(1100);
    expect(primary?.chargesShare).toBe(150);
  });
});