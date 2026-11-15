import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AllocationRule, AllocationRuleUnitShare, CostAllocationResult, CostEntry } from "@/types/costs";
import type { CashReceipt, ReceivableItem, ReceiptAllocation } from "@/types/receivables";
import type { Lease, LeaseUnitAssignment, Property, PropertyOwnerLink, Tenant } from "@/types";
import type { ChargesReconciliation } from "@/types/chargesReconciliation";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

const mock = vi.hoisted(() => ({
  response: { data: [] as { id: string }[], error: null as { message: string; code?: string } | null },
  returningResponse: { data: [] as Record<string, unknown>[], error: null as { message: string; code?: string } | null },
  insertResponses: [] as Array<{ data: null; error: { message: string; code: string } | null }>,
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mock.rpc(...args),
    from: () => ({
      insert: (row: unknown) => {
        mock.insert(row);
        return Object.assign(Promise.resolve(mock.insertResponses.shift() ?? { data: null, error: null }), {
          select: async () => mock.returningResponse,
        });
      },
      update: (row: unknown) => {
        mock.update(row);
        const query = {
          eq: (column: string, value: string) => { mock.eq(column, value); return query; },
          select: async (columns: string) => columns === "*" ? mock.returningResponse : mock.response,
        };
        return query;
      },
      delete: () => {
        mock.remove();
        return {
          eq: () => ({ select: async () => mock.response }),
          in: () => ({ select: async () => mock.response }),
        };
      },
    }),
  },
}));

import { mirror, TABLES, createLeaseWithSchedule, saveLeaseWithAssignments, saveLeaseWithTenantStatuses, activateAmendmentWithSchedule, deleteDraftAmendment, changeAmendmentStatus, saveAllocationRuleWithShares, saveCostEntryWithAllocations, saveReceiptAllocations, deleteDuplicateLeaseReceivables, createChargesReconciliation, deleteChargesReconciliation, saveAmendmentWithChanges, setPropertyOwnerLinksPersisted, savePropertyWithOwnersPersisted } from "@/lib/repo";

