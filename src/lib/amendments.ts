import type { Lease, LeaseUnitAssignment } from "@/types";
import type {
  LeaseAmendment,
  LeaseAmendmentChange,
  EffectiveLeaseTerms,
  AmendmentStatus,
} from "@/types/amendments";
import { assignmentIsActiveOn } from "@/lib/leaseAssignments";
import type { IntegrityState } from "@/lib/integrity/types";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";

const today = () => new Date().toISOString().slice(0, 10);

/** All amendments of a lease, sorted by (effectiveDate, amendmentNumber). */
export function getLeaseAmendments(
  leaseId: string,
  amendments: readonly LeaseAmendment[],
): LeaseAmendment[] {
  return amendments
    .filter(a => a.leaseId === leaseId)
    .slice()
    .sort((x, y) => {
      if (x.effectiveDate !== y.effectiveDate) return x.effectiveDate.localeCompare(y.effectiveDate);
      return x.amendmentNumber - y.amendmentNumber;
    });
}

/** Active amendments effective on `date` (status='active' AND effectiveDate ≤ date). */
export function getActiveAmendmentsOn(
  leaseId: string,
  date: string,
  amendments: readonly LeaseAmendment[],
): LeaseAmendment[] {
  const result = getLeaseAmendments(leaseId, amendments).filter(
    a => a.status === "active" && a.effectiveDate <= date,
  );
  if (result.length > 1 && typeof console !== "undefined") {
    // Single-active invariant — surface accidental violations during development.
    console.warn(
      `[amendments] lease ${leaseId} has ${result.length} active amendments on ${date} — expected at most 1`,
    );
  }
  return result;
}

/** Convenience: the single active amendment on `date` (or null). */
export function getActiveAmendmentOn(
  leaseId: string,
  date: string,
  amendments: readonly LeaseAmendment[],
): LeaseAmendment | null {
  const list = getActiveAmendmentsOn(leaseId, date, amendments);
  if (list.length === 0) return null;
  // Latest effectiveDate / amendmentNumber wins if the invariant is briefly violated.
  return list.slice().sort((x, y) => {
    if (x.effectiveDate !== y.effectiveDate) return y.effectiveDate.localeCompare(x.effectiveDate);
    return y.amendmentNumber - x.amendmentNumber;
  })[0];
}

export function getAmendmentChanges(
  amendmentId: string,
  changes: readonly LeaseAmendmentChange[],
): LeaseAmendmentChange[] {
  return changes.filter(c => c.amendmentId === amendmentId);
}

/** Next amendment number to use for a lease (1-based, monotonically increasing). */
export function nextAmendmentNumber(
  leaseId: string,
  amendments: readonly LeaseAmendment[],
): number {
  const max = amendments
    .filter(a => a.leaseId === leaseId)
    .reduce((m, a) => Math.max(m, a.amendmentNumber), 0);
  return max + 1;
}

interface State {
  leases: readonly Lease[];
  leaseUnitAssignments: readonly LeaseUnitAssignment[];
  amendments: readonly LeaseAmendment[];
  amendmentChanges: readonly LeaseAmendmentChange[];
}

/**
 * Baseline terms = lease record + assignments that started on or before lease.startDate.
 * This is the "original contract" view, never mutated by amendments.
 */
export function getOriginalLeaseTerms(
  leaseId: string,
  s: State,
): EffectiveLeaseTerms | null {
  const lease = s.leases.find(l => l.id === leaseId);
  if (!lease) return null;
  const originalAssignments = s.leaseUnitAssignments.filter(
    a => a.leaseId === leaseId && a.startDate <= lease.startDate,
  );
  return {
    leaseId,
    asOfDate: lease.startDate,
    monthlyRent: lease.monthlyRent,
    monthlyCharges: lease.monthlyCharges,
    endDate: lease.endDate,
    depositAmount: lease.depositOrGuaranteeAmount,
    noticePeriodText: lease.noticePeriodText,
    primaryTenantId: lease.primaryTenantId,
    coTenantIds: [...lease.coTenantIds],
    units: originalAssignments
      .slice()
      .sort((x, y) => (y.isPrimary ? 1 : 0) - (x.isPrimary ? 1 : 0))
      .map(a => ({
        unitId: a.unitId,
        assignmentType: a.assignmentType,
        isPrimary: a.isPrimary,
        rentShare: a.rentShare ?? 0,
        chargesShare: a.chargesShare ?? 0,
      })),
  };
}

