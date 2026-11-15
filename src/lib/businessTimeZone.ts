import { calendarDateISO } from "./calendarToday.ts";

export const DEFAULT_BUSINESS_TIME_ZONE = "Europe/Brussels";

const COUNTRY_TIME_ZONES: Record<string, string> = {
  AT: "Europe/Vienna",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  CZ: "Europe/Prague",
  DE: "Europe/Berlin",
  DK: "Europe/Copenhagen",
  ES: "Europe/Madrid",
  FI: "Europe/Helsinki",
  FR: "Europe/Paris",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  IT: "Europe/Rome",
  LU: "Europe/Luxembourg",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  PL: "Europe/Warsaw",
  PT: "Europe/Lisbon",
  SE: "Europe/Stockholm",
};

export const BUSINESS_TIME_ZONE_OPTIONS = [
  ...new Set([...Object.values(COUNTRY_TIME_ZONES), "Atlantic/Canary", "Atlantic/Azores"]),
].sort((a, b) => a.localeCompare(b));

export function businessTimeZoneChoices(current?: string): string[] {
  return current && !BUSINESS_TIME_ZONE_OPTIONS.includes(current)
    ? [...BUSINESS_TIME_ZONE_OPTIONS, current].sort((a, b) => a.localeCompare(b))
    : BUSINESS_TIME_ZONE_OPTIONS;
}

export function defaultBusinessTimeZone(countryCode: string): string {
  return COUNTRY_TIME_ZONES[countryCode.toUpperCase()] ?? DEFAULT_BUSINESS_TIME_ZONE;
}

export function isValidBusinessTimeZone(timeZone: string | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function propertyBusinessDateISO(
  property: { countryCode: string; timeZone?: string } | null | undefined,
  instant: Date = new Date(),
): string {
  const timeZone = property?.timeZone || defaultBusinessTimeZone(property?.countryCode ?? "BE");
  return calendarDateISO(instant, timeZone);
}
