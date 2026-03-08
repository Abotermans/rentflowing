export function formatCurrency(amount: number, currencyCode: string = "EUR", locale: string = "fr-FR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string, locale: string = "fr-FR"): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

export function getUnitStatusLabel(status: string): string {
  const map: Record<string, string> = {
    vacant: "Vacant",
    occupied: "Occupied",
    reserved: "Reserved",
    unavailable: "Unavailable",
  };
  return map[status] ?? status;
}

export function getPropertyTypeLabel(type: string): string {
  const map: Record<string, string> = {
    residential: "Residential",
    commercial: "Commercial",
    "mixed-use": "Mixed Use",
  };
  return map[type] ?? type;
}

export function getUnitTypeLabel(type: string): string {
  const map: Record<string, string> = {
    apartment: "Apartment",
    studio: "Studio",
    office: "Office",
    parking: "Parking",
    storage: "Storage",
    house: "House",
    "commercial-unit": "Commercial Unit",
  };
  return map[type] ?? type;
}
