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
  // Notice fields
  noticeGiven: boolean;
  noticeDate: string | null;
  intendedMoveOutDate: string | null;
  terminationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LeaseLifecycleStatus = "draft" | "active" | "under-notice" | "ending-soon" | "ended" | "terminated";

export function getLeaseLifecycleStatus(lease: Lease): LeaseLifecycleStatus {
  if (lease.leaseStatus === "draft") return "draft";
  if (lease.leaseStatus === "ended") return "ended";
  if (lease.leaseStatus === "terminated") return "terminated";
  // active lease
  if (lease.noticeGiven) return "under-notice";
  const now = new Date();
  const endDate = new Date(lease.endDate);
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  if (endDate <= in90Days) return "ending-soon";
  return "active";
}

export type LedgerLineType = "rent" | "charges" | "adjustment";
export type LedgerLineStatus = "due" | "paid" | "partially-paid" | "overdue";

export interface LedgerLine {
  id: string;
  leaseId: string;
  type: LedgerLineType;
  label: string;
  periodMonth: string; // YYYY-MM
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  remainingBalance: number;
  status: LedgerLineStatus;
}

export type PaymentMethod = "bank-transfer" | "cash" | "card" | "direct-debit" | "other";

export interface Payment {
  id: string;
  leaseId: string;
  tenantId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference: string;
  notes: string;
}

// Guarantee / Deposit
export type GuaranteeType = "cash-deposit" | "bank-guarantee" | "insurance-guarantee" | "corporate-guarantee";
export type GuaranteeStatus = "pending" | "incomplete" | "active" | "released" | "partially-retained";

export interface Guarantee {
  id: string;
  leaseId: string;
  type: GuaranteeType;
  expectedAmount: number;
  receivedAmount: number;
  status: GuaranteeStatus;
  receivedDate: string | null;
  releaseDate: string | null;
  retentionAmount: number | null;
  notes: string;
}

export function computeGuaranteeStatus(g: Pick<Guarantee, "expectedAmount" | "receivedAmount" | "releaseDate" | "retentionAmount">): GuaranteeStatus {
  if (g.releaseDate) {
    return (g.retentionAmount && g.retentionAmount > 0) ? "partially-retained" : "released";
  }
  if (g.receivedAmount <= 0) return "pending";
  if (g.receivedAmount < g.expectedAmount) return "incomplete";
  return "active";
}

export const GUARANTEE_TYPE_LABELS: Record<GuaranteeType, string> = {
  "cash-deposit": "Cash Deposit",
  "bank-guarantee": "Bank Guarantee",
  "insurance-guarantee": "Insurance Guarantee",
  "corporate-guarantee": "Corporate Guarantee",
};
