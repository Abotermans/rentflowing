import type { TranslationKey } from "@/i18n/translations";

export function formatCurrency(amount: number, currencyCode: string = "EUR", locale: string = "fr-FR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
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