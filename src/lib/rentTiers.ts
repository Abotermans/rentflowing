import type { Unit } from "@/types";

export interface RentTierRow {
  durationMonths: number;
  monthlyRent: number;
}

/**
 * Return every rent tier defined on a unit, including the canonical 1-month
 * tier sourced from `baseRent`, sorted ascending by duration.
 * Tiers with no monthly rent (null base rent) are omitted.
 */
export function getAllRentTiers(unit: Pick<Unit, "baseRent" | "rentTiers">): RentTierRow[] {
  const rows: RentTierRow[] = [];
  if (unit.baseRent != null) rows.push({ durationMonths: 1, monthlyRent: unit.baseRent });
  for (const t of unit.rentTiers ?? []) {
    rows.push({ durationMonths: t.durationMonths, monthlyRent: t.monthlyRent });
  }
  return rows.sort((a, b) => a.durationMonths - b.durationMonths);
}

/** Find the monthly rent for a given commitment duration, or null if not defined. */
export function getMonthlyRentForMonths(
  unit: Pick<Unit, "baseRent" | "rentTiers">,
  months: number,
): number | null {
  if (months === 1) return unit.baseRent;
  const tier = unit.rentTiers?.find(t => t.durationMonths === months);
  return tier ? tier.monthlyRent : null;
}