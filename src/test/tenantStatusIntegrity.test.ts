import { describe, expect, it } from "vitest";
import { canChangeTenantStatus } from "@/lib/integrity/tenantIntegrity";
import type { IntegrityState } from "@/lib/integrity/types";
import type { Lease } from "@/types";

function state(stages: Lease["lifecycleStage"][]): IntegrityState {
  return {
    leases: stages.map(lifecycleStage => ({
      primaryTenantId: "tenant-1", coTenantIds: [], lifecycleStage,
    })) as Lease[],
    receivableItems: [], guarantees: [],
  } as unknown as IntegrityState;
}

describe("tenant status follows linked leases", () => {
  it("keeps a tenant active when any linked lease is active", () => {
    const leases = state(["active", "ended"]);
    expect(canChangeTenantStatus("tenant-1", "applicant", leases).blockers[0]?.code)
      .toBe("TENANT_LEASE_STATUS_MISMATCH");
    expect(canChangeTenantStatus("tenant-1", "former", leases).allowed).toBe(false);
    expect(canChangeTenantStatus("tenant-1", "active", leases).allowed).toBe(true);
  });

  it("uses applicant for only pre-active leases and former for only closed leases", () => {
    expect(canChangeTenantStatus("tenant-1", "former", state(["draft", "pending-signature"])).allowed)
      .toBe(false);
    expect(canChangeTenantStatus("tenant-1", "applicant", state(["signed", "ended"])).allowed)
      .toBe(true);
    expect(canChangeTenantStatus("tenant-1", "former", state(["ended", "terminated"])).allowed)
      .toBe(true);
  });

  it("allows onboarding a tenant before any lease is linked", () => {
    expect(canChangeTenantStatus("tenant-1", "applicant", state([])).allowed).toBe(true);
    expect(canChangeTenantStatus("tenant-1", "active", state([])).allowed).toBe(true);
  });
});
