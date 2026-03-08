export interface Property {
  id: string;
  name: string;
  address: string;
  type: "residential" | "commercial" | "mixed";
  createdAt: string;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  rentAmount: number;
}

export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emergencyContact: string;
  createdAt: string;
}

export interface Lease {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  deposit: number;
  terms: string;
}

export type LeaseStatus = "active" | "expired" | "upcoming";

export interface Payment {
  id: string;
  leaseId: string;
  amount: number;
  dueDate: string;
  paidDate: string | null;
  method: "cash" | "check" | "transfer" | "card" | null;
}

export type PaymentStatus = "paid" | "pending" | "overdue";
