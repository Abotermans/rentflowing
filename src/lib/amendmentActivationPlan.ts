import type { Lease, LeaseUnitAssignment, Tenant } from "../types/index.ts";
import type { LeaseAmendment, LeaseAmendmentChange } from "../types/amendments.ts";
import type { ReceivableItem } from "../types/receivables.ts";
import type { IntegrityState } from "./integrity/types.ts";
import { canActivateAmendment } from "./integrity/amendmentIntegrity.ts";
import { getAmendmentChanges, getEffectiveLeaseTerms } from "./amendments.ts";
import { applyAssignmentShareChange, assignmentIsActiveOn } from "./leaseAssignments.ts";
import {
  generateLeaseReceivables,
  getOpenEndedReceivableThroughDate,
  reconcileActivatedAmendmentReceivables,
} from "./leaseReceivables.ts";
import { deriveTenantStatusFromLeases } from "./tenantStatus.ts";

export interface AmendmentActivationPlan {
  lease: Lease;
  originalLeaseUpdatedAt: string;
  assignments: LeaseUnitAssignment[];
  amendments: LeaseAmendment[];
  receivables: ReceivableItem[];
  tenants: Tenant[];
  changedAssignments: { item: LeaseUnitAssignment; expectedUpdatedAt?: string }[];
  changedAmendments: { item: LeaseAmendment; expectedUpdatedAt: string }[];
  removedReceivables: ReceivableItem[];
  freshReceivables: ReceivableItem[];
  changedTenants: { item: Tenant; expectedUpdatedAt: string }[];
}

export type AmendmentActivationResult =
  | { ok: true; plan: AmendmentActivationPlan }
  | { ok: false; reason: string };

