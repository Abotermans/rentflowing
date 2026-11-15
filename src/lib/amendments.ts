import type { Lease, LeaseUnitAssignment, Unit } from "../types/index.ts";
import type {
  LeaseAmendment,
  LeaseAmendmentChange,
  EffectiveLeaseTerms,
  AmendmentStatus,
} from "../types/amendments.ts";
import { assignmentIsActiveOn, isMainLeaseUnit } from "./leaseAssignments.ts";
import type { IntegrityState } from "./integrity/types.ts";
import { validateAmendment } from "./integrity/amendmentIntegrity.ts";
import { localTodayISO } from "./calendarToday.ts";

const today = localTodayISO;

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
  units: readonly Unit[];
  leaseUnitAssignments: readonly LeaseUnitAssignment[];
  amendments: readonly LeaseAmendment[];
  amendmentChanges: readonly LeaseAmendmentChange[];
}

function originalUnitEndDates(
  lease: Lease,
  s: State,
  appliedChanges: readonly LeaseAmendmentChange[],
): Map<string, string> {
  const initialUnitIds = new Set(s.leaseUnitAssignments
    .filter(a => a.leaseId === lease.id && a.startDate <= lease.startDate)
    .map(a => a.unitId));
  const ends = new Map<string, string>();
  for (const unitId of initialUnitIds) {
    const firstChange = appliedChanges.find(c =>
      c.fieldName === "unitEndDate" && c.metadata?.unitId === unitId);
    if (firstChange?.oldValue !== undefined) {
      ends.set(unitId, String(firstChange.oldValue ?? ""));
      continue;
    }
    const rows = s.leaseUnitAssignments.filter(a => a.leaseId === lease.id && a.unitId === unitId);
    ends.set(unitId, rows.some(a => !a.endDate) ? "" : rows.reduce(
      (latest, a) => a.endDate && a.endDate > latest ? a.endDate : latest, "",
    ));
  }
  return ends;
}

function latestUnitEnd(ends: Iterable<string>): string {
  const dates = [...ends];
  return dates.some(date => !date) ? "" : dates.reduce(
    (latest, date) => date > latest ? date : latest, "",
  );
}