/**
 * Effective lease terms on `date`. Starts from the original baseline, then applies
 * every active amendment in (effectiveDate, amendmentNumber) order whose
 * effectiveDate ≤ date. Unit projection is rebuilt from the live assignment table
 * (assignment rows are authoritative once an amendment is activated).
 */
export function getEffectiveLeaseTerms(
  leaseId: string,
  date: string,
  s: State,
): EffectiveLeaseTerms | null {
  const lease = s.leases.find(l => l.id === leaseId);
  if (!lease) return null;
  const base = getOriginalLeaseTerms(leaseId, s);
  if (!base) return null;

  let terms: EffectiveLeaseTerms = { ...base, asOfDate: date };

  // Live unit projection from assignment rows active on `date`.
  const liveUnits = s.leaseUnitAssignments
    .filter(a => a.leaseId === leaseId && assignmentIsActiveOn(a, date))
    .sort((x, y) => (y.isPrimary ? 1 : 0) - (x.isPrimary ? 1 : 0))
    .map(a => ({
      unitId: a.unitId,
      assignmentType: a.assignmentType,
      isPrimary: a.isPrimary,
      rentShare: a.rentShare ?? 0,
      chargesShare: a.chargesShare ?? 0,
    }));
  terms = { ...terms, units: liveUnits };

  for (const am of getActiveAmendmentsOn(leaseId, date, s.amendments)) {
    const changes = getAmendmentChanges(am.id, s.amendmentChanges);
    for (const c of changes) {
      switch (c.fieldName) {
        case "baseMonthlyRentTotal":
          terms.monthlyRent = Number(c.newValue) || 0;
          break;
        case "baseMonthlyChargesTotal":
          terms.monthlyCharges = Number(c.newValue) || 0;
          break;
        case "leaseEndDate":
          terms.endDate = String(c.newValue);
          break;
        case "depositAmount":
          terms.depositAmount = c.newValue == null ? null : Number(c.newValue);
          break;
        case "noticePeriodText":
          terms.noticePeriodText = String(c.newValue ?? "");
          break;
        case "primaryTenantId":
          terms.primaryTenantId = String(c.newValue);
          break;
        case "coTenantIds":
          if (c.changeType === "add" && c.metadata?.tenantId) {
            if (!terms.coTenantIds.includes(c.metadata.tenantId)) {
              terms.coTenantIds = [...terms.coTenantIds, c.metadata.tenantId];
            }
          } else if (c.changeType === "remove" && c.metadata?.tenantId) {
            terms.coTenantIds = terms.coTenantIds.filter(x => x !== c.metadata!.tenantId);
          } else if (Array.isArray(c.newValue)) {
            terms.coTenantIds = c.newValue as string[];
          }
          break;
        default:
          // Unit-related changes are already represented via live assignment rows
          // because activateAmendment writes them through. clauseSummary and
          // guaranteeSummary are documentary only.
          break;
      }
    }
  }

  // Recompute rent/charges totals from live unit shares — assignments are the
  // source of truth for per-unit pricing (strict-per-unit model).
  if (liveUnits.length > 0) {
    const sumRent = liveUnits.reduce((s2, u) => s2 + u.rentShare, 0);
    const sumCharges = liveUnits.reduce((s2, u) => s2 + u.chargesShare, 0);
    if (sumRent > 0) terms.monthlyRent = sumRent;
    if (sumCharges > 0) terms.monthlyCharges = sumCharges;
  }

  return terms;
}

export function getCurrentLeaseTerms(leaseId: string, s: State): EffectiveLeaseTerms | null {
  return getEffectiveLeaseTerms(leaseId, today(), s);
}

/* ------------------------------------------------------------------ */
/* Lifecycle gating helpers — shared between dialog, row and context. */
/* ------------------------------------------------------------------ */

