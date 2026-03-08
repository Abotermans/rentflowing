export interface Property {
  id: string;
  name: string;
  referenceCode: string;
  address1: string;
  address2: string;
  city: string;
  postalCode: string;
  regionOrState: string;
  countryCode: string;
  locale: string;
  currencyCode: string;
  measurementSystem: "metric" | "imperial";
  propertyType: "residential" | "commercial" | "mixed-use";
  ownerName: string;
  description: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export type PropertyStatus = "active" | "inactive";
export type PropertyType = "residential" | "commercial" | "mixed-use";

export type UnitType = "apartment" | "studio" | "office" | "parking" | "storage" | "house" | "commercial-unit";
export type UnitStatus = "vacant" | "occupied" | "reserved" | "unavailable";

export interface Unit {
  id: string;
  propertyId: string;
  unitCode: string;
  unitLabel: string;
  unitType: UnitType;
  floor: number | null;
  surfaceArea: number | null;
  bedrooms: number;
  bathrooms: number;
  furnished: boolean;
  currentStatus: UnitStatus;
  baseRent: number | null;
  baseCharges: number | null;
  availableFrom: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
