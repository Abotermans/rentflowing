import type { Lease, TenantStatus } from "../types/index.ts";

type TenantLeaseStatusInput = Pick<Lease, "lifecycleStage">;

const APPLICANT_LEASE_STAGES = new Set<Lease["lifecycleStage"]>([
  "draft",
  "pending-signature",
  "signed",
]);

/**
 * Derive tenant status from linked lease lifecycle.
 * Priority is intentional: any active lease keeps the tenant active; otherwise
 * any not-yet-active lease makes them an applicant; only closed history is former.
 */
export function deriveTenantStatusFromLeases(leases: TenantLeaseStatusInput[]): TenantStatus | null {
  if (leases.length === 0) return null;
  if (leases.some(lease => lease.lifecycleStage === "active")) return "active";
  if (leases.some(lease => APPLICANT_LEASE_STAGES.has(lease.lifecycleStage))) return "applicant";
  return "former";
}
