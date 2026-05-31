import { describe, it, expect } from "vitest";
import { getLeaseStatus } from "@/types";
import type { Lease } from "@/types";
import { DEFAULT_MOVE_IN_CHECKLIST, DEFAULT_MOVE_OUT_CHECKLIST } from "@/types";
import { canChangeLeaseStatus } from "@/lib/integrity/leaseIntegrity";
import { canRenewLease } from "@/lib/integrity/leaseIntegrity";
import { canChangeUnitStatus } from "@/lib/integrity/unitIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";

function makeLease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: "l1",
    leaseReference: "L-001",
    propertyId: "p1",
    unitId: "u1",
    primaryTenantId: "t1",
    coTenantIds: [],
    lifecycleStage: "active",
    startDate: "2024-01-01",
    endDate: "2099-01-01",
    monthlyRent: 1000,
    monthlyCharges: 100,
    dueDayOfMonth: 1,
    depositOrGuaranteeAmount: 1000,
    noticePeriodText: "3 months",
    signedDate: "2024-01-01",
    notes: "",
    noticeGiven: false,
    noticeDate: null,
    intendedMoveOutDate: null,
    terminationReason: null,
    moveInScheduledDate: null,
    moveInActualDate: null,
    moveInMeterReading: null,
    moveInWaterMeterReading: null,
    moveInChecklist: { ...DEFAULT_MOVE_IN_CHECKLIST },
    moveOutScheduledDate: null,
    moveOutActualDate: null,
    moveOutMeterReading: null,
    moveOutWaterMeterReading: null,
    moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST },
    moveOutNotes: "",
    keyHandoverCount: 0,
    keyReturnCount: 0,
    returnStatus: null,
    returnNotes: "",
    hasAdvancePayment: false,
    advancePaymentAmount: null,
    advancePaymentDate: null,
    advanceAllocationMethod: null,
    advanceAppliedTo: null,
    advanceAllocationStartDate: null,
    advanceAllocationDurationMonths: null,
    fixedMonthlyReductionAmount: null,
    rentFormula: 1,
    endReason: null,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    ...overrides,
  };
}

function emptyState(over: Partial<IntegrityState> = {}): IntegrityState {
  return {
    properties: [], units: [], tenants: [], leases: [], guarantees: [],
    leaseUnitAssignments: [],
    amendments: [], amendmentChanges: [],
    receivableItems: [], cashReceipts: [], allocations: [], tickets: [],
    costCategories: [], costEntries: [], allocationRules: [],
    allocationRuleUnitShares: [], costAllocationResults: [],
    ...over,
  };
}

const FUTURE = "2099-01-01";
const PAST = "2000-01-01";
const SOON = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

describe("getLeaseStatus", () => {
  it("returns draft for draft leases", () => {
    expect(getLeaseStatus(makeLease({ lifecycleStage: "draft" }))).toBe("draft");
  });
  it("returns ended for ended leases", () => {
    expect(getLeaseStatus(makeLease({ lifecycleStage: "ended" }))).toBe("ended");
  });
  it("returns terminated for terminated leases", () => {
    expect(getLeaseStatus(makeLease({ lifecycleStage: "terminated" }))).toBe("terminated");
  });
  it("returns under-notice when active and notice given", () => {
    expect(getLeaseStatus(makeLease({ noticeGiven: true }))).toBe("under-notice");
  });
  it("returns overdue-end when active and endDate is in the past", () => {
    expect(getLeaseStatus(makeLease({ endDate: PAST }))).toBe("overdue-end");
  });
  it("returns active when endDate is within 90 days (no special status)", () => {
    expect(getLeaseStatus(makeLease({ endDate: SOON }))).toBe("active");
  });
  it("returns active when far from end and no notice", () => {
    expect(getLeaseStatus(makeLease({ endDate: FUTURE }))).toBe("active");
  });
  it("prioritises notice over overdue-end", () => {
    expect(getLeaseStatus(makeLease({ noticeGiven: true, endDate: PAST }))).toBe("under-notice");
  });
});

