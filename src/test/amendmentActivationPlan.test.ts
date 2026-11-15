import { describe, expect, it, vi } from "vitest";
import type { Lease, LeaseUnitAssignment, Property, Tenant, Unit } from "@/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";
import type { ReceivableItem } from "@/types/receivables";
import type { IntegrityState } from "@/lib/integrity/types";
import { planAmendmentActivation } from "@/lib/amendmentActivationPlan";
import { getEffectiveLeaseTerms } from "@/lib/amendments";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";
import {
  isCompleteAmendmentActivationResponse,
  planServerAmendmentActivation,
  toAmendmentActivationRpcArgs,
} from "@/lib/serverAmendmentActivation";
import { runDueAmendmentJob } from "@/lib/serverAmendmentJob";

const lease = {
  id: "lease-1", leaseReference: "LEASE-1", propertyId: "property-1",
  tenantIds: ["tenant-1"], billingTenantId: "tenant-1",
  primaryTenantId: "tenant-1", coTenantIds: [], unitId: "unit-1",
  lifecycleStage: "active", startDate: "2026-01-01", endDate: "2026-12-31",
  monthlyRent: 100, monthlyCharges: 20, rentFormula: 1, dueDayOfMonth: 1,
  depositOrGuaranteeAmount: null, noticePeriodText: "", hasAdvancePayment: false,
  updatedAt: "2026-04-01T00:00:00Z",
} as Lease;
const assignment = {
  id: "assignment-1", leaseId: lease.id, unitId: "unit-1",
  startDate: "2026-01-01", endDate: "2026-12-31", rentShare: 100,
  chargesShare: 20, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
} as LeaseUnitAssignment;
const amendment = {
  id: "amendment-1", leaseId: lease.id, status: "scheduled",
  effectiveDate: "2026-05-01", amendmentNumber: 1,
  supersedesAmendmentId: null, updatedAt: "2026-04-01T00:00:00Z",
} as LeaseAmendment;
const formulaChange = {
  id: "change-1", amendmentId: amendment.id, fieldName: "rentFormula",
  changeType: "replace", oldValue: 1, newValue: 6,
} as LeaseAmendmentChange;
const property = { id: "property-1", currencyCode: "EUR" } as Property;
const unit = { id: "unit-1", propertyId: property.id, unitType: "apartment", unitCode: "A1" } as Unit;
const tenant = { id: "tenant-1", status: "active", updatedAt: "2026-01-01T00:00:00Z" } as Tenant;
const existing = (id: string, dueDate: string, allocatedAmount = 0) => ({
  id, leaseId: lease.id, propertyId: property.id, unitId: unit.id,
  origin: "lease-schedule", dueDate, periodMonth: dueDate.slice(0, 7),
  status: allocatedAmount ? "partial" : "open", allocatedAmount,
  outstandingAmount: allocatedAmount ? 50 : 100, expectedAmount: 100,
  itemType: "rent", currencyCode: "EUR", updatedAt: "2026-04-01T00:00:00Z",
}) as ReceivableItem;

function state(changes: LeaseAmendmentChange[] = [formulaChange]): IntegrityState {
  return {
    properties: [property], units: [unit], tenants: [tenant], leases: [lease],
    guarantees: [], leaseUnitAssignments: [assignment], amendments: [amendment],
    amendmentChanges: changes,
    receivableItems: [existing("old", "2026-04-01"), existing("replace", "2026-05-01"), existing("protected", "2026-06-01", 50)],
    cashReceipts: [], allocations: [], tickets: [], costCategories: [], costEntries: [],
    allocationRules: [], allocationRuleUnitShares: [], costAllocationResults: [],
  };
}

function serverRows() {
  return {
    properties: [{ id: property.id, currency_code: "EUR" }],
    units: [{ id: unit.id, property_id: property.id, unit_type: "apartment", unit_code: "A1" }],
    tenants: [{ id: tenant.id, status: tenant.status, updated_at: tenant.updatedAt }],
    leases: [{ ...lease, tenant_ids: ["tenant-1"], billing_tenant_id: "tenant-1", updated_at: lease.updatedAt }],
    assignments: [{ ...assignment, lease_id: lease.id, unit_id: unit.id }],
    amendments: [{ ...amendment, lease_id: lease.id, effective_date: amendment.effectiveDate, amendment_number: 1 }],
    changes: [{ ...formulaChange, amendment_id: amendment.id, field_name: "rentFormula", new_value: 6 }],
    receivables: [], allocations: [],
  };
}