describe("repository mutation acknowledgement", () => {
  beforeEach(() => {
    mock.response = { data: [], error: null };
    mock.returningResponse = { data: [], error: null };
    mock.update.mockClear();
    mock.eq.mockClear();
    mock.remove.mockClear();
    mock.insert.mockClear();
    mock.insertResponses = [];
    mock.rpc.mockReset();
  });

  it("reports an update that did not affect a row", async () => {
    const error = await mirror.updateAsync(TABLES.units, "missing", { unitLabel: "Changed" });
    expect(error?.message).toContain("No units row was updated");
  });

  it("reports a delete that did not affect a row", async () => {
    const error = await mirror.removeAsync(TABLES.units, "missing");
    expect(error?.message).toContain("No units row was deleted");
  });

  it("accepts updates and deletes acknowledged by the database", async () => {
    mock.response = { data: [{ id: "unit-1" }], error: null };
    expect(await mirror.updateAsync(TABLES.units, "unit-1", { unitLabel: "Changed" })).toBeNull();
    expect(await mirror.removeAsync(TABLES.units, "unit-1")).toBeNull();
    expect(mock.update).toHaveBeenCalledWith({ unit_label: "Changed" });
    expect(mock.remove).toHaveBeenCalledTimes(1);
  });

  it("returns database timestamps for a newly inserted tenant", async () => {
    mock.returningResponse = { data: [{ id: "tenant-1", portfolio_id: "portfolio-1", created_at: "2026-10-17T09:00:00Z", updated_at: "2026-10-17T09:00:00Z" }], error: null };
    const saved = await mirror.insertReturningAsync<Tenant>(TABLES.tenants, { id: "tenant-1", firstName: "Ada" }, "portfolio-1");
    expect(saved.updatedAt).toBe("2026-10-17T09:00:00Z");
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ first_name: "Ada", portfolio_id: "portfolio-1" }));
  });

  it("uses optimistic version matching and returns the updated database row", async () => {
    mock.returningResponse = { data: [{ id: "amendment-1", status: "scheduled", updated_at: "2026-10-17T09:01:00Z" }], error: null };
    const saved = await mirror.updateReturningAsync<LeaseAmendment>(TABLES.amendments, "amendment-1", { status: "scheduled" }, "2026-10-17T09:00:00Z");
    expect(saved.updatedAt).toBe("2026-10-17T09:01:00Z");
    expect(mock.update).toHaveBeenCalledWith({ status: "scheduled" });
    expect(mock.eq).toHaveBeenCalledWith("updated_at", "2026-10-17T09:00:00Z");
    mock.returningResponse = { data: [], error: null };
    await expect(mirror.updateReturningAsync<LeaseAmendment>(TABLES.amendments, "amendment-1", { status: "active" }, saved.updatedAt))
      .rejects.toThrow("Reload and retry");
  });

  it("requires every row in a batch deletion to be acknowledged", async () => {
    mock.response = { data: [{ id: "one" }], error: null };
    const error = await mirror.removeManyAsync(TABLES.receivableItems, ["one", "two"]);
    expect(error?.message).toContain("Only 1 of 2");
  });

  it("rejects simple write acknowledgements for a different row", async () => {
    mock.returningResponse = { data: [{ id: "other", portfolio_id: "portfolio-1" }], error: null };
    await expect(mirror.insertReturningAsync<Tenant>(TABLES.tenants, { id: "tenant-1" }, "portfolio-1"))
      .rejects.toThrow("No tenants row was inserted");
    await expect(mirror.updateReturningAsync<Tenant>(TABLES.tenants, "tenant-1", { firstName: "Ada" }))
      .rejects.toThrow("No tenants row was updated");

    mock.response = { data: [{ id: "other" }], error: null };
    expect((await mirror.updateAsync(TABLES.units, "unit-1", { unitLabel: "A" }))?.message)
      .toContain("No units row was updated");
    expect((await mirror.removeAsync(TABLES.units, "unit-1"))?.message)
      .toContain("No units row was deleted");
    mock.response = { data: [{ id: "one" }, { id: "other" }], error: null };
    expect((await mirror.removeManyAsync(TABLES.units, ["one", "two"]))?.message)
      .toContain("database confirmed different units deletions");
  });

  it("deletes reviewed duplicate receivables only through the atomic database operation", async () => {
    mock.rpc.mockResolvedValueOnce({ data: { deleted: 2 }, error: null });
    const items = [
      { id: "one", updatedAt: "2026-11-07T08:00:00Z" },
      { id: "two", updatedAt: "2026-11-07T08:01:00Z" },
    ];
    await expect(deleteDuplicateLeaseReceivables("portfolio-1", items)).resolves.toBe(2);
    expect(mock.rpc).toHaveBeenCalledWith("delete_duplicate_lease_receivables", {
      p_portfolio_id: "portfolio-1",
      p_items: [
        { id: "one", expected_updated_at: "2026-11-07T08:00:00Z" },
        { id: "two", expected_updated_at: "2026-11-07T08:01:00Z" },
      ],
    });
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("does not report success when duplicate cleanup is unavailable or only partly acknowledged", async () => {
    const items = [{ id: "one", updatedAt: "2026-11-07T08:00:00Z" }];
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function missing" } });
    await expect(deleteDuplicateLeaseReceivables("portfolio-1", items)).rejects.toThrow("safe database cleanup migration");
    mock.rpc.mockResolvedValueOnce({ data: { deleted: 0 }, error: null });
    await expect(deleteDuplicateLeaseReceivables("portfolio-1", items)).rejects.toThrow("did not confirm deletion");
  });

  it("requires every matching child row in a replacement deletion to be acknowledged", async () => {
    mock.response = { data: [{ id: "one" }], error: null };
    const error = await mirror.removeWhereAsync(TABLES.amendmentChanges, "amendment_id", "amendment-1", 2);
    expect(error?.message).toContain("Only 1 of 2");
  });

  it("does not expose fire-and-forget write methods", () => {
    for (const name of ["insert", "insertMany", "upsertMany", "update", "remove", "removeWhere"]) {
      expect(name in mirror).toBe(false);
    }
  });

  it("saves non-indexed leases against a database without indexation columns", async () => {
    mock.insertResponses.push({ data: null, error: { code: "PGRST204", message: "Could not find the 'indexation_base_date' column" } });
    const error = await mirror.insertAsync(TABLES.leases, { id: "lease-1", indexationEnabled: false, indexationBaseDate: null }, "portfolio-1");
    expect(error).toBeNull();
    expect(mock.insert).toHaveBeenCalledTimes(2);
    expect(mock.insert.mock.calls[1][0]).not.toHaveProperty("indexation_base_date");
    expect(mock.insert.mock.calls[1][0]).not.toHaveProperty("indexation_enabled");
  });

  it("persists a blank lease end date as a nullable database date", async () => {
    const error = await mirror.insertAsync(TABLES.leases, { id: "lease-open", endDate: "" }, "portfolio-1");
    expect(error).toBeNull();
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ end_date: null }));
  });

  it("explains the missing migration when an open-ended lease is rejected", async () => {
    mock.insertResponses.push({
      data: null,
      error: { code: "23502", message: "null value in column \"end_date\" violates not-null constraint" },
    });
    const error = await mirror.insertAsync(TABLES.leases, { id: "lease-open", endDate: "" }, "portfolio-1");
    expect(error?.message).toContain("database migration");
    expect(mock.insert).toHaveBeenCalledTimes(1);
  });

  it("explains the missing end-date migration after a legacy indexation retry", async () => {
    mock.insertResponses.push(
      { data: null, error: { code: "PGRST204", message: "Could not find the 'indexation_base_date' column" } },
      { data: null, error: { code: "23502", message: "null value in column \"end_date\" violates not-null constraint" } },
    );
    const error = await mirror.insertAsync(TABLES.leases, {
      id: "lease-open", endDate: "", indexationEnabled: false, indexationBaseDate: null,
    }, "portfolio-1");
    expect(error?.message).toContain("nullable lease end-date database migration");
    expect(mock.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects indexed leases when the database migration is missing", async () => {
    mock.insertResponses.push({ data: null, error: { code: "PGRST204", message: "Could not find the 'indexation_base_date' column" } });
    const error = await mirror.insertAsync(TABLES.leases, { id: "lease-2", indexationEnabled: true }, "portfolio-1");
    expect(error?.message).toContain("database migration");
    expect(mock.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects indexed lease updates without the migration instead of reporting success", async () => {
    mock.response = { data: [], error: { code: "PGRST204", message: "Could not find the 'indexation_base_date' column" } };
    const error = await mirror.updateAsync(TABLES.leases, "lease-2", { indexationEnabled: true, indexationBaseDate: "2026-01-01" });
    expect(error?.message).toContain("database migration");
    expect(mock.update).toHaveBeenCalledTimes(1);
  });

  it("sends one atomic cost write and hydrates the database-confirmed rows", async () => {
    const entry = { id: "cost-1", propertyId: "property-1", amount: 100, updatedAt: "2026-01-01" } as CostEntry;
    const allocation = { id: "allocation-1", costEntryId: "cost-1", propertyId: "property-1", unitId: "unit-1", allocatedAmount: 100 } as CostAllocationResult;
    mock.rpc.mockResolvedValueOnce({
      data: {
        entry: { id: "cost-1", property_id: "property-1", amount: 100, updated_at: "2026-01-02" },
        allocations: [{ id: "allocation-1", cost_entry_id: "cost-1", allocated_amount: 100 }],
      }, error: null,
    });
    const saved = await saveCostEntryWithAllocations(entry, [allocation], "portfolio-1", entry.updatedAt);
    expect(mock.rpc).toHaveBeenCalledWith("client_save_cost_entry_with_allocations", {
      p_entry: { id: "cost-1", property_id: "property-1", amount: 100, portfolio_id: "portfolio-1" },
      p_allocations: [{ id: "allocation-1", cost_entry_id: "cost-1", property_id: "property-1", unit_id: "unit-1", allocated_amount: 100, portfolio_id: "portfolio-1" }],
      p_expected_updated_at: "2026-01-01",
    });
    expect(saved.entry.updatedAt).toBe("2026-01-02");
    expect(saved.allocations[0].costEntryId).toBe("cost-1");
  });

  it("explains when the atomic cost write migration is absent", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(saveCostEntryWithAllocations({ id: "cost-1" } as CostEntry, [], "portfolio-1"))
      .rejects.toThrow("atomic cost allocation database migration");
  });

  it("refuses partial or unrelated cost-allocation acknowledgements", async () => {
    const entry = { id: "cost-1" } as CostEntry;
    const allocation = { id: "allocation-1", costEntryId: "cost-1" } as CostAllocationResult;
    const mismatches = [
      { entry: { id: "cost-1" }, allocations: [] },
      { entry: { id: "other-cost" }, allocations: [{ id: "allocation-1", cost_entry_id: "cost-1" }] },
      { entry: { id: "cost-1" }, allocations: [{ id: "other-allocation", cost_entry_id: "cost-1" }] },
      { entry: { id: "cost-1" }, allocations: [{ id: "allocation-1", cost_entry_id: "other-cost" }] },
    ];
    for (const data of mismatches) {
      mock.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(saveCostEntryWithAllocations(entry, [allocation], "portfolio-1"))
        .rejects.toThrow(/did not confirm|confirmed different cost allocations/);
    }
  });

  it("sends one atomic payment write with optimistic versions and hydrates confirmed rows", async () => {
    const receipt = { id: "receipt-1", amountReceived: 100, unmatchedAmount: 0, updatedAt: "2026-01-01" } as CashReceipt;
    const item = { id: "item-1", allocatedAmount: 100, outstandingAmount: 0, updatedAt: "2026-01-01" } as ReceivableItem;
    const allocation = { id: "allocation-1", cashReceiptId: "receipt-1", receivableItemId: "item-1", allocatedAmount: 100 } as ReceiptAllocation;
    mock.rpc.mockResolvedValueOnce({ data: {
      receipt: { id: "receipt-1", unmatched_amount: 0, updated_at: "2026-01-02" },
      receivables: [{ id: "item-1", allocated_amount: 100, outstanding_amount: 0, updated_at: "2026-01-02" }],
      allocations: [{ id: "allocation-1", cash_receipt_id: "receipt-1", receivable_item_id: "item-1", allocated_amount: 100 }],
    }, error: null });

    const saved = await saveReceiptAllocations(
      receipt, [{ item, expectedUpdatedAt: "2026-01-01" }], [allocation], "portfolio-1", "2026-01-01",
    );
    expect(mock.rpc).toHaveBeenCalledWith("client_save_receipt_allocations", {
      p_receipt: { id: "receipt-1", amount_received: 100, unmatched_amount: 0, portfolio_id: "portfolio-1" },
      p_receivables: [{ id: "item-1", allocated_amount: 100, outstanding_amount: 0, portfolio_id: "portfolio-1", expected_updated_at: "2026-01-01" }],
      p_allocations: [{ id: "allocation-1", cash_receipt_id: "receipt-1", receivable_item_id: "item-1", allocated_amount: 100, portfolio_id: "portfolio-1" }],
      p_expected_receipt_updated_at: "2026-01-01",
    });
    expect(saved.receipt.updatedAt).toBe("2026-01-02");
    expect(saved.receivables[0].updatedAt).toBe("2026-01-02");
    expect(saved.allocations[0].cashReceiptId).toBe("receipt-1");
  });

  it("explains when the atomic payment migration is absent", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(saveReceiptAllocations({ id: "receipt-1" } as CashReceipt, [], [], "portfolio-1"))
      .rejects.toThrow("atomic receipt allocation database migration");
  });

  it("refuses payment acknowledgements for a different receipt, receivable, or allocation link", async () => {
    const receipt = { id: "receipt-1" } as CashReceipt;
    const item = { id: "item-1" } as ReceivableItem;
    const allocation = {
      id: "allocation-1", cashReceiptId: "receipt-1", receivableItemId: "item-1",
    } as ReceiptAllocation;
    const confirmed = {
      receipt: { id: "receipt-1" },
      receivables: [{ id: "item-1" }],
      allocations: [{ id: "allocation-1", cash_receipt_id: "receipt-1", receivable_item_id: "item-1" }],
    };
    const mismatches = [
      { ...confirmed, receipt: { id: "other-receipt" } },
      { ...confirmed, receivables: [{ id: "other-item" }] },
      { ...confirmed, allocations: [{ ...confirmed.allocations[0], cash_receipt_id: "other-receipt" }] },
      { ...confirmed, allocations: [{ ...confirmed.allocations[0], receivable_item_id: "other-item" }] },
    ];
    for (const data of mismatches) {
      mock.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(saveReceiptAllocations(receipt, [{ item, expectedUpdatedAt: "old" }],
        [allocation], "portfolio-1")).rejects.toThrow("confirmed different payment rows");
    }
  });

  it("creates lease, assignments, receivables, and tenant status in one call", async () => {
    const lease = {
      id: "lease-1", leaseReference: "TEST", propertyId: "property-1", unitId: "unit-1",
      primaryTenantId: "tenant-1", tenantIds: ["tenant-1"], billingTenantId: "tenant-1",
      coTenantIds: [], lifecycleStage: "active",
    } as unknown as Lease;
    const assignment = { id: "assignment-1", leaseId: "lease-1", unitId: "unit-1" } as LeaseUnitAssignment;
    const item = { id: "item-1", leaseId: "lease-1", expectedAmount: 100 } as ReceivableItem;
    const tenant = { id: "tenant-1", status: "active", updatedAt: "2026-01-01" } as Tenant;
    mock.rpc.mockResolvedValueOnce({ data: {
      lease: { id: "lease-1", portfolio_id: "portfolio-1", lease_reference: "TEST", updated_at: "2026-01-02" },
      assignments: [{ id: "assignment-1", lease_id: "lease-1", unit_id: "unit-1", portfolio_id: "portfolio-1" }],
      receivables: [{ id: "item-1", lease_id: "lease-1", property_id: "property-1", portfolio_id: "portfolio-1", expected_amount: 100 }],
      tenants: [{ id: "tenant-1", portfolio_id: "portfolio-1", status: "active", updated_at: "2026-01-02" }],
    }, error: null });
    const saved = await createLeaseWithSchedule(
      lease, [assignment], [item], [{ tenant, expectedUpdatedAt: "2026-01-01" }], "portfolio-1",
    );
    expect(mock.rpc).toHaveBeenCalledWith("client_create_lease_with_schedule", {
      p_lease: {
        id: "lease-1", lease_reference: "TEST", property_id: "property-1", tenant_ids: ["tenant-1"],
        billing_tenant_id: "tenant-1", lifecycle_stage: "active", portfolio_id: "portfolio-1",
      },
      p_assignments: [{ id: "assignment-1", lease_id: "lease-1", unit_id: "unit-1", portfolio_id: "portfolio-1" }],
      p_receivables: [{ id: "item-1", lease_id: "lease-1", expected_amount: 100, portfolio_id: "portfolio-1" }],
      p_tenants: [{ id: "tenant-1", status: "active", expected_updated_at: "2026-01-01" }],
    });
    expect(saved.lease).toMatchObject({ primaryTenantId: "tenant-1", updatedAt: "2026-01-02" });
    expect(saved.assignments[0].unitId).toBe("unit-1");
    expect(saved.tenants[0].updatedAt).toBe("2026-01-02");
  });

  it("explains when the atomic lease creation migration is absent", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(createLeaseWithSchedule({ id: "lease-1" } as Lease, [], [], [], "portfolio-1"))
      .rejects.toThrow("atomic lease creation database migration");
  });

  it("rejects a lease creation acknowledgement with different child rows", async () => {
    const lease = { id: "lease-1", propertyId: "property-1" } as Lease;
    const assignment = { id: "assignment-1", leaseId: lease.id } as LeaseUnitAssignment;
    const receivable = { id: "item-1", leaseId: lease.id } as ReceivableItem;
    const tenant = { id: "tenant-1", status: "active" } as Tenant;
    const correct = {
      lease: { id: lease.id, portfolio_id: "portfolio-1" },
      assignments: [{ id: assignment.id, lease_id: lease.id, portfolio_id: "portfolio-1" }],
      receivables: [{ id: receivable.id, lease_id: lease.id, property_id: lease.propertyId, portfolio_id: "portfolio-1" }],
      tenants: [{ id: tenant.id, status: tenant.status, portfolio_id: "portfolio-1" }],
    };
    const responses = [
      { ...correct, lease: { ...correct.lease, id: "other-lease" } },
      { ...correct, assignments: [{ ...correct.assignments[0], id: "other-assignment" }] },
      { ...correct, receivables: [{ ...correct.receivables[0], lease_id: "other-lease" }] },
      { ...correct, tenants: [{ ...correct.tenants[0], id: "other-tenant" }] },
      { ...correct, tenants: [{ ...correct.tenants[0], status: "former" }] },
    ];
    for (const data of responses) {
      mock.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(createLeaseWithSchedule(lease, [assignment], [receivable],
        [{ tenant, expectedUpdatedAt: "2026-01-01" }], "portfolio-1"))
        .rejects.toThrow(/database (did not confirm the lease|confirmed different lease rows)/);
    }
  });

  it("rejects metadata and assignment edits acknowledged for the wrong tenant", async () => {
    const lease = { id: "lease-1", updatedAt: "2026-10-18T09:00:00Z" } as Lease;
    const tenant = { id: "tenant-1", status: "active" } as Tenant;
    const response = {
      lease: { id: lease.id, portfolio_id: "portfolio-1" },
      tenants: [{ id: "tenant-2", status: "active", portfolio_id: "portfolio-1" }],
    };
    mock.rpc.mockResolvedValueOnce({ data: response, error: null });
    await expect(saveLeaseWithTenantStatuses(lease,
      [{ item: tenant, expectedUpdatedAt: "2026-10-18T09:00:00Z" }],
      "portfolio-1", lease.updatedAt))
      .rejects.toThrow("did not confirm the lease and tenant statuses");

    mock.rpc.mockResolvedValueOnce({ data: {
      ...response, assignments: [], receivables: [], removed_receivable_ids: [],
    }, error: null });
    await expect(saveLeaseWithAssignments(lease,
      [{ item: tenant, expectedUpdatedAt: "2026-10-18T09:00:00Z" }],
      [], [], "portfolio-1", lease.updatedAt))
      .rejects.toThrow("did not confirm the lease and all unit assignments");
  });

  it("rejects amendment activation acknowledgements for different lease rows", async () => {
    const lease = { id: "lease-1", propertyId: "property-1", updatedAt: "2026-10-18T09:00:00Z" } as Lease;
    const assignment = { id: "assignment-1", leaseId: lease.id } as LeaseUnitAssignment;
    const amendment = { id: "amendment-1", leaseId: lease.id, status: "active", updatedAt: lease.updatedAt } as LeaseAmendment;
    const receivable = { id: "new-receivable", leaseId: lease.id, propertyId: lease.propertyId } as ReceivableItem;
    const removed = { id: "old-receivable", updatedAt: lease.updatedAt } as ReceivableItem;
    const tenant = { id: "tenant-1", status: "active" } as Tenant;
    const correct = {
      lease: { id: lease.id, portfolio_id: "portfolio-1" },
      assignments: [{ id: assignment.id, lease_id: lease.id, portfolio_id: "portfolio-1" }],
      amendments: [{ id: amendment.id, lease_id: lease.id, portfolio_id: "portfolio-1" }],
      receivables: [{ id: receivable.id, lease_id: lease.id, property_id: lease.propertyId, portfolio_id: "portfolio-1" }],
      removed_receivable_ids: [removed.id],
      tenants: [{ id: tenant.id, status: tenant.status, portfolio_id: "portfolio-1" }],
    };
    const responses = [
      { ...correct, lease: { ...correct.lease, id: "other-lease" } },
      { ...correct, assignments: [{ ...correct.assignments[0], id: "other-assignment" }] },
      { ...correct, amendments: [{ ...correct.amendments[0], lease_id: "other-lease" }] },
      { ...correct, receivables: [{ ...correct.receivables[0], id: "other-receivable" }] },
      { ...correct, removed_receivable_ids: ["other-removed"] },
      { ...correct, tenants: [{ ...correct.tenants[0], status: "former" }] },
    ];
    for (const data of responses) {
      mock.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(activateAmendmentWithSchedule(amendment.id, lease,
        [{ item: assignment }], [{ item: amendment, expectedUpdatedAt: lease.updatedAt }],
        [removed], [receivable], [{ item: tenant, expectedUpdatedAt: lease.updatedAt }],
        "portfolio-1", lease.updatedAt))
        .rejects.toThrow("did not confirm the complete amendment activation");
    }
    mock.rpc.mockResolvedValueOnce({ data: correct, error: null });
    const saved = await activateAmendmentWithSchedule(amendment.id, lease,
      [{ item: assignment }], [{ item: amendment, expectedUpdatedAt: lease.updatedAt }],
      [removed], [receivable], [{ item: tenant, expectedUpdatedAt: lease.updatedAt }],
      "portfolio-1", lease.updatedAt);
    expect(saved.removedReceivableIds).toEqual([removed.id]);
    expect(saved.amendments[0].id).toBe(amendment.id);
  });

  it("saves an allocation rule and all its manual shares in one call", async () => {
    const rule = { id: "rule-1", propertyId: "property-1", name: "Manual", method: "manual-percentage", updatedAt: "2026-01-01" } as AllocationRule;
    const share = { id: "share-1", allocationRuleId: "rule-1", unitId: "unit-1", percentageShare: 100 } as AllocationRuleUnitShare;
    mock.rpc.mockResolvedValueOnce({ data: {
      rule: { id: "rule-1", portfolio_id: "portfolio-1", property_id: "property-1", name: "Manual", updated_at: "2026-01-02" },
      shares: [{ id: "share-1", portfolio_id: "portfolio-1", allocation_rule_id: "rule-1", unit_id: "unit-1", percentage_share: 100 }],
    }, error: null });
    const saved = await saveAllocationRuleWithShares(rule, [share], "portfolio-1", "2026-01-01");
    expect(mock.rpc).toHaveBeenCalledWith("client_save_allocation_rule_with_shares", {
      p_rule: { id: "rule-1", property_id: "property-1", name: "Manual", method: "manual-percentage", portfolio_id: "portfolio-1" },
      p_shares: [{ id: "share-1", allocation_rule_id: "rule-1", unit_id: "unit-1", percentage_share: 100, portfolio_id: "portfolio-1" }],
      p_expected_updated_at: "2026-01-01",
    });
    expect(saved.rule.updatedAt).toBe("2026-01-02");
    expect(saved.shares[0].allocationRuleId).toBe("rule-1");
  });

  it("explains when the atomic rule-share migration is absent", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(saveAllocationRuleWithShares({ id: "rule-1" } as AllocationRule, [], "portfolio-1"))
      .rejects.toThrow("atomic rule-share database migration");
  });

  it("rejects a rule-share acknowledgement with a different share", async () => {
    const rule = { id: "rule-1" } as AllocationRule;
    const share = { id: "share-1", allocationRuleId: rule.id } as AllocationRuleUnitShare;
    mock.rpc.mockResolvedValueOnce({ data: {
      rule: { id: rule.id, portfolio_id: "portfolio-1" },
      shares: [{ id: "other-share", allocation_rule_id: rule.id, portfolio_id: "portfolio-1" }],
    }, error: null });
    await expect(saveAllocationRuleWithShares(rule, [share], "portfolio-1"))
      .rejects.toThrow("did not confirm the allocation rule and all its shares");
  });

  it("acknowledges atomic reconciliation creation and deletion", async () => {
    const reconciliation = { id: "rec-1", updatedAt: "2026-01-02", receivableItemId: "item-1" } as ChargesReconciliation;
    const item = { id: "item-1", leaseId: "lease-1", expectedAmount: 20 } as ReceivableItem;
    mock.rpc.mockResolvedValueOnce({ data: {
      reconciliation: { id: "rec-1", portfolio_id: "portfolio-1", updated_at: "2026-01-03", receivable_item_id: "item-1" },
      receivable: { id: "item-1", lease_id: "lease-1", portfolio_id: "portfolio-1", expected_amount: 20 },
    }, error: null });
    const saved = await createChargesReconciliation(reconciliation, item, "portfolio-1");
    expect(mock.rpc).toHaveBeenCalledWith("client_create_charges_reconciliation", {
      p_reconciliation: { id: "rec-1", receivable_item_id: "item-1", portfolio_id: "portfolio-1" },
      p_receivable: { id: "item-1", lease_id: "lease-1", expected_amount: 20, portfolio_id: "portfolio-1" },
    });
    expect(saved.reconciliation.updatedAt).toBe("2026-01-03");
    mock.rpc.mockResolvedValueOnce({ data: { reconciliation_id: "rec-1", receivable_id: "item-1" }, error: null });
    await deleteChargesReconciliation(reconciliation, "portfolio-1");
    expect(mock.rpc).toHaveBeenLastCalledWith("client_delete_charges_reconciliation", {
      p_id: "rec-1", p_portfolio_id: "portfolio-1", p_expected_updated_at: "2026-01-02",
    });
  });

  it("explains when the atomic reconciliation migration is absent", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(createChargesReconciliation({ id: "rec-1" } as ChargesReconciliation, null, "portfolio-1"))
      .rejects.toThrow("atomic reconciliation database migration");
  });

  it("rejects a reconciliation acknowledgement for a different adjustment", async () => {
    const reconciliation = { id: "rec-1" } as ChargesReconciliation;
    const receivable = { id: "item-1", leaseId: "lease-1" } as ReceivableItem;
    mock.rpc.mockResolvedValueOnce({ data: {
      reconciliation: { id: reconciliation.id, portfolio_id: "portfolio-1" },
      receivable: { id: "other-item", lease_id: receivable.leaseId, portfolio_id: "portfolio-1" },
    }, error: null });
    await expect(createChargesReconciliation(reconciliation, receivable, "portfolio-1"))
      .rejects.toThrow("did not confirm the reconciliation and adjustment receivable");
  });

  it("saves amendment changes together and uses the database-assigned number", async () => {
    const amendment = { id: "am-1", leaseId: "lease-1", amendmentNumber: 99, updatedAt: "2026-01-01" } as LeaseAmendment;
    const change = { id: "ch-1", amendmentId: "am-1", fieldName: "rentFormula", changeType: "set" } as LeaseAmendmentChange;
    mock.rpc.mockResolvedValueOnce({ data: {
      amendment: { id: "am-1", lease_id: "lease-1", portfolio_id: "portfolio-1", amendment_number: 2, updated_at: "2026-01-02" },
      changes: [{ id: "ch-1", amendment_id: "am-1", field_name: "rentFormula", change_type: "set" }],
    }, error: null });
    const saved = await saveAmendmentWithChanges(amendment, [change], "portfolio-1", "2026-01-01");
    expect(mock.rpc).toHaveBeenCalledWith("client_save_amendment_with_changes", {
      p_amendment: { id: "am-1", lease_id: "lease-1", amendment_number: 99, portfolio_id: "portfolio-1" },
      p_changes: [{ id: "ch-1", amendment_id: "am-1", field_name: "rentFormula", change_type: "set", portfolio_id: "portfolio-1" }],
      p_expected_updated_at: "2026-01-01",
    });
    expect(saved.amendment.amendmentNumber).toBe(2);
    expect(saved.changes[0].fieldName).toBe("rentFormula");
  });

  it("changes amendment status only after a scoped database acknowledgement", async () => {
    const amendment = { id: "am-1", updatedAt: "2026-01-01" } as LeaseAmendment;
    mock.rpc.mockResolvedValueOnce({ data: {
      id: "am-1", portfolio_id: "portfolio-1", status: "scheduled", updated_at: "2026-01-02",
    }, error: null });
    const saved = await changeAmendmentStatus(amendment, "portfolio-1", "scheduled");
    expect(mock.rpc).toHaveBeenCalledWith("change_amendment_status", {
      p_amendment_id: "am-1", p_portfolio_id: "portfolio-1",
      p_expected_updated_at: "2026-01-01", p_status: "scheduled",
    });
    expect(saved.updatedAt).toBe("2026-01-02");
    mock.rpc.mockResolvedValueOnce({ data: { id: "am-1", status: "scheduled" }, error: null });
    await expect(changeAmendmentStatus(amendment, "portfolio-1", "scheduled"))
      .rejects.toThrow("did not confirm the amendment status change");
  });

  it("explains when the atomic amendment migration is absent", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(saveAmendmentWithChanges({ id: "am-1" } as LeaseAmendment, [], "portfolio-1"))
      .rejects.toThrow("atomic amendment database migration");
  });

  it("rejects an amendment acknowledgement for a different change", async () => {
    const amendment = { id: "am-1" } as LeaseAmendment;
    const change = { id: "ch-1", amendmentId: amendment.id } as LeaseAmendmentChange;
    mock.rpc.mockResolvedValueOnce({ data: {
      amendment: { id: amendment.id, portfolio_id: "portfolio-1" },
      changes: [{ id: "other-change", amendment_id: amendment.id }],
    }, error: null });
    await expect(saveAmendmentWithChanges(amendment, [change], "portfolio-1"))
      .rejects.toThrow("did not confirm the amendment and all its changes");
  });

  it("replaces property owner links through one acknowledged RPC", async () => {
    const previous = {
      id: "link-1", propertyId: "property-1", ownerId: "owner-1",
      updatedAt: "2026-10-18T09:00:00Z",
    } as PropertyOwnerLink;
    mock.rpc.mockResolvedValueOnce({ data: [{
      id: "link-2", property_id: "property-1", owner_id: "owner-2",
      portfolio_id: "portfolio-1", updated_at: "2026-10-18T10:00:00Z",
    }], error: null });
    const saved = await setPropertyOwnerLinksPersisted(
      "property-1", ["owner-2"], [previous], "portfolio-1",
    );
    expect(mock.rpc).toHaveBeenCalledWith("set_property_owner_links", {
      p_property_id: "property-1",
      p_expected_links: [{
        id: "link-1", owner_id: "owner-1", updated_at: "2026-10-18T09:00:00Z",
      }],
      p_desired_owner_ids: ["owner-2"],
    });
    expect(saved[0]).toMatchObject({ id: "link-2", ownerId: "owner-2", updatedAt: "2026-10-18T10:00:00Z" });
  });

  it("rejects incomplete owner-link acknowledgement and a missing migration", async () => {
    mock.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(setPropertyOwnerLinksPersisted("property-1", ["owner-2"], [], "portfolio-1"))
      .rejects.toThrow("did not confirm all property owner links");
    mock.rpc.mockResolvedValueOnce({ data: [
      { id: "link-1", property_id: "property-1", owner_id: "owner-1", portfolio_id: "portfolio-1" },
      { id: "link-2", property_id: "property-1", owner_id: "owner-1", portfolio_id: "portfolio-1" },
    ], error: null });
    await expect(setPropertyOwnerLinksPersisted("property-1", ["owner-1", "owner-2"], [], "portfolio-1"))
      .rejects.toThrow("did not confirm all property owner links");
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(setPropertyOwnerLinksPersisted("property-1", [], [], "portfolio-1"))
      .rejects.toThrow("atomic owner-link migration");
  });

  it("acknowledges a property and its owners from one RPC response", async () => {
    const property = {
      id: "property-1", name: "Updated", referenceCode: "P-1",
      updatedAt: "2026-10-18T09:00:00Z",
    } as Property;
    const previous = [{
      id: "link-1", propertyId: "property-1", ownerId: "owner-1",
      updatedAt: "2026-10-18T09:00:00Z",
    }] as PropertyOwnerLink[];
    mock.rpc.mockResolvedValueOnce({ data: {
      property: {
        id: "property-1", portfolio_id: "portfolio-1", name: "Updated",
        reference_code: "P-1", updated_at: "2026-10-18T10:00:00Z",
      },
      links: [{
        id: "link-2", property_id: "property-1", owner_id: "owner-2",
        portfolio_id: "portfolio-1", updated_at: "2026-10-18T10:00:00Z",
      }],
    }, error: null });
    const saved = await savePropertyWithOwnersPersisted(
      property, ["owner-2"], property.updatedAt, previous, "portfolio-1",
    );
    expect(mock.rpc).toHaveBeenCalledWith("save_property_with_owners", {
      p_property: expect.objectContaining({ id: "property-1", name: "Updated", portfolio_id: "portfolio-1" }),
      p_owner_ids: ["owner-2"],
      p_expected_updated_at: property.updatedAt,
      p_expected_links: [{ id: "link-1", owner_id: "owner-1", updated_at: previous[0].updatedAt }],
    });
    expect(saved.property.updatedAt).toBe("2026-10-18T10:00:00Z");
    expect(saved.links[0].ownerId).toBe("owner-2");
  });

  it("rejects incomplete property ownership acknowledgement and absent migration", async () => {
    const property = { id: "property-1", name: "Updated" } as Property;
    mock.rpc.mockResolvedValueOnce({ data: {
      property: { id: "property-1", portfolio_id: "portfolio-1" }, links: [],
    }, error: null });
    await expect(savePropertyWithOwnersPersisted(property, ["owner-2"], null, [], "portfolio-1"))
      .rejects.toThrow("did not confirm all property owner links");
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(savePropertyWithOwnersPersisted(property, [], null, [], "portfolio-1"))
      .rejects.toThrow("atomic property-and-owner migration");
  });

  it("requires all lease assignment ids in the combined edit acknowledgement", async () => {
    const lease = { id: "lease-1", propertyId: "property-1", updatedAt: "2026-10-18T09:00:00Z" } as Lease;
    const assignment = {
      id: "assignment-1", leaseId: "lease-1", unitId: "unit-1",
      startDate: "2026-01-01", endDate: null, updatedAt: "2026-10-18T09:00:00Z",
    } as LeaseUnitAssignment;
    mock.rpc.mockResolvedValueOnce({ data: {
      lease: { id: "lease-1", portfolio_id: "portfolio-1", updated_at: "2026-10-18T10:00:00Z" },
      tenants: [],
      assignments: [{ id: "assignment-1", lease_id: "lease-1", unit_id: "unit-1",
        portfolio_id: "portfolio-1", updated_at: "2026-10-18T10:00:00Z" }],
      receivables: [], removed_receivable_ids: [],
    }, error: null });
    const saved = await saveLeaseWithAssignments(
      lease, [], [assignment], [assignment], "portfolio-1", lease.updatedAt,
    );
    expect(mock.rpc).toHaveBeenCalledWith("client_save_lease_with_assignments", {
      p_lease: expect.objectContaining({ id: "lease-1", portfolio_id: "portfolio-1" }),
      p_tenants: [], p_expected_updated_at: lease.updatedAt,
      p_expected_assignments: [{ id: "assignment-1", updated_at: assignment.updatedAt }],
      p_assignments: [expect.objectContaining({ id: "assignment-1", lease_id: "lease-1" })],
      p_schedule_from: null, p_expected_receivables: [], p_removed_receivables: [], p_new_receivables: [],
    });
    expect(saved.assignments[0].updatedAt).toBe("2026-10-18T10:00:00Z");

    const fresh = ["new-rent", "new-charges"].map(id => ({
      id, leaseId: lease.id, propertyId: lease.propertyId, unitId: "unit-1",
    })) as ReceivableItem[];
    mock.rpc.mockResolvedValueOnce({ data: {
      lease: { id: "lease-1", portfolio_id: "portfolio-1" }, tenants: [],
      assignments: [{ id: "assignment-1", lease_id: "lease-1", portfolio_id: "portfolio-1" }],
      receivables: [
        { id: "new-rent", lease_id: "lease-1", portfolio_id: "portfolio-1" },
        { id: "new-rent", lease_id: "lease-1", portfolio_id: "portfolio-1" },
      ], removed_receivable_ids: [],
    }, error: null });
    await expect(saveLeaseWithAssignments(lease, [], [assignment], [assignment],
      "portfolio-1", lease.updatedAt, { fromDate: "2026-10-18", expected: [], removed: [], fresh }))
      .rejects.toThrow("did not confirm the lease and all unit assignments");

    mock.rpc.mockResolvedValueOnce({ data: {
      lease: { id: "lease-1", portfolio_id: "portfolio-1" }, tenants: [], assignments: [],
    }, error: null });
    await expect(saveLeaseWithAssignments(lease, [], [assignment], [assignment], "portfolio-1", lease.updatedAt))
      .rejects.toThrow("did not confirm the lease and all unit assignments");
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    await expect(saveLeaseWithAssignments(lease, [], [assignment], [assignment], "portfolio-1", lease.updatedAt))
      .rejects.toThrow("secured lease-assignment database migration");
  });

  it("requires a matching acknowledgement for draft amendment deletion", async () => {
    const amendment = { id: "amendment-1", updatedAt: "2026-10-18T09:00:00Z" } as LeaseAmendment;
    mock.rpc.mockResolvedValueOnce({ data: { amendment_id: amendment.id }, error: null });
    await deleteDraftAmendment(amendment, "portfolio-1");
    expect(mock.rpc).toHaveBeenCalledWith("delete_draft_amendment", {
      p_amendment_id: amendment.id, p_portfolio_id: "portfolio-1",
      p_expected_updated_at: amendment.updatedAt,
    });
    mock.rpc.mockResolvedValueOnce({ data: { amendment_id: "other" }, error: null });
    await expect(deleteDraftAmendment(amendment, "portfolio-1"))
      .rejects.toThrow("did not confirm amendment deletion");
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Not found" } });
    await expect(deleteDraftAmendment(amendment, "portfolio-1"))
      .rejects.toThrow("amendment deletion database migration");
  });
});
