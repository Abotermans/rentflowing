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
export type UnitStatus = "vacant" | "occupied" | "reserved" | "unavailable" | "archived";

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
  /** Free-form descriptive text shown in the unit detail. Optional. */
  description?: string;
  /**
   * Additional rent tiers for multi-month advance periods.
   * The 1-month rent lives in `baseRent`; this array carries every OTHER tier.
   * Each entry: monthly rent applied when the tenant commits to paying `durationMonths` upfront.
   */
  rentTiers: { durationMonths: number; monthlyRent: number }[];
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

export type LifecycleStage = "draft" | "active" | "ended" | "terminated";

// ===== Lease ↔ Unit assignment (multi-unit leases) =====
// A lease is a contract-level container that can cover several units of the
// same property. Each row binds one unit to one lease for a date range and
// records its role (primary residential/commercial vs ancillary parking,
// cellar, storage, …) plus an optional internal rent / charges split.
export type LeaseUnitAssignmentType =
  | "primary"
  | "ancillary"
  | "parking"
  | "cellar"
  | "storage"
  | "office-secondary"
  | "commercial-addon"
  | "other";

export const ASSIGNMENT_TYPE_LABELS: Record<LeaseUnitAssignmentType, string> = {
  primary: "Primary",
  ancillary: "Ancillary",
  parking: "Parking",
  cellar: "Cellar",
  storage: "Storage",
  "office-secondary": "Secondary office",
  "commercial-addon": "Commercial add-on",
  other: "Other",
};

/**
 * Assignment types that should NOT count toward primary occupancy KPIs
 * (parking spots, cellars, storage rooms are leased but never a "home").
 */
export const ANCILLARY_ASSIGNMENT_TYPES: ReadonlySet<LeaseUnitAssignmentType> = new Set([
  "ancillary", "parking", "cellar", "storage", "commercial-addon", "other",
]);

/** Unit types whose physical nature makes them ancillary by default. */
export const ANCILLARY_UNIT_TYPES: ReadonlySet<UnitType> = new Set([
  "parking", "storage",
]);

export function isAncillaryAssignmentType(t: LeaseUnitAssignmentType): boolean {
  return ANCILLARY_ASSIGNMENT_TYPES.has(t);
}

export function isAncillaryUnitType(u: UnitType): boolean {
  return ANCILLARY_UNIT_TYPES.has(u);
}

export interface LeaseUnitAssignment {
  id: string;
  leaseId: string;
  unitId: string;
  assignmentType: LeaseUnitAssignmentType;
  isPrimary: boolean;
  startDate: string;
  endDate: string | null;
  /** Optional internal split — share of lease-level monthly rent for this unit. */
  rentShare: number | null;
  /** Optional internal split — share of lease-level monthly charges for this unit. */
  chargesShare: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type AdvanceAllocationMethod = 'spread-evenly' | 'fixed-monthly-reduction';
export type AdvanceAppliedTo = 'rent' | 'charges' | 'rent-and-charges';
export type AdvanceStatus = 'not-applicable' | 'scheduled' | 'active' | 'fully-consumed';
/**
 * Rent formula on a lease: the number of months the rent tier covers.
 * 1 = monthly (no advance), 6 = 6-month advance, 12 = yearly advance, etc.
 */
export type RentFormula = number;

/**
 * Why a lease ended naturally (status === "ended").
 * For terminated leases, see Lease.terminationReason (free text).
 */
export type LeaseEndReason =
  | "natural-expiry"
  | "mutual-non-renewal"
  | "notice-completed"
  | "other";

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

export interface LeaseKeyItem {
  id: string;
  kind: "key" | "badge";
  label: string;
  handedOverDate: string | null;
  returnedDate: string | null;
}

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
  lifecycleStage: LifecycleStage;
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
  moveInWaterMeterReading: string | null;
  moveInChecklist: MoveInChecklist;
  // Move-out fields
  moveOutScheduledDate: string | null;
  moveOutActualDate: string | null;
  moveOutMeterReading: string | null;
  moveOutWaterMeterReading: string | null;
  moveOutChecklist: MoveOutChecklist;
  moveOutNotes: string;
  // Keys
  keyHandoverCount: number;
  keyReturnCount: number;
  keys?: LeaseKeyItem[];
  // Return
  returnStatus: ReturnStatus | null;
  returnNotes: string;

  // Rent formula
  rentFormula: RentFormula;

  // End-of-lease metadata (set when lease is marked ended or terminated)
  endReason?: LeaseEndReason | null;

  // Advance payment
  hasAdvancePayment: boolean;
  advancePaymentAmount: number | null;
  advancePaymentDate: string | null;
  advanceAllocationMethod: AdvanceAllocationMethod | null;
  advanceAppliedTo: AdvanceAppliedTo | null;
  advanceAllocationStartDate: string | null;
  advanceAllocationDurationMonths: number | null;
  fixedMonthlyReductionAmount: number | null;

  /**
   * Lead time (in days) before a cycle's start date at which the cycle's
   * rent + charges receivables are generated. Only used when
   * `rentFormula > 1`. Defaults to 15 when null/undefined.
   */
  advanceCycleLeadDays?: number | null;

  createdAt: string;
  updatedAt: string;
}

export type LeaseStatus = "draft" | "active" | "under-notice" | "overdue-end" | "ended" | "terminated";

export function getLeaseStatus(lease: Lease): LeaseStatus {
  if (lease.lifecycleStage === "draft") return "draft";
  if (lease.lifecycleStage === "ended") return "ended";
  if (lease.lifecycleStage === "terminated") return "terminated";
  // active lease
  if (lease.noticeGiven) return "under-notice";
  // Compare ISO date strings (YYYY-MM-DD) to avoid timezone drift
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  if (lease.endDate < todayISO) return "overdue-end";
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