describe("canChangeLeaseStatus → ended", () => {
  it("allows ending a clean active lease with no warnings", () => {
    const lease = makeLease();
    const result = canChangeLeaseStatus("l1", "ended", emptyState({ leases: [lease] }));
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
  it("warns about open receivables but still allows with override", () => {
    const lease = makeLease();
    const state = emptyState({
      leases: [lease],
      receivableItems: [{ id: "r1", leaseId: "l1", outstandingAmount: 500 } as any],
    });
    const result = canChangeLeaseStatus("l1", "ended", state);
    expect(result.allowed).toBe(true);
    expect(result.overrideAllowed).toBe(true);
    expect(result.warnings.some(w => w.code === "LEASE_OPEN_BALANCES")).toBe(true);
  });
  it("warns about unresolved guarantees", () => {
    const lease = makeLease();
    const state = emptyState({
      leases: [lease],
      guarantees: [{ id: "g1", leaseId: "l1", status: "active" } as any],
    });
    const result = canChangeLeaseStatus("l1", "ended", state);
    expect(result.warnings.some(w => w.code === "LEASE_UNRESOLVED_GUARANTEES")).toBe(true);
  });
  it("blocks when lease not found", () => {
    const result = canChangeLeaseStatus("missing", "ended", emptyState());
    expect(result.allowed).toBe(false);
    expect(result.blockers[0].code).toBe("LEASE_NOT_FOUND");
  });
});

describe("canChangeLeaseStatus → terminated", () => {
  it("allows termination of active lease without warnings", () => {
    const lease = makeLease();
    const result = canChangeLeaseStatus("l1", "terminated", emptyState({ leases: [lease] }));
    expect(result.allowed).toBe(true);
  });
  it("warns when terminating a non-active lease but still allows", () => {
    const lease = makeLease({ lifecycleStage: "draft" });
    const result = canChangeLeaseStatus("l1", "terminated", emptyState({ leases: [lease] }));
    expect(result.allowed).toBe(true);
    expect(result.warnings.some(w => w.code === "LEASE_NOT_ACTIVE")).toBe(true);
  });
});

describe("canChangeUnitStatus → vacant", () => {
  it("allows vacating when no active lease", () => {
    const result = canChangeUnitStatus("u1", "vacant", emptyState({ leases: [makeLease({ lifecycleStage: "ended" })] }));
    expect(result.allowed).toBe(true);
  });
  it("blocks vacating but allows override when active lease exists", () => {
    const result = canChangeUnitStatus("u1", "vacant", emptyState({ leases: [makeLease()] }));
    expect(result.allowed).toBe(false);
    expect(result.overrideAllowed).toBe(true);
    expect(result.blockers[0].code).toBe("UNIT_ACTIVE_LEASE_EXISTS");
  });
});

describe("canChangeUnitStatus → archived", () => {
  it("blocks archiving with active lease (no override)", () => {
    const result = canChangeUnitStatus("u1", "archived", emptyState({ leases: [makeLease()] }));
    expect(result.allowed).toBe(false);
    expect(result.overrideAllowed).toBe(false);
  });
  it("blocks archiving with open balances but allows override", () => {
    const state = emptyState({
      receivableItems: [{ id: "r1", unitId: "u1", outstandingAmount: 100 } as any],
    });
    const result = canChangeUnitStatus("u1", "archived", state);
    expect(result.allowed).toBe(false);
    expect(result.overrideAllowed).toBe(true);
    expect(result.blockers[0].code).toBe("UNIT_OPEN_BALANCES");
  });
  it("allows archiving when no leases and no balances", () => {
    const result = canChangeUnitStatus("u1", "archived", emptyState());
    expect(result.allowed).toBe(true);
  });
});

describe("canRenewLease", () => {
  it("blocks renewal with no new date", () => {
    const lease = makeLease();
    const r = canRenewLease("l1", "", emptyState({ leases: [lease] }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LEASE_RENEW_NO_DATE")).toBe(true);
  });
  it("blocks renewal when new date is not after current end date", () => {
    const lease = makeLease({ endDate: "2099-01-01" });
    const r = canRenewLease("l1", "2099-01-01", emptyState({ leases: [lease] }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LEASE_RENEW_DATE_NOT_AFTER")).toBe(true);
  });
  it("blocks renewal when lease is not active", () => {
    const lease = makeLease({ lifecycleStage: "ended" });
    const r = canRenewLease("l1", "2100-01-01", emptyState({ leases: [lease] }));
    expect(r.allowed).toBe(false);
    expect(r.blockers.some(b => b.code === "LEASE_NOT_ACTIVE")).toBe(true);
  });
  it("warns (but allows) when notice is active", () => {
    const lease = makeLease({ noticeGiven: true });
    const r = canRenewLease("l1", "2100-01-01", emptyState({ leases: [lease] }));
    expect(r.allowed).toBe(true);
    expect(r.warnings.some(w => w.code === "LEASE_RENEW_HAS_NOTICE")).toBe(true);
  });
  it("allows clean renewal", () => {
    const lease = makeLease();
    const r = canRenewLease("l1", "2100-06-01", emptyState({ leases: [lease] }));
    expect(r.allowed).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
});