export type AmendmentDraftLike = Pick<
  LeaseAmendment,
  "id" | "leaseId" | "amendmentNumber" | "amendmentType" | "title" | "reason" |
  "notes" | "effectiveDate" | "signedDate" | "status" | "supersedesAmendmentId"
>;

export interface GateResult { ok: boolean; reason?: string }

export function isAmendmentEditable(am: Pick<LeaseAmendment, "status"> | null | undefined): boolean {
  if (!am) return true;
  return am.status === "draft" || am.status === "scheduled";
}

function hasMandatoryData(am: AmendmentDraftLike, changes: readonly Pick<LeaseAmendmentChange, "fieldName">[]): GateResult {
  if (!am.title?.trim()) return { ok: false, reason: "Title is required" };
  if (!am.effectiveDate) return { ok: false, reason: "Effective date is required" };
  if (changes.length === 0) return { ok: false, reason: "At least one change is required" };
  return { ok: true };
}

/** Can this amendment move to `scheduled`? Requires mandatory data + validation. */
export function canSchedule(
  am: AmendmentDraftLike,
  changes: readonly LeaseAmendmentChange[],
  s: IntegrityState,
): GateResult {
  if (am.status === "active") return { ok: false, reason: "Already active" };
  const m = hasMandatoryData(am, changes);
  if (!m.ok) return m;
  const v = validateAmendment(am as LeaseAmendment, changes, s);
  if (!v.allowed) return { ok: false, reason: v.blockers[0]?.message ?? "Validation failed" };
  return { ok: true };
}

/** Can this amendment be activated today? Requires schedule-eligibility + past/today date. */
export function canActivate(
  am: AmendmentDraftLike,
  changes: readonly LeaseAmendmentChange[],
  s: IntegrityState,
  todayISO: string = today(),
): GateResult {
  if (am.status === "active") return { ok: false, reason: "Already active" };
  const g = canSchedule(am, changes, s);
  if (!g.ok) return g;
  if (am.effectiveDate > todayISO) {
    return { ok: false, reason: "Effective date is in the future — schedule instead" };
  }
  return { ok: true };
}

/** Status the amendment should land on given today's date. */
export function resolveTargetStatus(
  requested: AmendmentStatus,
  effectiveDate: string,
  todayISO: string = today(),
): AmendmentStatus {
  if (requested === "active" && effectiveDate > todayISO) return "scheduled";
  if (requested === "scheduled" && effectiveDate <= todayISO) return "active";
  return requested;
}

export interface AmendmentImpact {
  amendmentId: string;
  before: EffectiveLeaseTerms | null;
  after: EffectiveLeaseTerms | null;
  financialDelta: { rent: number; charges: number };
  affectedUnitIds: string[];
  changedFields: string[];
}

/**
 * Compute before/after preview by simulating the amendment as active.
 * Does not mutate state.
 */
export function getLeaseAmendmentImpact(amendmentId: string, s: State): AmendmentImpact | null {
  const am = s.amendments.find(a => a.id === amendmentId);
  if (!am) return null;
  const eff = am.effectiveDate;

  const before = getEffectiveLeaseTerms(am.leaseId, eff, s);

  // Simulate: temporarily mark this amendment active in a shallow copy.
  const simulated: State = {
    ...s,
    amendments: s.amendments.map(x => (x.id === amendmentId ? { ...x, status: "active" as const } : x)),
  };
  const after = getEffectiveLeaseTerms(am.leaseId, eff, simulated);

  const changes = getAmendmentChanges(amendmentId, s.amendmentChanges);
  const affectedUnitIds = Array.from(
    new Set(changes.map(c => c.metadata?.unitId).filter((u): u is string => !!u)),
  );
  const changedFields = Array.from(new Set(changes.map(c => c.fieldName)));

  return {
    amendmentId,
    before,
    after,
    financialDelta: {
      rent: (after?.monthlyRent ?? 0) - (before?.monthlyRent ?? 0),
      charges: (after?.monthlyCharges ?? 0) - (before?.monthlyCharges ?? 0),
    },
    affectedUnitIds,
    changedFields,
  };
}