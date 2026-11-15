import { describe, expect, it } from "vitest";
import { canRenewLease } from "@/lib/integrity/leaseIntegrity";
import { buildRenewedLease } from "@/lib/leaseRenewal";
import type { IntegrityState } from "@/lib/integrity/types";
import type { Lease } from "@/types";

const oldEnd = "2026-06-30";
const newEnd = "2026-12-31";

function state(otherStart: string, assignedUntil = oldEnd): IntegrityState {
  return {
    leases: [
      { id: "renewing", propertyId: "property", lifecycleStage: "active", endDate: oldEnd },
      { id: "other", leaseReference: "OTHER-1", lifecycleStage: "signed" },
    ],
    units: [{ id: "unit", unitCode: "A-1" }],
    leaseUnitAssignments: [
      { leaseId: "renewing", unitId: "unit", startDate: "2025-01-01", endDate: assignedUntil },
      { leaseId: "other", unitId: "unit", startDate: otherStart, endDate: "2027-06-30" },
    ],
  } as unknown as IntegrityState;
}

describe("renewal overlap validation", () => {
  it("finds a new lease after an already-expired assignment", () => {
    const result = canRenewLease("renewing", newEnd, state("2026-07-01"));
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "LEASE_RENEW_OVERLAP",
        message: expect.stringContaining("OTHER-1"),
      }),
    ]));
  });

  it("ignores a unit removed before the original lease end", () => {
    const source = state("2026-07-01", "2026-03-31");
    const result = canRenewLease("renewing", newEnd, {
      ...source,
      units: [...source.units, { id: "remaining-unit", unitCode: "A-2" }],
      leaseUnitAssignments: [...source.leaseUnitAssignments, {
        leaseId: "renewing", unitId: "remaining-unit",
        startDate: "2025-01-01", endDate: oldEnd,
      }],
    } as unknown as IntegrityState);
    expect(result.allowed).toBe(true);
  });

  it("blocks a renewal when no unit remains at the old end", () => {
    const result = canRenewLease("renewing", newEnd, state("2026-07-01", "2026-03-31"));
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LEASE_RENEW_NO_UNIT_AT_END" }),
    ]));
  });

  it("allows another assignment to begin at the new end boundary", () => {
    const result = canRenewLease("renewing", newEnd, state(newEnd));
    expect(result.allowed).toBe(true);
  });

  it("does not treat an open-ended lease as a renewal", () => {
    const source = state("2027-01-01");
    const result = canRenewLease("renewing", newEnd, {
      ...source,
      leases: [{ ...source.leases[0], endDate: "" }, source.leases[1]],
    });
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LEASE_RENEW_NO_CURRENT_END" }),
    ]));
  });

  it("rejects renewal after an actual move-out", () => {
    const source = state("2027-01-01");
    const result = canRenewLease("renewing", newEnd, {
      ...source,
      leases: [{ ...source.leases[0], moveOutActualDate: "2026-06-30" }, source.leases[1]],
    });
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LEASE_RENEW_ALREADY_MOVED_OUT" }),
    ]));
  });

  it("requires an end beyond the original term when notice shortened the lease", () => {
    const source = state("2028-01-01");
    const result = canRenewLease("renewing", newEnd, {
      ...source,
      leases: [{ ...source.leases[0], noticeGiven: true,
        preNoticeEndDate: "2027-03-31" }, source.leases[1]],
    });
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LEASE_RENEW_DATE_NOT_AFTER" }),
    ]));
  });

  it("clears notice and scheduled move-out boundaries on renewal", () => {
    const lease = {
      id: "renewing", endDate: oldEnd, noticeGiven: true,
      noticeDate: "2026-04-01", intendedMoveOutDate: oldEnd,
      preNoticeEndDate: "2027-03-31", moveOutScheduledDate: oldEnd,
      terminationReason: "notice", monthlyRent: 1200,
    } as Lease;
    expect(buildRenewedLease(lease, newEnd)).toMatchObject({
      endDate: newEnd, noticeGiven: false, noticeDate: null,
      intendedMoveOutDate: null, preNoticeEndDate: null,
      moveOutScheduledDate: null, terminationReason: null,
      monthlyRent: 1200,
    });
  });
});
