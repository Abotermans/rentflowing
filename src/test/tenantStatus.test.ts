import { describe, expect, it } from "vitest";
import type { Lease } from "@/types";
import { deriveTenantStatusFromLeases } from "@/lib/tenantStatus";

const lease = (lifecycleStage: Lease["lifecycleStage"]): Pick<Lease, "lifecycleStage"> => ({
  lifecycleStage,
});

describe("deriveTenantStatusFromLeases", () => {
  it("marks a tenant active when any linked lease is active", () => {
    expect(deriveTenantStatusFromLeases([
      lease("ended"),
      lease("active"),
      lease("draft"),
    ])).toBe("active");
  });

  it("marks a tenant applicant when linked leases are not active yet", () => {
    expect(deriveTenantStatusFromLeases([
      lease("draft"),
      lease("pending-signature"),
    ])).toBe("applicant");
  });

  it("keeps a signed-only tenant as applicant until the lease becomes active", () => {
    expect(deriveTenantStatusFromLeases([lease("signed")])).toBe("applicant");
  });

  it("marks a tenant former only when all linked leases are closed", () => {
    expect(deriveTenantStatusFromLeases([
      lease("ended"),
      lease("terminated"),
    ])).toBe("former");
  });

  it("marks a former tenant applicant as soon as a new draft lease is assigned", () => {
    expect(deriveTenantStatusFromLeases([
      lease("ended"),
      lease("draft"),
    ])).toBe("applicant");
  });

  it("does not derive a status without linked leases", () => {
    expect(deriveTenantStatusFromLeases([])).toBeNull();
  });
});
