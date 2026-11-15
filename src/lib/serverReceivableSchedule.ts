import type { Lease, LeaseUnitAssignment, Unit } from "../types/index.ts";
import type { LeaseAmendment, LeaseAmendmentChange } from "../types/amendments.ts";
import type { ReceivableItem } from "../types/receivables.ts";
import {
  generateLeaseReceivables,
  getOpenEndedReceivableThroughDate,
  type GenerateResult,
} from "./leaseReceivables.ts";
import { getRentFormulaSegmentStart } from "./leaseCycles.ts";
import { getAmendmentChanges, getEffectiveLeaseTerms, getLeaseAmendments } from "./amendments.ts";
import { computeLeaseIndexation } from "./leaseIndexation.ts";

type DatabaseRow = Record<string, unknown>;

function fromDatabaseRow<T>(row: DatabaseRow): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value,
  ])) as T;
}

export interface ServerScheduleInput {
  lease: DatabaseRow;
  assignments: DatabaseRow[];
  units: DatabaseRow[];
  amendments: DatabaseRow[];
  changes: DatabaseRow[];
  currencyCode: string;
  leadDays: number;
  businessDate: string;
  genId: (prefix: string) => string;
}

export function generateServerScheduleResult(input: ServerScheduleInput): GenerateResult {
  const lease = fromDatabaseRow<Lease>(input.lease);
  const assignments = input.assignments.map(row => fromDatabaseRow<LeaseUnitAssignment>(row));
  const units = input.units.map(row => fromDatabaseRow<Unit>(row));
  const amendments = input.amendments.map(row => fromDatabaseRow<LeaseAmendment>(row));
  const changes = input.changes.map(row => fromDatabaseRow<LeaseAmendmentChange>(row));
  const tenantIds = Array.isArray(lease.tenantIds) ? lease.tenantIds : [];
  lease.primaryTenantId = lease.billingTenantId || tenantIds[0] || "";
  lease.coTenantIds = tenantIds.filter(id => id !== lease.primaryTenantId);
  lease.unitId = assignments[0]?.unitId ?? "";
  lease.endDate = lease.endDate ?? "";

  if (!lease.primaryTenantId || assignments.length === 0) {
    return { receivables: [], unassignedCycleStarts: [], prepaymentReceipt: null, allocations: [] };
  }
  const validAmount = (value: unknown) => (typeof value === "number"
    || (typeof value === "string" && value.trim().length > 0))
    && Number.isFinite(Number(value)) && Number(value) >= 0;
  if (!Number.isInteger(lease.dueDayOfMonth) || lease.dueDayOfMonth < 1 || lease.dueDayOfMonth > 31
    || !Number.isInteger(lease.rentFormula) || lease.rentFormula < 1
    || !validAmount(input.lease.monthly_rent) || !validAmount(input.lease.monthly_charges)
    || !lease.startDate || (lease.endDate && lease.endDate < lease.startDate)) {
    throw new Error(`Lease ${lease.id} has invalid billing terms; check due day, formula, amounts, and dates.`);
  }
  const segmentStart = getRentFormulaSegmentStart(lease, input.businessDate, amendments, changes);
  const appliedAmendments = amendments
    .filter(amendment => amendment.leaseId === lease.id
      && (amendment.status === "active" || amendment.status === "ended")
      && amendment.effectiveDate <= input.businessDate);
  const appliedIds = new Set(appliedAmendments.map(amendment => amendment.id));
  const appliedChanges = changes.filter(change => appliedIds.has(change.amendmentId));
  for (const change of appliedChanges) {
    if (change.fieldName === "baseMonthlyRentTotal" || change.fieldName === "baseMonthlyChargesTotal") {
      if (!validAmount(change.oldValue) || !validAmount(change.newValue)) {
        throw new Error(`Historical ${change.fieldName} terms are missing from an applied amendment.`);
      }
    }
    if (change.fieldName !== "indexationSettings") continue;
    const required = [
      "indexationEnabled", "indexationBaseDate", "indexationBaseIndex",
      "indexationCurrentIndex", "indexationCapPercent", "indexationRoundingMode",
    ];
    const validSnapshot = (value: unknown) => value && typeof value === "object" && !Array.isArray(value)
      && required.every(key => Object.prototype.hasOwnProperty.call(value, key))
      && typeof (value as Partial<Lease>).indexationEnabled === "boolean";
    if (!validSnapshot(change.oldValue) || !validSnapshot(change.newValue)) {
      throw new Error("Historical indexation terms are missing from an applied amendment.");
    }
  }
  const orderedChanges = getLeaseAmendments(lease.id, appliedAmendments)
    .flatMap(amendment => getAmendmentChanges(amendment.id, appliedChanges));
  const firstRentChange = orderedChanges.find(change => ["unitAssignments", "unitRentShare", "baseMonthlyRentTotal"].includes(change.fieldName));
  const firstChargesChange = orderedChanges.find(change => ["unitAssignments", "unitChargesShare", "baseMonthlyChargesTotal"].includes(change.fieldName));
  const hasRecordedBase = (amendmentId: string | undefined, fieldName: string) =>
    orderedChanges.some(change => change.amendmentId === amendmentId
      && change.fieldName === fieldName && validAmount(change.oldValue));
  if (firstRentChange && !hasRecordedBase(firstRentChange.amendmentId, "baseMonthlyRentTotal")
    && assignments.some(assignment => !validAmount(assignment.rentShare))) {
    throw new Error(`Lease ${lease.id} has missing unit rent shares; historical rent cannot be reconstructed.`);
  }
  if (firstChargesChange && !hasRecordedBase(firstChargesChange.amendmentId, "baseMonthlyChargesTotal")
    && assignments.some(assignment => !validAmount(assignment.chargesShare))) {
    throw new Error(`Lease ${lease.id} has missing unit charges shares; historical charges cannot be reconstructed.`);
  }
  const termState = {
    leases: [lease], units, leaseUnitAssignments: assignments,
    amendments: appliedAmendments, amendmentChanges: appliedChanges,
  };
  return generateLeaseReceivables(lease, {
    currencyCode: input.currencyCode,
    genId: input.genId,
    today: input.businessDate,
    leadDays: input.leadDays,
    assignments,
    units,
    scheduleStartDate: segmentStart,
    leaseForCycle: cycle => {
      let cycleLease = lease;
      if (appliedAmendments.length > 0) {
        const terms = getEffectiveLeaseTerms(lease.id, cycle.startDate, termState);
        if (!terms) throw new Error(`Historical lease terms are missing for ${cycle.startDate}.`);
        cycleLease = {
          ...lease,
          monthlyRent: terms.monthlyRent,
          monthlyCharges: terms.monthlyCharges,
          primaryTenantId: terms.billingTenantId || terms.primaryTenantId,
          indexationEnabled: terms.indexationEnabled,
          indexationFrequency: terms.indexationFrequency,
          indexationBaseDate: terms.indexationBaseDate,
          indexationBaseIndex: terms.indexationBaseIndex,
          indexationCurrentIndex: terms.indexationCurrentIndex,
          indexationCapPercent: terms.indexationCapPercent,
          indexationRoundingMode: terms.indexationRoundingMode,
        };
      }
      const indexation = computeLeaseIndexation(cycleLease, cycle.startDate);
      if (cycleLease.monthlyRent > 0 &&
          (indexation.reason === "missing-index-values" || indexation.reason === "missing-base-date")) {
        throw new Error(`Indexation cannot be calculated for lease ${lease.id} on ${cycle.startDate}: ${indexation.reason}.`);
      }
      return cycleLease;
    },
    openEndedThroughDate: lease.endDate
      ? undefined
      : getOpenEndedReceivableThroughDate(input.businessDate, lease.rentFormula, segmentStart, input.leadDays, lease.dueDayOfMonth),
  });
}

export function generateServerSchedule(input: ServerScheduleInput): ReceivableItem[] {
  return generateServerScheduleResult(input).receivables;
}

export function toServerReceivableRow(item: ReceivableItem, portfolioId: string): DatabaseRow {
  const row: DatabaseRow = { portfolio_id: portfolioId };
  for (const [key, value] of Object.entries(item)) {
    if (key === "createdAt" || key === "updatedAt" || value === undefined) continue;
    row[key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] = value;
  }
  return row;
}