describe("scheduled amendment activation plan", () => {
  it("rejects impossible amendment and signed dates", () => {
    const invalidEffective = validateAmendment(
      { ...amendment, effectiveDate: "2026-02-30" }, [formulaChange], state(), "2026-05-01",
    );
    expect(invalidEffective.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AMD_INVALID_EFFECTIVE_DATE" }),
    ]));
    const invalidSigned = validateAmendment(
      { ...amendment, signedDate: "2026-04-31" }, [formulaChange], state(), "2026-05-01",
    );
    expect(invalidSigned.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AMD_INVALID_SIGNED_DATE" }),
    ]));
  });

  it("rejects impossible lease and unit end dates but permits an open lease end", () => {
    const leaseEnd = {
      id: "lease-end", amendmentId: amendment.id, fieldName: "leaseEndDate",
      changeType: "set", oldValue: lease.endDate, newValue: "2026-02-30",
    } as LeaseAmendmentChange;
    const unitEnd = {
      id: "unit-end", amendmentId: amendment.id, fieldName: "unitEndDate",
      changeType: "set", oldValue: assignment.endDate, newValue: "2026-02-30",
      metadata: { unitId: unit.id },
    } as LeaseAmendmentChange;
    expect(validateAmendment(amendment, [leaseEnd], state([]), "2026-05-01").blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "AMD_INVALID_LEASE_END_DATE" })]));
    expect(validateAmendment(amendment, [unitEnd], state([]), "2026-05-01").blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "AMD_INVALID_UNIT_END_DATE" })]));
    const openEnd = { ...leaseEnd, newValue: null };
    expect(validateAmendment(amendment, [openEnd], state([]), "2026-05-01").blockers)
      .toEqual([]);
    expect(getEffectiveLeaseTerms(lease.id, amendment.effectiveDate, {
      leases: [lease], units: [unit], leaseUnitAssignments: [assignment],
      amendments: [{ ...amendment, status: "active" }], amendmentChanges: [openEnd],
    })?.endDate).toBe("");
  });

  it("rejects missing, negative, and nonnumeric prices for an added unit", () => {
    const second = { ...unit, id: "unit-2", unitCode: "A2" } as Unit;
    const base = {
      id: "add-change", amendmentId: amendment.id, fieldName: "unitAssignments",
      changeType: "add", metadata: { unitId: second.id },
    } as LeaseAmendmentChange;
    const scenario = { ...state([]), units: [unit, second] };
    for (const newValue of [
      { rentShare: 50 },
      { rentShare: -1, chargesShare: 0 },
      { rentShare: "invalid", chargesShare: 0 },
      { rentShare: 50, chargesShare: "" },
    ]) {
      const result = validateAmendment(amendment, [{ ...base, newValue }], scenario, "2026-05-01");
      expect(result.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "AMD_INVALID_UNIT_AMOUNT" }),
      ]));
    }
    const zero = validateAmendment(amendment, [
      { ...base, newValue: { rentShare: 0, chargesShare: 0 } },
    ], scenario, "2026-05-01");
    expect(zero.blockers.some(blocker => blocker.code === "AMD_INVALID_UNIT_AMOUNT")).toBe(false);

    const activation = planAmendmentActivation(amendment.id, {
      ...scenario, amendmentChanges: [
        { ...base, newValue: { rentShare: "invalid", chargesShare: 0 } },
      ],
    }, {
      businessDate: "2026-05-01", timestamp: "2026-05-01",
      genId: () => "new-1", receivableLeadDays: 15,
    });
    expect(activation).toEqual({ ok: false, reason: expect.stringContaining("Added unit needs") });
  });

  it("rejects an added unit ending before the amendment takes effect", () => {
    const second = { ...unit, id: "unit-2", unitCode: "A2" } as Unit;
    const change = {
      id: "add-change", amendmentId: amendment.id, fieldName: "unitAssignments",
      changeType: "add", metadata: { unitId: second.id, endDate: "2026-04-30" },
      newValue: { rentShare: 50, chargesShare: 0 },
    } as LeaseAmendmentChange;
    const result = planAmendmentActivation(amendment.id, {
      ...state([change]), units: [unit, second],
    }, {
      businessDate: "2026-05-01", timestamp: "2026-05-01",
      genId: () => "new-1", receivableLeadDays: 15,
    });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("end date") });
    const invalid = validateAmendment(amendment, [{
      ...change, metadata: { unitId: second.id, endDate: "2026-02-30" },
    }], { ...state([]), units: [unit, second] }, "2026-05-01");
    expect(invalid.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AMD_INVALID_UNIT_END_DATE" }),
    ]));
  });

  it("uses a later unit removal after an earlier explicit charges total", () => {
    const ancillary = { ...unit, id: "unit-2", unitCode: "P1", unitType: "parking" } as Unit;
    const earlier = {
      ...amendment, id: "amendment-earlier", status: "ended",
      effectiveDate: "2026-03-01", amendmentNumber: 1,
    } as LeaseAmendment;
    const later = { ...amendment, status: "active", amendmentNumber: 2 } as LeaseAmendment;
    const earlierTotal = {
      id: "earlier-total", amendmentId: earlier.id, fieldName: "baseMonthlyChargesTotal",
      changeType: "set", oldValue: 20, newValue: 30,
    } as LeaseAmendmentChange;
    const laterRemoval = {
      id: "later-removal", amendmentId: later.id, fieldName: "unitAssignments",
      changeType: "remove", oldValue: { unitId: ancillary.id }, newValue: null,
      metadata: { unitId: ancillary.id },
    } as LeaseAmendmentChange;
    const history = {
      leases: [{ ...lease, monthlyCharges: 30 }], units: [unit, ancillary],
      leaseUnitAssignments: [
        { ...assignment, chargesShare: 0 },
        { ...assignment, id: "assignment-2", unitId: ancillary.id,
          rentShare: 0, chargesShare: 20, endDate: "2026-02-28" },
        { ...assignment, id: "assignment-3", unitId: ancillary.id,
          rentShare: 0, chargesShare: 30, startDate: "2026-03-01", endDate: "2026-04-30" },
      ],
      amendments: [earlier, later], amendmentChanges: [earlierTotal, laterRemoval],
    };
    expect(getEffectiveLeaseTerms(lease.id, "2026-02-01", history)?.monthlyCharges).toBe(20);
    expect(getEffectiveLeaseTerms(lease.id, "2026-04-01", history)?.monthlyCharges).toBe(30);
    expect(getEffectiveLeaseTerms(lease.id, "2026-05-01", history)?.monthlyCharges).toBe(0);
  });

  it("uses a later unit rent change after an earlier explicit rent total", () => {
    const earlier = {
      ...amendment, id: "amendment-earlier", status: "ended",
      effectiveDate: "2026-03-01", amendmentNumber: 1,
    } as LeaseAmendment;
    const later = { ...amendment, status: "active", amendmentNumber: 2 } as LeaseAmendment;
    const terms = getEffectiveLeaseTerms(lease.id, "2026-05-01", {
      leases: [{ ...lease, monthlyRent: 120 }], units: [unit],
      leaseUnitAssignments: [{ ...assignment, rentShare: 0 }],
      amendments: [earlier, later], amendmentChanges: [
        { id: "earlier-total", amendmentId: earlier.id, fieldName: "baseMonthlyRentTotal",
          changeType: "set", oldValue: 100, newValue: 120 } as LeaseAmendmentChange,
        { id: "later-share", amendmentId: later.id, fieldName: "unitRentShare",
          changeType: "set", oldValue: 120, newValue: 0,
          metadata: { unitId: unit.id } } as LeaseAmendmentChange,
      ],
    });
    expect(terms?.monthlyRent).toBe(0);
  });

  it("clears charges when a later unit end date removes the only charged unit", () => {
    const ancillary = { ...unit, id: "unit-2", unitCode: "P1", unitType: "parking" } as Unit;
    const terms = getEffectiveLeaseTerms(lease.id, "2026-05-01", {
      leases: [lease], units: [unit, ancillary],
      leaseUnitAssignments: [
        { ...assignment, chargesShare: 0 },
        { ...assignment, id: "assignment-2", unitId: ancillary.id,
          rentShare: 0, chargesShare: 20, endDate: "2026-04-30" },
      ],
      amendments: [{ ...amendment, status: "active" }], amendmentChanges: [
        { id: "end-change", amendmentId: amendment.id, fieldName: "unitEndDate",
          changeType: "set", oldValue: "2026-12-31", newValue: "2026-04-30",
          metadata: { unitId: ancillary.id } } as LeaseAmendmentChange,
      ],
    });
    expect(terms?.monthlyCharges).toBe(0);
  });

  it("clears charges when an amendment removes the only charge-bearing unit", () => {
    const ancillary = { ...unit, id: "unit-2", unitCode: "P1", unitType: "parking" } as Unit;
    const ancillaryAssignment = {
      ...assignment, id: "assignment-2", unitId: ancillary.id,
      rentShare: 0, chargesShare: 20,
    } as LeaseUnitAssignment;
    const remove = {
      id: "remove-change", amendmentId: amendment.id, fieldName: "unitAssignments",
      changeType: "remove", oldValue: { unitId: ancillary.id }, newValue: null,
      metadata: { unitId: ancillary.id },
    } as LeaseAmendmentChange;
    const result = planAmendmentActivation(amendment.id, {
      ...state([remove]),
      units: [unit, ancillary],
      leaseUnitAssignments: [{ ...assignment, chargesShare: 0 }, ancillaryAssignment],
    }, {
      businessDate: "2026-05-01", timestamp: "2026-05-01",
      genId: () => "new-1", receivableLeadDays: 15,
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.plan.lease.monthlyRent).toBe(100);
    expect(result.plan.lease.monthlyCharges).toBe(0);
    expect(result.plan.freshReceivables.every(item => item.itemType !== "charges")).toBe(true);
  });

  it("blocks a unit addition when legacy unit prices are missing", () => {
    const change = {
      id: "add-change", amendmentId: amendment.id, fieldName: "unitAssignments",
      changeType: "add", metadata: { unitId: "unit-2", startDate: amendment.effectiveDate },
      newValue: { rentShare: 50, chargesShare: 10 },
    } as LeaseAmendmentChange;
    const result = planAmendmentActivation(amendment.id, {
      ...state([change]),
      units: [unit, { ...unit, id: "unit-2", unitCode: "A2" }],
      leaseUnitAssignments: [{ ...assignment, rentShare: null, chargesShare: null }],
    }, {
      businessDate: "2026-05-01", timestamp: "2026-05-01",
      genId: () => "new-1", receivableLeadDays: 15,
    });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("Unit rent shares are missing") });
  });

  it("refuses to activate when an earlier billing cycle has no main unit", () => {
    const result = planAmendmentActivation(amendment.id, {
      ...state([]),
      leaseUnitAssignments: [{ ...assignment, startDate: "2026-02-01" }],
    }, {
      businessDate: "2026-05-01", timestamp: "2026-05-01",
      genId: () => "new-1", receivableLeadDays: 15,
    });

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("billing cycle 2026-01-01"),
    });
  });

  it("starts the new formula at the effective date and preserves earlier or paid periods", () => {
    let sequence = 0;
    const result = planAmendmentActivation(amendment.id, state(), {
      businessDate: "2026-05-01", timestamp: "2026-05-01",
      genId: () => `new-${++sequence}`, receivableLeadDays: 15,
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.plan.lease.rentFormula).toBe(6);
    expect(result.plan.amendments.find(item => item.id === amendment.id)?.status).toBe("active");
    expect(result.plan.removedReceivables.map(item => item.id)).toEqual(["replace"]);
    expect(result.plan.receivables.map(item => item.id)).toContain("old");
    expect(result.plan.receivables.map(item => item.id)).toContain("protected");
    expect(result.plan.freshReceivables.some(item => item.dueDate === "2026-05-01")).toBe(true);
    expect(result.plan.freshReceivables.every(item => item.dueDate >= amendment.effectiveDate)).toBe(true);
  });

  it("refuses a formula change through an advance cycle already billed before activation", () => {
    const paidCycle = {
      ...existing("prepaid", "2026-04-01", 100),
      cycleEndDate: "2026-07-31", status: "paid", outstandingAmount: 0,
    } as ReceivableItem;
    const result = planAmendmentActivation(amendment.id, {
      ...state(), receivableItems: [...state().receivableItems, paidCycle],
    }, {
      businessDate: "2026-05-01", timestamp: "2026-05-01",
      genId: () => "new-1", receivableLeadDays: 15,
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toContain("billed receivable");

    const rows = serverRows();
    rows.receivables = [{
      id: paidCycle.id, lease_id: lease.id, property_id: property.id,
      unit_id: unit.id, item_type: "rent", origin: "lease-schedule",
      due_date: paidCycle.dueDate, period_month: paidCycle.periodMonth,
      cycle_end_date: paidCycle.cycleEndDate, status: "paid",
      expected_amount: 100, allocated_amount: 100, outstanding_amount: 0,
      currency_code: "EUR",
    }];
    const serverResult = planServerAmendmentActivation(amendment.id, rows, {
      businessDate: "2026-05-01", portfolioId: "portfolio-1",
      receivableLeadDays: 15, genId: () => "new-1",
    });
    expect(serverResult.ok).toBe(false);
    if (serverResult.ok === false) expect(serverResult.reason).toContain("billed receivable");
  });

  it("blocks a mid-month formula change through an already billed monthly cycle", () => {
    const midMonth = { ...amendment, effectiveDate: "2026-05-15" };
    const monthlyCycle = {
      ...existing("monthly", "2026-05-01"),
      cycleEndDate: "2026-05-31",
    } as ReceivableItem;
    const result = planAmendmentActivation(amendment.id, {
      ...state(), amendments: [midMonth], receivableItems: [monthlyCycle],
    }, {
      businessDate: "2026-05-15", timestamp: "2026-05-15",
      genId: () => "new-1", receivableLeadDays: 15,
    });

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("billed receivable") });
  });

  it("keeps tenant_ids and billing_tenant_id aligned after a tenant amendment", () => {
    const change = {
      id: "change-2", amendmentId: amendment.id, fieldName: "tenantIds",
      changeType: "replace", oldValue: ["tenant-1"], newValue: ["tenant-2"],
    } as LeaseAmendmentChange;
    const result = planAmendmentActivation(amendment.id, {
      ...state([change]), tenants: [tenant, { ...tenant, id: "tenant-2", status: "applicant" }],
    }, {
      businessDate: "2026-05-01", timestamp: "2026-05-01",
      genId: () => "new-1", receivableLeadDays: 15,
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.plan.lease.tenantIds).toEqual(["tenant-2"]);
    expect(result.plan.lease.billingTenantId).toBe("tenant-2");
    expect(result.plan.lease.primaryTenantId).toBe("tenant-2");
    expect(result.plan.changedTenants.map(item => [item.item.id, item.item.status]))
      .toEqual([["tenant-2", "active"]]);
  });

  it("hydrates database rows and sends only persisted lease columns to the atomic RPC", () => {
    let sequence = 0;
    const result = planServerAmendmentActivation(amendment.id, serverRows(), {
      businessDate: "2026-05-01", portfolioId: "portfolio-1",
      receivableLeadDays: 15, genId: () => `new-${++sequence}`,
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    const args = toAmendmentActivationRpcArgs(amendment.id, "portfolio-1", result);
    const row = args.p_lease as Record<string, unknown>;
    expect(row.tenant_ids).toEqual(["tenant-1"]);
    expect(row.billing_tenant_id).toBe("tenant-1");
    expect(row.primary_tenant_id).toBeUndefined();
    expect(row.co_tenant_ids).toBeUndefined();
    expect(row.unit_id).toBeUndefined();
    const response = {
      lease: { id: lease.id },
      assignments: args.p_assignments,
      amendments: args.p_amendments,
      receivables: args.p_new_receivables,
      removed_receivable_ids: (args.p_removed_receivables as { id: string }[]).map(item => item.id),
      tenants: args.p_tenants,
    };
    expect(isCompleteAmendmentActivationResponse(args, response)).toBe(true);
    expect(isCompleteAmendmentActivationResponse(args, { ...response, receivables: [] })).toBe(false);
    expect(isCompleteAmendmentActivationResponse(args, {
      ...response,
      amendments: [{ id: "different" }],
    })).toBe(false);
  });

  it("activates a due amendment through the server job and reports an exact count", async () => {
    const activated: Record<string, unknown>[] = [];
    const result = await runDueAmendmentJob({
      listDueAmendments: async () => [{
        id: amendment.id, lease_id: lease.id, portfolio_id: "portfolio-1",
        effective_date: amendment.effectiveDate, amendment_number: 1,
      }],
      loadRows: async () => serverRows(),
      getLeadDays: async () => 15,
      activate: async args => { activated.push(args); },
    }, "2026-05-01", () => "new-1");
    expect(result).toEqual({ amendmentsExamined: 1, activatedAmendments: 1, incompleteAmendmentIds: [] });
    expect(activated).toHaveLength(1);
    expect(activated[0].p_target_amendment_id).toBe(amendment.id);
  });

  it("does not activate a scheduled amendment targeting a missing unit assignment", async () => {
    const activate = vi.fn(async () => {});
    const rows = {
      ...serverRows(),
      changes: [{
        id: "change-invalid", amendment_id: amendment.id,
        field_name: "unitAssignments", change_type: "remove",
        old_value: { unitId: "legacy-unit" }, new_value: null,
        metadata: { unitId: "legacy-unit" },
      }],
    };
    const result = await runDueAmendmentJob({
      listDueAmendments: async () => [{
        id: amendment.id, lease_id: lease.id, portfolio_id: "portfolio-1",
        effective_date: amendment.effectiveDate, amendment_number: 1,
      }],
      loadRows: async () => rows,
      getLeadDays: async () => 15,
      activate,
    }, "2026-05-01", () => "new-1");
    expect(result).toEqual({
      amendmentsExamined: 1, activatedAmendments: 0,
      incompleteAmendmentIds: [amendment.id],
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it("waits for the amendment property's local effective date", async () => {
    const activate = vi.fn(async () => {});
    const result = await runDueAmendmentJob({
      listDueAmendments: async () => [{
        id: amendment.id, lease_id: lease.id, portfolio_id: "portfolio-1",
        effective_date: amendment.effectiveDate, amendment_number: 1,
      }],
      dateForAmendment: async () => "2026-04-30",
      loadRows: async () => serverRows(),
      getLeadDays: async () => 15,
      activate,
    }, "2026-05-01");
    expect(result).toEqual({ amendmentsExamined: 0, activatedAmendments: 0, incompleteAmendmentIds: [] });
    expect(activate).not.toHaveBeenCalled();
  });

  it("does not process a later amendment of a lease when the earlier one fails", async () => {
    const loaded: string[] = [];
    const result = await runDueAmendmentJob({
      listDueAmendments: async () => [
        { id: "later", lease_id: "lease-1", portfolio_id: "portfolio-1", effective_date: "2026-06-01", amendment_number: 2 },
        { id: "other", lease_id: "lease-2", portfolio_id: "portfolio-1", effective_date: "2026-05-01", amendment_number: 1 },
        { id: "first", lease_id: "lease-1", portfolio_id: "portfolio-1", effective_date: "2026-05-01", amendment_number: 1 },
      ],
      loadRows: async row => { loaded.push(String(row.id)); throw new Error("Unavailable"); },
      getLeadDays: async () => 15,
      activate: async () => { throw new Error("Must not activate"); },
    }, "2026-06-01");
    expect(loaded).toEqual(["first", "other"]);
    expect(result).toEqual({
      amendmentsExamined: 3, activatedAmendments: 0,
      incompleteAmendmentIds: ["first", "other", "later"],
    });
  });
});
