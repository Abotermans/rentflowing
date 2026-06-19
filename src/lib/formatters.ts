import type { TranslationKey } from "@/i18n/translations";

/**
 * Canonical money format across the app:
 *   1 790 €   (whole amounts, decimals hidden)
 *   1 790,50 €  (non-zero decimals shown, always 2 dp)
 *   -1 790 €  (negatives)
 *   1 790 £ / 1 790 $  (symbol always suffixed with NBSP, regardless of currency)
 * Decimal mark `,` and narrow no-break space grouping (fr-FR via Intl).
 */
export function formatCurrency(
  amount: number | null | undefined,
  currencyCode: string = "EUR",
  _locale: string = "fr-FR",
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const hasCents = Math.abs(amount - Math.trunc(amount)) > 0.0049;
  const number = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
    useGrouping: true,
  }).format(amount);
  const symbol = getCurrencySymbol(currencyCode);
  // U+00A0 non-breaking space between number and symbol.
  return `${number}\u00A0${symbol}`;
}

/**
 * Non-currency numeric formatter (kWh, m³, counts, etc.).
 * Grouping matches formatCurrency for visual consistency.
 */
export function formatNumber(
  value: number | null | undefined,
  opts: { decimals?: number; unit?: string } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const { decimals, unit } = opts;
  const min = decimals ?? 0;
  const max = decimals ?? (Math.abs(value - Math.trunc(value)) > 0.0049 ? 2 : 0);
  const number = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: true,
  }).format(value);
  return unit ? `${number}\u00A0${unit}` : number;
}

export function formatDate(dateStr: string, locale: string = "fr-FR"): string {
  // Europe-first: always render DD/MM/YYYY regardless of locale to keep
  // month labels unambiguous (avoids e.g. nl-BE rendering "mrt" for March).
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatPeriodMonth(periodMonth: string | null | undefined): string {
  if (!periodMonth) return "—";
  const [year, month] = periodMonth.split("-");
  return `${month}-${year}`;
}

export function formatArea(value: number, measurementSystem: "metric" | "imperial" = "metric"): string {
  if (measurementSystem === "imperial") {
    return `${Math.round(value)} sq ft`;
  }
  return `${Math.round(value)} m²`;
}

export function getCountryName(countryCode: string, locale: string = "en"): string {
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    return dn.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

export function getCurrencySymbol(currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, minimumFractionDigits: 0 })
      .formatToParts(0)
      .find(p => p.type === "currency")?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}

export const UNIT_STATUS_KEYS: Record<string, TranslationKey> = {
  vacant: "status.vacant",
  occupied: "status.occupied",
  reserved: "status.reserved",
  unavailable: "status.unavailable",
};

export function getPropertyTypeLabel(type: string): string {
  const map: Record<string, string> = {
    residential: "Residential",
    commercial: "Commercial",
    "mixed-use": "Mixed Use",
  };
  return map[type] ?? type;
}

export const UNIT_TYPE_KEYS: Record<string, TranslationKey> = {
  apartment: "units.apartment",
  studio: "units.studio",
  office: "units.office",
  parking: "units.parking",
  storage: "units.storage",
  house: "units.house",
  "commercial-unit": "units.commercialUnit",
};