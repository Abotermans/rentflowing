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
  baseRentSixMonths: number | null;
  baseRentYearly: number | null;
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

export type AdvanceAllocationMethod = 'spread-evenly' | 'fixed-monthly-reduction';
export type AdvanceAppliedTo = 'rent' | 'charges' | 'rent-and-charges';
export type AdvanceStatus = 'not-applicable' | 'scheduled' | 'active' | 'fully-consumed';
export type RentFormula = 'monthly' | 'six-months' | 'yearly';

// Checklist types
export interface MoveInChecklist {
  leaseSigned: boolean;
  firstPaymentReceived: boolean;
  guaranteeConfirmed: boolean;
  keysHandedOver: boolean;
  meterReadingCaptured: boolean;
  tenantDocumentsComplete: boolean;
}

export interface MoveOutChecklist {
  noticeConfirmed: boolean;
  moveOutDateConfirmed: boolean;
  keysReturned: boolean;
  moveOutMeterReadingCaptured: boolean;
  balanceReviewed: boolean;
  guaranteeReviewCompleted: boolean;
}

export type ReturnStatus = "pending" | "in-review" | "completed";

export const DEFAULT_MOVE_IN_CHECKLIST: MoveInChecklist = {
  leaseSigned: false, firstPaymentReceived: false, guaranteeConfirmed: false,
  keysHandedOver: false, meterReadingCaptured: false, tenantDocumentsComplete: false,
};

export const DEFAULT_MOVE_OUT_CHECKLIST: MoveOutChecklist = {
  noticeConfirmed: false, moveOutDateConfirmed: false, keysReturned: false,
  moveOutMeterReadingCaptured: false, balanceReviewed: false, guaranteeReviewCompleted: false,
};

export const MOVE_IN_CHECKLIST_LABELS: Record<keyof MoveInChecklist, string> = {
  leaseSigned: "Lease signed",
  firstPaymentReceived: "First payment received",
  guaranteeConfirmed: "Guarantee / deposit confirmed",
  keysHandedOver: "Keys handed over",
  meterReadingCaptured: "Meter reading captured",
  tenantDocumentsComplete: "Tenant documents complete",
};

export const MOVE_OUT_CHECKLIST_LABELS: Record<keyof MoveOutChecklist, string> = {
  noticeConfirmed: "Notice confirmed",
  moveOutDateConfirmed: "Move-out date confirmed",
  keysReturned: "Keys returned",
  moveOutMeterReadingCaptured: "Move-out meter reading captured",
  balanceReviewed: "Balance reviewed",
  guaranteeReviewCompleted: "Guarantee / deposit review completed",
};

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
  // Move-in fields
  moveInScheduledDate: string | null;
  moveInActualDate: string | null;
  moveInMeterReading: string | null;
  moveInChecklist: MoveInChecklist;
  // Move-out fields
  moveOutScheduledDate: string | null;
  moveOutActualDate: string | null;
  moveOutMeterReading: string | null;
  moveOutChecklist: MoveOutChecklist;
  moveOutNotes: string;
  // Keys
  keyHandoverCount: number;
  keyReturnCount: number;
  // Return
  returnStatus: ReturnStatus | null;
  returnNotes: string;

  // Rent formula
  rentFormula: RentFormula;

  // Advance payment
  hasAdvancePayment: boolean;
  advancePaymentAmount: number | null;
  advancePaymentDate: string | null;
  advanceAllocationMethod: AdvanceAllocationMethod | null;
  advanceAppliedTo: AdvanceAppliedTo | null;
  advanceAllocationStartDate: string | null;
  advanceAllocationDurationMonths: number | null;
  fixedMonthlyReductionAmount: number | null;

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

export type MoveInStatus = "not-scheduled" | "scheduled" | "completed";
export type MoveOutStatus = "not-scheduled" | "scheduled" | "completed";

export function getMoveInStatus(lease: Lease): MoveInStatus {
  if (lease.moveInActualDate) return "completed";
  if (lease.moveInScheduledDate) return "scheduled";
  return "not-scheduled";
}

export function getMoveOutStatus(lease: Lease): MoveOutStatus {
  if (lease.moveOutActualDate) return "completed";
  if (lease.moveOutScheduledDate) return "scheduled";
  return "not-scheduled";
}

export type LedgerLineType = "rent" | "charges" | "adjustment" | "advance-payment";
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
