import type { Lease } from "@/types";

export type PricingMode = "separated" | "flat-charges" | "all-inclusive";

export const PRICING_MODES: readonly PricingMode[] = ["separated", "flat-charges", "all-inclusive"];

/**
 * Resolve the effective pricing mode of a lease. Falls back to a derivation
 * from the legacy `chargesBillingMode` when the explicit field is missing.
 */
export function getPricingMode(lease: Pick<Lease, "pricingMode" | "chargesBillingMode">): PricingMode {
  if (lease.pricingMode) return lease.pricingMode;
  // Legacy mapping: flat-rate ⇒ flat-charges, otherwise separated. We do NOT
  // upgrade any legacy lease to "all-inclusive" automatically.
  return lease.chargesBillingMode === "flat-rate" ? "flat-charges" : "separated";
}

export function isAllInclusive(lease: Pick<Lease, "pricingMode" | "chargesBillingMode">): boolean {
  return getPricingMode(lease) === "all-inclusive";
}

/**
 * Whether the lease defines a contractual charges line. False for
 * all-inclusive leases (charges exist analytically only).
 */
export function hasContractualCharges(lease: Pick<Lease, "pricingMode" | "chargesBillingMode">): boolean {
  return getPricingMode(lease) !== "all-inclusive";
}

/**
 * The single contractual amount the tenant owes per month. For all-inclusive
 * leases this is just `monthlyRent` (charges are bundled in). For every
 * other mode it is `monthlyRent + monthlyCharges`.
 */
export function getContractualMonthlyAmount(
  lease: Pick<Lease, "monthlyRent" | "monthlyCharges" | "pricingMode" | "chargesBillingMode">,
): number {
  if (isAllInclusive(lease)) return lease.monthlyRent ?? 0;
  return (lease.monthlyRent ?? 0) + (lease.monthlyCharges ?? 0);
}