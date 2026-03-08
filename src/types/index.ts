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

export type TenantStatus = "active" | "former" | "applicant";

export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string | null;
  identificationNumber: string | null;
  currentAddress: string | null;
  status: TenantStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function getTenantFullName(t: Tenant): string {
  return `${t.firstName} ${t.lastName}`;
}

export type LeaseStatus = "draft" | "active" | "ended" | "terminated";

export interface Lease {
  id: string;
  leaseReference: string;
  propertyId: string;
  unitId: string;
  primaryTenantId: string;
  coTenantIds: string[];
  leaseStatus: LeaseStatus;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  monthlyCharges: number;
  dueDayOfMonth: number;
  depositOrGuaranteeAmount: number | null;
  noticePeriodText: string;
  signedDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