/** Rebuild original terms from preserved assignments and recorded pre-amendment values. */
export function getOriginalLeaseTerms(
  leaseId: string,
  s: State,
): EffectiveLeaseTerms | null {
  const lease = s.leases.find(l => l.id === leaseId);
  if (!lease) return null;
  const originalAssignments = s.leaseUnitAssignments.filter(
    a => a.leaseId === leaseId && a.startDate <= lease.startDate,
  );
  const appliedChanges = getLeaseAmendments(leaseId, s.amendments)
    .filter(a => a.status === "active" || a.status === "ended")
    .flatMap(a => getAmendmentChanges(a.id, s.amendmentChanges));
  const firstOldValue = (fieldName: LeaseAmendmentChange["fieldName"]) =>
    appliedChanges.find(c => c.fieldName === fieldName)?.oldValue;
  const rentWasAmended = appliedChanges.some(c => c.fieldName === "unitRentShare" || c.fieldName === "baseMonthlyRentTotal" || c.fieldName === "unitAssignments");
  const chargesWereAmended = appliedChanges.some(c => c.fieldName === "unitChargesShare" || c.fieldName === "baseMonthlyChargesTotal" || c.fieldName === "unitAssignments");
  const firstRentChange = appliedChanges.find(c => c.fieldName === "unitRentShare" || c.fieldName === "baseMonthlyRentTotal" || c.fieldName === "unitAssignments");
  const firstChargesChange = appliedChanges.find(c => c.fieldName === "unitChargesShare" || c.fieldName === "baseMonthlyChargesTotal" || c.fieldName === "unitAssignments");
  const firstRentBase = appliedChanges.find(c => c.amendmentId === firstRentChange?.amendmentId && c.fieldName === "baseMonthlyRentTotal");
  const firstChargesBase = appliedChanges.find(c => c.amendmentId === firstChargesChange?.amendmentId && c.fieldName === "baseMonthlyChargesTotal");
  const originalBaseRent = firstRentBase?.oldValue == null ? NaN : Number(firstRentBase.oldValue);
  const originalBaseCharges = firstChargesBase?.oldValue == null ? NaN : Number(firstChargesBase.oldValue);
  const firstEndChange = appliedChanges.find(c =>
    c.fieldName === "leaseEndDate" || c.fieldName === "unitEndDate" || c.fieldName === "unitAssignments",
  );
  const originalEnd = firstEndChange?.fieldName === "leaseEndDate" ? firstEndChange.oldValue : undefined;
  const recordedOriginalEnd = firstEndChange?.metadata?.originalLeaseEndDate;
  const originalEnds = firstEndChange?.fieldName === "unitEndDate"
    || (firstEndChange?.fieldName === "unitAssignments" && firstEndChange.changeType === "add")
    ? originalUnitEndDates(lease, s, appliedChanges) : undefined;
  const inferredOriginalEnd = originalEnds?.size ? latestUnitEnd(originalEnds.values()) : undefined;
  const originalDeposit = firstOldValue("depositAmount");
  const originalNotice = firstOldValue("noticePeriodText");
  const originalFormula = firstOldValue("rentFormula");
  const originalPrimaryTenant = firstOldValue("primaryTenantId");
  const originalCoTenants = firstOldValue("coTenantIds");
  const originalTenantIds = firstOldValue("tenantIds");
  const originalBillingTenant = firstOldValue("billingTenantId");
  const originalIndexation = firstOldValue("indexationSettings") as Partial<EffectiveLeaseTerms> | undefined;
  return {
    leaseId,
    asOfDate: lease.startDate,
    monthlyRent: Number.isFinite(originalBaseRent) ? originalBaseRent : rentWasAmended && originalAssignments.length > 0
      ? originalAssignments.reduce((sum, assignment) => sum + (assignment.rentShare ?? 0), 0)
      : lease.monthlyRent,
    monthlyCharges: Number.isFinite(originalBaseCharges) ? originalBaseCharges : chargesWereAmended && originalAssignments.length > 0
      ? originalAssignments.reduce((sum, assignment) => sum + (assignment.chargesShare ?? 0), 0)
      : lease.monthlyCharges,
    endDate: originalEnd !== undefined ? String(originalEnd ?? "")
      : recordedOriginalEnd !== undefined ? recordedOriginalEnd
      : inferredOriginalEnd !== undefined ? inferredOriginalEnd
      : lease.endDate,
    depositAmount: originalDeposit === undefined ? lease.depositOrGuaranteeAmount : originalDeposit == null ? null : Number(originalDeposit),
    noticePeriodText: originalNotice === undefined ? lease.noticePeriodText : String(originalNotice ?? ""),
    rentFormula: originalFormula === undefined ? (lease.rentFormula || 1) : Math.max(1, Number(originalFormula) || 1) as Lease["rentFormula"],
    indexationEnabled: originalIndexation?.indexationEnabled ?? lease.indexationEnabled ?? false,
    indexationFrequency: originalIndexation?.indexationFrequency ?? lease.indexationFrequency ?? "yearly",
    indexationBaseDate: originalIndexation?.indexationBaseDate !== undefined ? originalIndexation.indexationBaseDate : lease.indexationBaseDate ?? lease.startDate ?? null,
    indexationBaseIndex: originalIndexation?.indexationBaseIndex !== undefined ? originalIndexation.indexationBaseIndex : lease.indexationBaseIndex ?? null,
    indexationCurrentIndex: originalIndexation?.indexationCurrentIndex !== undefined ? originalIndexation.indexationCurrentIndex : lease.indexationCurrentIndex ?? null,
    indexationCapPercent: originalIndexation?.indexationCapPercent !== undefined ? originalIndexation.indexationCapPercent : lease.indexationCapPercent ?? null,
    indexationRoundingMode: originalIndexation?.indexationRoundingMode ?? lease.indexationRoundingMode ?? "nearest-cent",
    indexationNotes: originalIndexation?.indexationNotes ?? lease.indexationNotes ?? "",
    tenantIds: Array.isArray(originalTenantIds) ? originalTenantIds as string[] : lease.tenantIds ?? [lease.primaryTenantId, ...lease.coTenantIds].filter(Boolean),
    billingTenantId: typeof originalBillingTenant === "string" ? originalBillingTenant : lease.billingTenantId ?? lease.primaryTenantId,
    primaryTenantId: typeof originalPrimaryTenant === "string" ? originalPrimaryTenant : lease.primaryTenantId,
    coTenantIds: Array.isArray(originalCoTenants) ? originalCoTenants as string[] : [...lease.coTenantIds],
    units: originalAssignments
      .slice()
      .sort((x, y) => {
        const xu = s.units.find(u => u.id === x.unitId);
        const yu = s.units.find(u => u.id === y.unitId);
        return Number(isMainLeaseUnit(yu)) - Number(isMainLeaseUnit(xu));
      })
      .map(a => ({
        unitId: a.unitId,
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
    .sort((x, y) => {
      const xu = s.units.find(u => u.id === x.unitId);
      const yu = s.units.find(u => u.id === y.unitId);
      return Number(isMainLeaseUnit(yu)) - Number(isMainLeaseUnit(xu));
    })
    .map(a => ({
      unitId: a.unitId,
      rentShare: a.rentShare ?? 0,
      chargesShare: a.chargesShare ?? 0,
    }));
  terms = { ...terms, units: liveUnits };

  let rentTotalSource: "explicit" | "shares" | null = null;
  let chargesTotalSource: "explicit" | "shares" | null = null;
  let lastEndChange: "lease" | "unit" | null = null;
  let hasStructuralUnitChange = false;
  const datedUnitEndChanges: LeaseAmendmentChange[] = [];
  for (const am of getLeaseAmendments(leaseId, s.amendments).filter(a =>
    (a.status === "active" || a.status === "ended") && a.effectiveDate <= date,
  )) {
    const changes = getAmendmentChanges(am.id, s.amendmentChanges);
    const explicitRent = changes.some(c => c.fieldName === "baseMonthlyRentTotal");
    const explicitCharges = changes.some(c => c.fieldName === "baseMonthlyChargesTotal");
    const structuralChange = changes.some(c => c.fieldName === "unitAssignments" || c.fieldName === "unitEndDate");
    const rentShareChange = structuralChange || changes.some(c => c.fieldName === "unitRentShare");
    const chargesShareChange = structuralChange || changes.some(c => c.fieldName === "unitChargesShare");
    for (const c of changes) {
      if (c.fieldName === "unitEndDate" || c.fieldName === "unitAssignments") lastEndChange = "unit";
      if (c.fieldName === "unitAssignments") hasStructuralUnitChange = true;
      if (c.fieldName === "unitEndDate") datedUnitEndChanges.push(c);
      switch (c.fieldName) {
        case "baseMonthlyRentTotal":
          terms.monthlyRent = Number(c.newValue) || 0;
          break;
        case "baseMonthlyChargesTotal":
          terms.monthlyCharges = Number(c.newValue) || 0;
          break;
        case "leaseEndDate":
          terms.endDate = String(c.newValue ?? "");
          lastEndChange = "lease";
          break;
        case "unitEndDate":
          // Per-unit end dates are applied via live assignment rows in
          // activateAmendment. The lease-level endDate below is recomputed
          // from the live assignments after the switch.
          break;
        case "depositAmount":
          terms.depositAmount = c.newValue == null ? null : Number(c.newValue);
          break;
        case "noticePeriodText":
          terms.noticePeriodText = String(c.newValue ?? "");
          break;
        case "rentFormula":
          terms.rentFormula = Math.max(1, Number(c.newValue) || 1) as typeof terms.rentFormula;
          break;
        case "indexationSettings": {
          const value = (c.newValue ?? {}) as Partial<typeof terms>;
          terms = {
            ...terms,
            indexationEnabled: value.indexationEnabled ?? terms.indexationEnabled ?? false,
            indexationFrequency: "yearly",
            indexationBaseDate: value.indexationBaseDate !== undefined ? value.indexationBaseDate : terms.indexationBaseDate ?? null,
            indexationBaseIndex: value.indexationBaseIndex !== undefined ? (value.indexationBaseIndex == null ? null : Number(value.indexationBaseIndex)) : terms.indexationBaseIndex ?? null,
            indexationCurrentIndex: value.indexationCurrentIndex !== undefined ? (value.indexationCurrentIndex == null ? null : Number(value.indexationCurrentIndex)) : terms.indexationCurrentIndex ?? null,
            indexationCapPercent: value.indexationCapPercent !== undefined ? (value.indexationCapPercent == null ? null : Number(value.indexationCapPercent)) : terms.indexationCapPercent ?? null,
            indexationRoundingMode: value.indexationRoundingMode ?? terms.indexationRoundingMode ?? "nearest-cent",
            indexationNotes: value.indexationNotes ?? "",
          };
          break;
        }
        case "primaryTenantId":
          terms.primaryTenantId = String(c.newValue);
          break;
        case "tenantIds":
          if (Array.isArray(c.newValue)) terms.tenantIds = c.newValue as string[];
          break;
        case "billingTenantId":
          terms.billingTenantId = String(c.newValue);
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
    if (explicitRent) rentTotalSource = "explicit";
    else if (rentShareChange) rentTotalSource = "shares";
    if (explicitCharges) chargesTotalSource = "explicit";
    else if (chargesShareChange) chargesTotalSource = "shares";
  }

  // Recompute rent/charges totals from live unit shares — assignments are the
  // source of truth for per-unit pricing (strict-per-unit model).
  if (liveUnits.length > 0) {
    const sumRent = liveUnits.reduce((s2, u) => s2 + u.rentShare, 0);
    const sumCharges = liveUnits.reduce((s2, u) => s2 + u.chargesShare, 0);
    if (rentTotalSource === "shares" || (rentTotalSource === null && sumRent > 0)) terms.monthlyRent = sumRent;
    if (chargesTotalSource === "shares" || (chargesTotalSource === null && sumCharges > 0)) terms.monthlyCharges = sumCharges;
  }

  // Ended assignments still define the contractual end when the requested
  // date is after every unit has left the lease.
  const datedAssignments = s.leaseUnitAssignments
    .filter(a => a.leaseId === leaseId && a.startDate <= date && !!a.endDate);
  if (lastEndChange === "unit" && !hasStructuralUnitChange && datedUnitEndChanges.length > 0) {
    const allAppliedChanges = getLeaseAmendments(leaseId, s.amendments)
      .filter(a => a.status === "active" || a.status === "ended")
      .flatMap(a => getAmendmentChanges(a.id, s.amendmentChanges));
    const ends = originalUnitEndDates(lease, s, allAppliedChanges);
    for (const change of datedUnitEndChanges) {
      if (change.metadata?.unitId && ends.has(change.metadata.unitId)) {
        ends.set(change.metadata.unitId, String(change.newValue ?? ""));
      }
    }
    if (ends.size > 0) terms.endDate = latestUnitEnd(ends.values());
  } else if (lastEndChange === "unit" && datedAssignments.length > 0) {
    const max = datedAssignments.reduce((m, a) => ((a.endDate as string) > m ? (a.endDate as string) : m), datedAssignments[0].endDate as string);
    terms.endDate = max;
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
  "id" | "leaseId" | "amendmentNumber" | "title" | "reason" |
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