export function planAmendmentActivation(
  id: string,
  state: IntegrityState,
  options: {
    businessDate: string;
    timestamp: string;
    genId: (prefix?: string) => string;
    receivableLeadDays: number;
    pending?: { amendment: LeaseAmendment; changes: LeaseAmendmentChange[] };
  },
): AmendmentActivationResult {
  const { businessDate, timestamp: ts, genId, receivableLeadDays, pending } = options;
  const workingAmendments = pending
    ? [...state.amendments.filter(a => a.id !== id), pending.amendment]
    : state.amendments;
  const workingChanges = pending
    ? [...state.amendmentChanges.filter(c => c.amendmentId !== id), ...pending.changes]
    : state.amendmentChanges;
  const am = workingAmendments.find(a => a.id === id);
  if (!am) return { ok: false, reason: "Amendment not found" };
  if (am.effectiveDate && am.effectiveDate > businessDate) {
    return { ok: false, reason: "Effective date is in the future — schedule instead" };
  }
  const validation = canActivateAmendment(
    id,
    { ...state, amendments: workingAmendments, amendmentChanges: workingChanges },
    businessDate,
  );
  if (!validation.allowed) {
    return { ok: false, reason: validation.blockers.map(b => b.message).join(". ") };
  }

  const eff = am.effectiveDate;
  const priorDay = new Date(`${eff}T00:00:00Z`);
  priorDay.setUTCDate(priorDay.getUTCDate() - 1);
  const dayBefore = priorDay.toISOString().slice(0, 10);
  const changes = getAmendmentChanges(id, workingChanges);
  const leaseAssignments = state.leaseUnitAssignments.filter(item => item.leaseId === am.leaseId);
  const validAmount = (value: unknown) =>
    (typeof value === "number" || (typeof value === "string" && value.trim().length > 0))
    && Number.isFinite(Number(value)) && Number(value) >= 0;
  const validRecordedBase = (fieldName: LeaseAmendmentChange["fieldName"]) =>
    changes.some(change => change.fieldName === fieldName
      && validAmount(change.oldValue) && validAmount(change.newValue));
  if (changes.some(change => change.fieldName === "unitAssignments" || change.fieldName === "unitRentShare")
    && !validRecordedBase("baseMonthlyRentTotal")
    && leaseAssignments.some(item => !validAmount(item.rentShare))) {
    return { ok: false, reason: "Unit rent shares are missing. Set them before changing unit pricing or record the previous and new total rent." };
  }
  if (changes.some(change => change.fieldName === "unitAssignments" || change.fieldName === "unitChargesShare")
    && !validRecordedBase("baseMonthlyChargesTotal")
    && leaseAssignments.some(item => !validAmount(item.chargesShare))) {
    return { ok: false, reason: "Unit charges shares are missing. Set them before changing unit pricing or record the previous and new total charges." };
  }
  const rentFormulaChange = changes.find(c => c.fieldName === "rentFormula");
  const nextRentFormula = rentFormulaChange
    ? Math.max(1, Math.floor(Number(rentFormulaChange.newValue) || 1)) as Lease["rentFormula"]
    : null;

  let nextAssignments: LeaseUnitAssignment[] = [...state.leaseUnitAssignments];
  for (const change of changes) {
    if (change.fieldName === "unitAssignments" && change.changeType === "add" && change.metadata?.unitId) {
      const value = (change.newValue ?? {}) as { rentShare?: number; chargesShare?: number };
      nextAssignments.push({
        id: genId("lua"), leaseId: am.leaseId, unitId: change.metadata.unitId,
        startDate: eff, endDate: change.metadata.endDate ?? null,
        rentShare: Number(value.rentShare ?? 0), chargesShare: Number(value.chargesShare ?? 0),
        notes: `Added by amendment ${am.amendmentNumber}`, createdAt: ts, updatedAt: ts,
      });
    } else if (change.fieldName === "unitAssignments" && change.changeType === "remove" && change.metadata?.unitId) {
      nextAssignments = nextAssignments.map(a =>
        a.leaseId === am.leaseId && a.unitId === change.metadata!.unitId && assignmentIsActiveOn(a, eff)
          ? { ...a, endDate: dayBefore, updatedAt: ts } : a,
      );
    } else if (change.fieldName === "unitEndDate" && change.metadata?.unitId) {
      const endDate = String(change.newValue ?? "");
      nextAssignments = nextAssignments.map(a =>
        a.leaseId === am.leaseId && a.unitId === change.metadata!.unitId && assignmentIsActiveOn(a, eff)
          ? { ...a, endDate: endDate || null, updatedAt: ts } : a,
      );
    } else if (change.fieldName === "unitRentShare" && change.metadata?.unitId) {
      nextAssignments = applyAssignmentShareChange(
        nextAssignments, am.leaseId, change.metadata.unitId, eff,
        "rentShare", Number(change.newValue) || 0, ts, () => genId("lua"),
      );
    } else if (change.fieldName === "unitChargesShare" && change.metadata?.unitId) {
      nextAssignments = applyAssignmentShareChange(
        nextAssignments, am.leaseId, change.metadata.unitId, eff,
        "chargesShare", Number(change.newValue) || 0, ts, () => genId("lua"),
      );
    }
  }

  const previousActives = workingAmendments
    .filter(a => a.leaseId === am.leaseId && a.id !== id && a.status === "active")
    .slice()
    .sort((x, y) => x.effectiveDate !== y.effectiveDate
      ? y.effectiveDate.localeCompare(x.effectiveDate)
      : y.amendmentNumber - x.amendmentNumber);
  const supersededId = previousActives[0]?.id ?? am.supersedesAmendmentId ?? null;
  const endedIds = new Set(previousActives.map(a => a.id));
  const nextAmendments = workingAmendments.map(a => {
    if (a.id === id) return { ...a, status: "active" as const, supersedesAmendmentId: supersededId, updatedAt: ts };
    if (endedIds.has(a.id)) return { ...a, status: "ended" as const, updatedAt: ts };
    return a;
  });

  const lease = state.leases.find(l => l.id === am.leaseId);
  if (!lease) return { ok: false, reason: "Lease not found" };
  const terms = getEffectiveLeaseTerms(am.leaseId, businessDate, {
    leases: state.leases, units: state.units, leaseUnitAssignments: nextAssignments,
    amendments: nextAmendments, amendmentChanges: workingChanges,
  });
  if (!terms) return { ok: false, reason: "Effective lease terms could not be calculated" };
  const activeEnds = nextAssignments
    .filter(a => a.leaseId === am.leaseId && assignmentIsActiveOn(a, eff) && !!a.endDate)
    .map(a => a.endDate as string);
  const derivedEnd = activeEnds.length > 0
    ? activeEnds.reduce((max, date) => date > max ? date : max, activeEnds[0])
    : terms.endDate;
  const tenantIds = [...new Set((changes.some(change => change.fieldName === "tenantIds")
    ? terms.tenantIds
    : [terms.primaryTenantId, ...terms.coTenantIds]).filter(Boolean))];
  const billingTenantId = tenantIds.includes(terms.billingTenantId)
    ? terms.billingTenantId : tenantIds[0] ?? "";
  const patched: Lease = {
    ...lease,
    tenantIds,
    billingTenantId,
    monthlyRent: terms.monthlyRent ?? lease.monthlyRent,
    monthlyCharges: terms.monthlyCharges ?? lease.monthlyCharges,
    endDate: derivedEnd,
    depositOrGuaranteeAmount: terms.depositAmount,
    noticePeriodText: terms.noticePeriodText,
    rentFormula: nextRentFormula ?? terms.rentFormula ?? lease.rentFormula,
    indexationEnabled: terms.indexationEnabled ?? lease.indexationEnabled ?? false,
    indexationFrequency: terms.indexationFrequency ?? lease.indexationFrequency ?? "yearly",
    indexationBaseDate: terms.indexationBaseDate ?? null,
    indexationBaseIndex: terms.indexationBaseIndex ?? null,
    indexationCurrentIndex: terms.indexationCurrentIndex ?? null,
    indexationCapPercent: terms.indexationCapPercent ?? null,
    indexationRoundingMode: terms.indexationRoundingMode ?? lease.indexationRoundingMode ?? "nearest-cent",
    indexationNotes: terms.indexationNotes ?? lease.indexationNotes ?? "",
    hasAdvancePayment: nextRentFormula ? false : lease.hasAdvancePayment,
    advancePaymentAmount: nextRentFormula ? null : lease.advancePaymentAmount,
    advancePaymentDate: nextRentFormula ? null : lease.advancePaymentDate,
    advanceAllocationMethod: nextRentFormula ? null : lease.advanceAllocationMethod,
    advanceAppliedTo: nextRentFormula ? null : lease.advanceAppliedTo,
    advanceAllocationStartDate: nextRentFormula ? null : lease.advanceAllocationStartDate,
    advanceAllocationDurationMonths: nextRentFormula ? null : lease.advanceAllocationDurationMonths,
    fixedMonthlyReductionAmount: nextRentFormula ? null : lease.fixedMonthlyReductionAmount,
    primaryTenantId: billingTenantId,
    coTenantIds: tenantIds.filter(tenantId => tenantId !== billingTenantId),
    updatedAt: ts,
  };

  const property = state.properties.find(p => p.id === patched.propertyId);
  const regeneratedResult = generateLeaseReceivables(patched, {
    currencyCode: property?.currencyCode ?? "EUR", genId, today: ts,
    leadDays: receivableLeadDays,
    assignments: nextAssignments.filter(a => a.leaseId === patched.id),
    units: state.units,
    scheduleStartDate: nextRentFormula ? eff : undefined,
    openEndedThroughDate: patched.endDate ? undefined : getOpenEndedReceivableThroughDate(
      ts, patched.rentFormula, nextRentFormula ? eff : patched.startDate,
      receivableLeadDays, patched.dueDayOfMonth,
    ),
  });
  if (regeneratedResult.unassignedCycleStarts.length) {
    return {
      ok: false,
      reason: `No main unit is assigned for billing cycle ${regeneratedResult.unassignedCycleStarts[0]}. Check the amendment unit dates.`,
    };
  }
  const regenerated = regeneratedResult.receivables;
  const { nextReceivables, removedReceivables, freshReceivables } = reconcileActivatedAmendmentReceivables(
    state.receivableItems, regenerated, patched.id, eff,
    new Set(state.allocations.map(allocation => allocation.receivableItemId)),
  );

  const oldAssignmentsById = new Map(state.leaseUnitAssignments
    .filter(a => a.leaseId === am.leaseId).map(item => [item.id, item]));
  const changedAssignments = nextAssignments.filter(item => {
    if (item.leaseId !== am.leaseId) return false;
    const prior = oldAssignmentsById.get(item.id);
    return !prior || prior.startDate !== item.startDate || prior.endDate !== item.endDate ||
      prior.rentShare !== item.rentShare || prior.chargesShare !== item.chargesShare || prior.notes !== item.notes;
  }).map(item => ({ item, expectedUpdatedAt: oldAssignmentsById.get(item.id)?.updatedAt }));
  const oldAmendmentsById = new Map(workingAmendments.map(item => [item.id, item]));
  const changedAmendments = nextAmendments
    .filter(item => item.id === id || endedIds.has(item.id))
    .map(item => ({ item, expectedUpdatedAt: oldAmendmentsById.get(item.id)!.updatedAt }));

  const affectedTenantIds = new Set([
    lease.primaryTenantId, ...lease.coTenantIds, patched.primaryTenantId, ...patched.coTenantIds,
  ]);
  const updatedLeases = state.leases.map(item => item.id === patched.id ? patched : item);
  const nextTenants = state.tenants.map(tenant => {
    if (!affectedTenantIds.has(tenant.id)) return tenant;
    const status = deriveTenantStatusFromLeases(updatedLeases.filter(
      item => item.primaryTenantId === tenant.id || item.coTenantIds.includes(tenant.id),
    ));
    return status && status !== tenant.status ? { ...tenant, status, updatedAt: ts } : tenant;
  });
  const changedTenants = nextTenants
    .map((item, index) => ({ item, expectedUpdatedAt: state.tenants[index].updatedAt, changed: item !== state.tenants[index] }))
    .filter(item => item.changed)
    .map(({ item, expectedUpdatedAt }) => ({ item, expectedUpdatedAt }));

  return { ok: true, plan: {
    lease: patched, originalLeaseUpdatedAt: lease.updatedAt,
    assignments: nextAssignments, amendments: nextAmendments,
    receivables: nextReceivables, tenants: nextTenants,
    changedAssignments, changedAmendments,
    removedReceivables, freshReceivables, changedTenants,
  } };
}
