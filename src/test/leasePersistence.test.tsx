import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lease, LeaseUnitAssignment } from "@/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";
import type { CashReceipt, ReceivableItem } from "@/types/receivables";
import type { CostAllocationResult, CostEntry, AllocationRule, AllocationRuleUnitShare } from "@/types/costs";

const mock = vi.hoisted(() => ({
  currentPortfolioId: "portfolio-1" as string | null,
  role: "editor" as "editor" | "viewer",
  nextId: 0,
  loadPortfolio: vi.fn(),
  loadLeaseReceivables: vi.fn(),
  insertAsync: vi.fn(),
  insertReturningAsync: vi.fn(),
  insertManyAsync: vi.fn(),
  upsertManyAsync: vi.fn(),
  removeAsync: vi.fn(),
  removeManyAsync: vi.fn(),
  removeWhereAsync: vi.fn(),
  updateAsync: vi.fn(),
  updateReturningAsync: vi.fn(),
  saveCostEntryWithAllocations: vi.fn(),
  saveReceiptAllocations: vi.fn(),
  createLeaseWithSchedule: vi.fn(),
  saveLeaseWithTenantStatuses: vi.fn(),
  saveLeaseWithAssignments: vi.fn(),
  deleteDraftAmendment: vi.fn(),
  changeAmendmentStatus: vi.fn(),
  closeLeaseAtomically: vi.fn(),
  deleteLeaseAtomically: vi.fn(),
  saveAllocationRuleWithShares: vi.fn(),
  createChargesReconciliation: vi.fn(),
  deleteChargesReconciliation: vi.fn(),
  saveAmendmentWithChanges: vi.fn(),
  activateAmendmentWithSchedule: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/context/PortfolioContext", () => ({
  usePortfolio: () => ({
    currentPortfolioId: mock.currentPortfolioId,
    currentPortfolio: mock.currentPortfolioId ? { role: mock.role } : null,
    loading: false,
  }),
}));
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ receivableLeadDays: 30, t: (key: string) => key }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock("@/lib/repo", () => ({
  loadPortfolio: mock.loadPortfolio,
  loadLeaseReceivables: mock.loadLeaseReceivables,
  newId: () => `id-${++mock.nextId}`,
  saveCostEntryWithAllocations: mock.saveCostEntryWithAllocations,
  saveReceiptAllocations: mock.saveReceiptAllocations,
  createLeaseWithSchedule: mock.createLeaseWithSchedule,
  saveLeaseWithTenantStatuses: mock.saveLeaseWithTenantStatuses,
  saveLeaseWithAssignments: mock.saveLeaseWithAssignments,
  deleteDraftAmendment: mock.deleteDraftAmendment,
  changeAmendmentStatus: mock.changeAmendmentStatus,
  closeLeaseAtomically: mock.closeLeaseAtomically,
  deleteLeaseAtomically: mock.deleteLeaseAtomically,
  saveAllocationRuleWithShares: mock.saveAllocationRuleWithShares,
  createChargesReconciliation: mock.createChargesReconciliation,
  deleteChargesReconciliation: mock.deleteChargesReconciliation,
  saveAmendmentWithChanges: mock.saveAmendmentWithChanges,
  activateAmendmentWithSchedule: mock.activateAmendmentWithSchedule,
  TABLES: {
    leases: "leases", leaseUnitAssignments: "lease_unit_assignments",
    units: "units", amendments: "lease_amendments", amendmentChanges: "amendment_changes",
    receivableItems: "receivable_items", cashReceipts: "cash_receipts",
    allocations: "receipt_allocations", tenants: "tenants",
    chargesReconciliations: "charges_reconciliations",
    costEntries: "cost_entries", costAllocationResults: "cost_allocation_results",
    allocationRuleUnitShares: "allocation_rule_unit_shares",
  },
  mirror: {
    insertAsync: mock.insertAsync, insertReturningAsync: mock.insertReturningAsync, insertManyAsync: mock.insertManyAsync,
    upsertManyAsync: mock.upsertManyAsync,
    removeAsync: mock.removeAsync, removeManyAsync: mock.removeManyAsync, removeWhereAsync: mock.removeWhereAsync,
    updateAsync: mock.updateAsync, updateReturningAsync: mock.updateReturningAsync,
  },
}));

import { AppProvider, useAppData } from "@/context/AppContext";
import { localTodayISO } from "@/lib/calendarToday";

const snapshot = () => ({
  properties: [{ id: "property-1", portfolioId: "portfolio-1", currencyCode: "EUR" }],
  propertyOwners: [], propertyOwnerLinks: [],
  units: [
    { id: "unit-1", propertyId: "property-1", unitType: "apartment" },
    { id: "unit-2", propertyId: "property-1", unitType: "parking" },
  ],
  tenants: [{ id: "tenant-1", portfolioId: "portfolio-1", firstName: "Test", lastName: "Tenant", status: "applicant", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
  leases: [], guarantees: [], leaseUnitAssignments: [], amendments: [], amendmentChanges: [],
  receivableItems: [], cashReceipts: [], allocations: [], tickets: [], vendors: [],
  costCategories: [], costEntries: [], allocationRules: [], allocationRuleUnitShares: [],
  costAllocationResults: [], chargesReconciliations: [],
});

const leaseDraft = {
  leaseReference: "TEST-LEASE", propertyId: "property-1", unitId: "unit-1",
  primaryTenantId: "tenant-1", tenantIds: ["tenant-1"], billingTenantId: "tenant-1", coTenantIds: [],
  lifecycleStage: "draft", startDate: "2026-01-01", endDate: "2026-12-31",
  monthlyRent: 1200, monthlyCharges: 100, rentFormula: 1, dueDayOfMonth: 1,
} as Omit<Lease, "id" | "createdAt" | "updatedAt">;

const assignmentDrafts = [
  { unitId: "unit-1", startDate: "2026-01-01", endDate: null, rentShare: 1100, chargesShare: 100 },
  { unitId: "unit-2", startDate: "2026-01-01", endDate: null, rentShare: 100, chargesShare: 0 },
];

const savedAssignment: LeaseUnitAssignment = {
  id: "assignment-1", leaseId: "lease-1", unitId: "unit-1",
  startDate: "2026-01-01", endDate: "2026-12-31", rentShare: 1200,
  chargesShare: 100, notes: "", createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

const savedCost: CostEntry = {
  id: "cost-1", categoryId: "category-1", propertyId: "property-1", unitId: null,
  label: "Shared expense", description: "", frequency: "one-off",
  startDate: "2026-01-01", endDate: null, amount: 100, currencyCode: "EUR",
  isTax: false, recoveryType: "owner-only", allocationRuleId: "rule-1",
  vendorName: "", invoiceReference: "", status: "active", notes: "",
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const savedRule: AllocationRule = {
  id: "rule-1", propertyId: "property-1", name: "Equal", method: "equal",
  applyOnlyToOccupiedUnits: false, includeUnavailableUnits: true, notes: "",
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const savedCostAllocation: CostAllocationResult = {
  id: "allocation-1", costEntryId: "cost-1", propertyId: "property-1", unitId: "unit-1",
  allocatedAmount: 100, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 100,
  periodStart: "2026-01-01", periodEnd: "2026-01-01",
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const savedShare: AllocationRuleUnitShare = {
  id: "share-1", allocationRuleId: "rule-1", unitId: "unit-1",
  percentageShare: 100, fixedAmountShare: null, coefficient: null,
};

const receiptDraft = {
  tenantId: "tenant-1", leaseId: null, propertyId: "property-1", unitId: null,
  sourceType: "manual", paymentDate: "2026-01-15", bookingDate: null, valueDate: null,
  amountReceived: 100, currencyCode: "EUR", payerName: null, payerIban: null, payerBic: null,
  reference: null, remittanceInformation: null, endToEndReference: null,
  status: "unmatched", unmatchedAmount: 100, notes: "", importBatchId: null, rawBankTransactionId: null,
} as Omit<CashReceipt, "id" | "createdAt" | "updatedAt">;

const receivable = (id: string, currencyCode: string, dueDate: string) => ({
  id, tenantId: "tenant-1", leaseId: null, propertyId: "property-1", unitId: "unit-1",
  itemType: "rent", label: "Rent", periodMonth: "2026-01", dueDate, currencyCode,
  expectedAmount: 100, allocatedAmount: 0, outstandingAmount: 100, status: "open",
  priority: 1, origin: "manual", notes: "", createdAt: "2026-01-01", updatedAt: "2026-01-01",
}) as ReceivableItem;

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

describe("AppContext persistence", () => {
  beforeEach(() => {
    mock.currentPortfolioId = "portfolio-1";
    mock.role = "editor";
    mock.nextId = 0;
    mock.loadPortfolio.mockReset().mockImplementation(async () => snapshot());
    mock.loadLeaseReceivables.mockReset().mockResolvedValue([]);
    mock.insertAsync.mockReset().mockResolvedValue(null);
    mock.insertReturningAsync.mockReset().mockImplementation(async (_table: string, row: object) => row);
    mock.insertManyAsync.mockReset().mockResolvedValue(null);
    mock.upsertManyAsync.mockReset().mockResolvedValue(null);
    mock.removeAsync.mockReset().mockResolvedValue(null);
    mock.removeManyAsync.mockReset().mockResolvedValue(null);
    mock.removeWhereAsync.mockReset().mockResolvedValue(null);
    mock.updateAsync.mockReset().mockResolvedValue(null);
    mock.updateReturningAsync.mockReset().mockImplementation(async (_table: string, _id: string, row: object) => row);
    mock.saveCostEntryWithAllocations.mockReset().mockImplementation(async (entry, allocations) => ({ entry, allocations }));
    mock.saveReceiptAllocations.mockReset().mockImplementation(async (receipt, receivables, allocations) => ({
      receipt, receivables: receivables.map(({ item }) => item), allocations,
    }));
    mock.createLeaseWithSchedule.mockReset().mockImplementation(async (lease, assignments, receivables, tenantStatuses) => ({
      lease, assignments, receivables, tenants: tenantStatuses.map(({ tenant }) => tenant),
    }));
    mock.saveLeaseWithTenantStatuses.mockReset().mockImplementation(async (lease, tenantStatuses) => ({
      lease, tenants: tenantStatuses.map(({ item }: { item: { id: string } }) => item),
    }));
    mock.saveLeaseWithAssignments.mockReset().mockImplementation(async (lease, tenantStatuses, _expected, assignments, _portfolio, _version, schedule) => ({
      lease, tenants: tenantStatuses.map(({ item }: { item: { id: string } }) => item), assignments,
      receivables: schedule?.fresh ?? [], removedReceivableIds: schedule?.removed.map((item: ReceivableItem) => item.id) ?? [],
    }));
    mock.deleteDraftAmendment.mockReset().mockResolvedValue(undefined);
    mock.closeLeaseAtomically.mockReset().mockImplementation(async (lease: Lease, _portfolioId: string, _expected: string, vacancyDate: string, freeUnits: boolean) => {
      const state = await mock.loadPortfolio();
      const updatedAt = "2026-10-17T10:00:00Z";
      const assignments = state.leaseUnitAssignments
        .filter((item: LeaseUnitAssignment) => item.leaseId === lease.id && item.startDate <= vacancyDate)
        .map((item: LeaseUnitAssignment) => ({ ...item, endDate: !item.endDate || item.endDate > vacancyDate ? vacancyDate : item.endDate, updatedAt }));
      const affectedUnitIds = new Set(assignments.map((item: LeaseUnitAssignment) => item.unitId));
      const occupiedElsewhere = new Set(state.leaseUnitAssignments.filter((item: LeaseUnitAssignment) =>
        item.leaseId !== lease.id && item.startDate <= "2026-10-17" && (!item.endDate || item.endDate >= "2026-10-17") &&
        state.leases.some((other: Lease) => other.id === item.leaseId && other.lifecycleStage === "active"),
      ).map((item: LeaseUnitAssignment) => item.unitId));
      return {
        lease: { ...lease, updatedAt }, assignments,
        amendments: state.amendments.filter((item: LeaseAmendment) => item.leaseId === lease.id).map((item: LeaseAmendment) =>
          item.status === "active" ? { ...item, status: lease.lifecycleStage === "terminated" ? "terminated" : "ended", updatedAt } : item),
        units: state.units.filter((item: { id: string }) => affectedUnitIds.has(item.id)).map((item: { id: string; currentStatus?: string }) =>
          freeUnits && !occupiedElsewhere.has(item.id) && item.currentStatus !== "archived" && item.currentStatus !== "vacant"
            ? { ...item, currentStatus: "vacant", availableFrom: vacancyDate, updatedAt } : item),
        tenants: state.tenants.filter((item: { id: string }) => lease.tenantIds.includes(item.id)).map((item: { id: string; status: string }) => ({
          ...item, status: state.leases.some((other: Lease) => other.id !== lease.id && other.lifecycleStage === "active" && other.tenantIds.includes(item.id)) ? "active" : "former", updatedAt,
        })),
      };
    });
    mock.deleteLeaseAtomically.mockReset().mockImplementation(async (leaseId: string) => {
      const state = await mock.loadPortfolio();
      const deletedLease = state.leases.find((item: Lease) => item.id === leaseId);
      return state.tenants.filter((item: { id: string }) => deletedLease?.tenantIds.includes(item.id))
        .map((item: { id: string; status: string }) => ({ ...item, status: "applicant", updatedAt: "2026-10-17T10:00:00Z" }));
    });
    mock.saveAllocationRuleWithShares.mockReset().mockImplementation(async (rule, shares) => ({ rule, shares }));
    mock.createChargesReconciliation.mockReset().mockImplementation(async (reconciliation, receivable) => ({ reconciliation, receivable }));
    mock.deleteChargesReconciliation.mockReset().mockResolvedValue(undefined);
    mock.saveAmendmentWithChanges.mockReset().mockImplementation(async (amendment, changes) => ({ amendment, changes }));
    mock.activateAmendmentWithSchedule.mockReset().mockImplementation(async (
      _targetId, lease, assignments, amendments, removedReceivables, newReceivables, tenants,
    ) => ({
      lease,
      assignments: assignments.map(({ item }: { item: LeaseUnitAssignment }) => item),
      amendments: amendments.map(({ item }: { item: LeaseAmendment }) => item),
      receivables: newReceivables,
      removedReceivableIds: removedReceivables.map(({ id }: ReceivableItem) => id),
      tenants: tenants.map(({ item }: { item: { id: string } }) => item),
    }));
    mock.toast.mockReset();
  });

  it("does not report cancelled or written-off receivables as tenant or lease debt", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const items = [
      { ...receivable("open", "EUR", "2026-01-01"), leaseId: lease.id },
      { ...receivable("cancelled", "EUR", "2026-01-01"), leaseId: lease.id, status: "cancelled" as const },
      { ...receivable("written-off", "EUR", "2026-01-01"), leaseId: lease.id, status: "written-off" as const },
    ];
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], receivableItems: items,
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const expected = {
      outstanding: [{ currencyCode: "EUR", amount: 100 }],
      overdue: [{ currencyCode: "EUR", amount: 100 }],
    };
    expect(result.current.getLeaseOutstanding(lease.id)).toEqual(expected);
    expect(result.current.getTenantOutstanding("tenant-1")).toEqual(expected);
  });

  it("keeps lease and tenant debt in separate currencies", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], receivableItems: [
        { ...receivable("eur-debt", "EUR", "2026-01-01"), leaseId: lease.id },
        { ...receivable("gbp-debt", "GBP", "2026-01-01"), leaseId: lease.id, outstandingAmount: 75 },
      ],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const expected = {
      outstanding: [{ currencyCode: "EUR", amount: 100 }, { currencyCode: "GBP", amount: 75 }],
      overdue: [{ currencyCode: "EUR", amount: 100 }, { currencyCode: "GBP", amount: 75 }],
    };
    expect(result.current.getLeaseOutstanding(lease.id)).toEqual(expected);
    expect(result.current.getTenantOutstanding("tenant-1")).toEqual(expected);
  });

  it("persists only the final assignment rows for a multi-unit lease", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addLease(leaseDraft, { receivableAssignments: assignmentDrafts });
    });

    expect(result.current.leases).toHaveLength(1);
    expect(result.current.leaseUnitAssignments.map(row => row.unitId)).toEqual(["unit-1", "unit-2"]);
    expect(mock.createLeaseWithSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ leaseReference: "TEST-LEASE" }),
      expect.arrayContaining([expect.objectContaining({ unitId: "unit-1" }), expect.objectContaining({ unitId: "unit-2" })]),
      expect.any(Array), expect.any(Array), "portfolio-1",
    );
    expect(mock.insertManyAsync.mock.calls.filter(([table]) => table === "lease_unit_assignments")).toHaveLength(0);
  });

  it("persists the linked tenant lifecycle in the same lease creation transaction", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addLease({ ...leaseDraft, lifecycleStage: "active" }, {
        receivableAssignments: assignmentDrafts,
      });
    });

    expect(mock.createLeaseWithSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleStage: "active" }),
      expect.any(Array), expect.any(Array),
      [expect.objectContaining({ tenant: expect.objectContaining({ id: "tenant-1", status: "active" }), expectedUpdatedAt: expect.any(String) })],
      "portfolio-1",
    );
    expect(result.current.tenants[0].status).toBe("active");
    expect(mock.updateAsync).not.toHaveBeenCalledWith("tenants", expect.anything(), expect.anything());
  });

  it("keeps the server version when deriving a stale tenant status on load", async () => {
    const originalTenant = snapshot().tenants[0];
    const activeLease = {
      ...leaseDraft, id: "lease-1", lifecycleStage: "active",
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [activeLease], tenants: [originalTenant],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenants[0].status).toBe("active");
    expect(result.current.tenants[0].updatedAt).toBe(originalTenant.updatedAt);
    await act(async () => {
      await result.current.updateTenantPersisted({ ...result.current.tenants[0], phone: "+32 2 555 01 01" });
    });
    expect(mock.updateReturningAsync).toHaveBeenCalledWith(
      "tenants", originalTenant.id,
      expect.objectContaining({ status: "active", phone: "+32 2 555 01 01" }),
      originalTenant.updatedAt,
    );
  });

  it("does not mark a property-local due-today receivable as historical paid", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      properties: [{ id: "property-1", portfolioId: "portfolio-1", currencyCode: "EUR",
        countryCode: "GB", timeZone: "Europe/London" }],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const priorTimeZone = process.env.TZ;
    process.env.TZ = "Europe/Brussels";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T23:30:00Z"));
    try {
      expect(localTodayISO()).toBe("2026-01-02");
      await act(async () => {
        await result.current.addLease({ ...leaseDraft, lifecycleStage: "active",
          startDate: "2025-12-01", endDate: "2026-02-28" }, {
          receivableAssignments: [{ unitId: "unit-1", startDate: "2025-12-01", endDate: null,
            rentShare: 1200, chargesShare: 100 }],
          historicalPaidBackfill: true,
        });
      });
      const scheduled = mock.createLeaseWithSchedule.mock.calls[0][2] as ReceivableItem[];
      const historical = scheduled.filter(item => item.dueDate === "2025-12-01");
      expect(historical).toHaveLength(2);
      expect(historical.every(item => item.status === "paid")).toBe(true);
      expect(scheduled.filter(item => item.dueDate === "2026-01-01")).toEqual([
        expect.objectContaining({ itemType: "rent", status: "open", outstandingAmount: 1200 }),
        expect.objectContaining({ itemType: "charges", status: "open", outstandingAmount: 100 }),
      ]);
    } finally {
      vi.useRealTimers();
      if (priorTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = priorTimeZone;
    }
  });

  it("does not save an active lease with an uncovered first billing cycle", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.addLease({ ...leaseDraft, lifecycleStage: "active" }, {
        receivableAssignments: [
          { unitId: "unit-2", startDate: "2026-01-01", endDate: null, rentShare: 100, chargesShare: 0 },
          { unitId: "unit-1", startDate: "2026-02-01", endDate: null, rentShare: 1100, chargesShare: 100 },
        ],
      })).rejects.toThrow("No main unit is assigned for billing cycle 2026-01-01");
    });

    expect(mock.createLeaseWithSchedule).not.toHaveBeenCalled();
    expect(result.current.leases).toHaveLength(0);
  });

  it("leaves local state unchanged when atomic lease creation fails", async () => {
    mock.createLeaseWithSchedule.mockRejectedValue(new Error("Permission denied"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.addLease(leaseDraft, { receivableAssignments: assignmentDrafts }))
        .rejects.toThrow("Permission denied");
    });

    expect(mock.createLeaseWithSchedule).toHaveBeenCalledOnce();
    expect(mock.removeAsync).not.toHaveBeenCalledWith("leases", expect.anything());
    expect(result.current.leases).toHaveLength(0);
    expect(result.current.leaseUnitAssignments).toHaveLength(0);
  });

  it("blocks deletion of a property containing units before requesting database removal", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.deleteProperty("property-1")).rejects.toThrow("linked records");
    });

    expect(mock.removeAsync).not.toHaveBeenCalled();
    expect(result.current.properties).toHaveLength(1);
  });

  it("blocks deletion of a unit or tenant linked to a lease", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.deleteUnitPersisted("unit-1")).rejects.toThrow("linked records");
      await expect(result.current.deleteTenantPersisted("tenant-1")).rejects.toThrow("linked leases");
    });

    expect(mock.removeAsync).not.toHaveBeenCalled();
  });

  it("keeps the old lease status if signature persistence fails", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({ ...snapshot(), leases: [lease] }));
    mock.saveLeaseWithTenantStatuses.mockRejectedValue(new Error("Lease update rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateLeasePersisted({ ...lease, lifecycleStage: "pending-signature" }))
        .rejects.toMatchObject({ message: "Lease update rejected" });
    });

    expect(result.current.leases[0].lifecycleStage).toBe("draft");
    expect(mock.updateAsync).not.toHaveBeenCalledWith("leases", expect.anything(), expect.anything());
  });

  it("publishes a lease deletion and tenant status only after the atomic delete succeeds", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
      tenants: [{ ...snapshot().tenants[0], status: "active" }],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.deleteLease("lease-1"); });

    expect(mock.deleteLeaseAtomically).toHaveBeenCalledWith("lease-1", "portfolio-1", lease.updatedAt);
    expect(result.current.leases).toHaveLength(0);
    expect(result.current.leaseUnitAssignments).toHaveLength(0);
    expect(result.current.tenants[0].status).toBe("applicant");
    expect(mock.removeAsync).not.toHaveBeenCalled();
  });

  it("keeps lease and tenant state unchanged when atomic deletion fails", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
      tenants: [{ ...snapshot().tenants[0], status: "active" }],
    }));
    mock.deleteLeaseAtomically.mockRejectedValue(new Error("Lease has financial records"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.deleteLease("lease-1")).rejects.toThrow("financial records");
    });

    expect(result.current.leases).toHaveLength(1);
    expect(result.current.leaseUnitAssignments).toHaveLength(1);
    expect(result.current.tenants[0].status).toBe("active");
    expect(mock.updateAsync).not.toHaveBeenCalled();
    expect(mock.removeAsync).not.toHaveBeenCalled();
  });

  it("persists lease closure and its assignment, unit, and amendment effects before updating state", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const assignment = { ...savedAssignment, endDate: null };
    const amendment = { id: "amendment-1", leaseId: "lease-1", status: "active", updatedAt: "2026-01-01" };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [assignment], amendments: [amendment],
      units: [{ ...snapshot().units[0], currentStatus: "occupied", availableFrom: null }],
    }));
    mock.updateReturningAsync.mockImplementation(async (_table: string, _id: string, row: object) => ({
      ...row, updatedAt: "2026-10-17T10:00:00Z",
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.finalizeLeasePersisted({ ...lease, lifecycleStage: "ended", endDate: "2026-06-30" });
    });

    expect(result.current.leases[0].lifecycleStage).toBe("ended");
    expect(result.current.leaseUnitAssignments[0].endDate).toBe("2026-06-30");
    expect(result.current.units[0].currentStatus).toBe("vacant");
    expect(result.current.amendments[0].status).toBe("ended");
    expect(result.current.tenants[0].status).toBe("former");
    expect([
      result.current.leases[0], result.current.leaseUnitAssignments[0], result.current.units[0],
      result.current.amendments[0], result.current.tenants[0],
    ].map(item => item.updatedAt)).toEqual(Array(5).fill("2026-10-17T10:00:00Z"));
    expect(mock.closeLeaseAtomically).toHaveBeenCalledWith(
      expect.objectContaining({ id: lease.id, lifecycleStage: "ended" }),
      "portfolio-1", lease.updatedAt, "2026-06-30", true, null, null,
    );
    expect(mock.updateReturningAsync).not.toHaveBeenCalled();
    expect(mock.updateAsync).not.toHaveBeenCalled();
  });

  it("keeps a lease and tenant unchanged when their atomic update fails", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({ ...snapshot(), leases: [lease] }));
    mock.saveLeaseWithTenantStatuses.mockRejectedValue(new Error("Tenant update rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateLeasePersisted({ ...lease, lifecycleStage: "active" }, "activated"))
        .rejects.toThrow("Tenant update rejected");
    });

    expect(result.current.leases[0].lifecycleStage).toBe("draft");
    expect(result.current.tenants[0].status).toBe("applicant");
    expect(mock.saveLeaseWithTenantStatuses).toHaveBeenCalledWith(
      expect.objectContaining({ id: lease.id, lifecycleStage: "active" }),
      [expect.objectContaining({ item: expect.objectContaining({ id: "tenant-1", status: "active" }), expectedUpdatedAt: expect.any(String) })],
      "portfolio-1", lease.updatedAt, "activated", null,
    );
    expect(mock.updateAsync).not.toHaveBeenCalledWith("leases", expect.anything(), expect.anything());
  });

  it("keeps lease and unit assignments unchanged when their combined save fails", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
    }));
    mock.saveLeaseWithAssignments.mockRejectedValue(new Error("Unit window rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateLeaseWithAssignmentsPersisted(
        { ...lease, monthlyRent: 1300 }, [{
          unitId: "unit-1", rentShare: 1300, chargesShare: 100,
          startDate: "2026-01-01", endDate: "2026-12-31",
        }],
      )).rejects.toThrow("Unit window rejected");
    });

    expect(result.current.leases[0].monthlyRent).toBe(1200);
    expect(result.current.leaseUnitAssignments[0].rentShare).toBe(1200);
    expect(mock.saveLeaseWithAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lease-1", monthlyRent: 1300 }), [],
      [savedAssignment], [expect.objectContaining({ id: "assignment-1", rentShare: 1300 })],
      "portfolio-1", lease.updatedAt, expect.objectContaining({ fromDate: expect.any(String) }),
    );
    expect(mock.saveLeaseWithTenantStatuses).not.toHaveBeenCalled();
    expect(mock.upsertManyAsync).not.toHaveBeenCalled();
  });

  it("uses the database-returned lease and unit versions after combined save", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
    }));
    mock.saveLeaseWithAssignments.mockImplementation(async (edited: Lease, tenantStatuses: unknown[], _expected: unknown, assignments: LeaseUnitAssignment[]) => ({
      lease: { ...edited, updatedAt: "2026-10-18T12:00:00Z" },
      tenants: tenantStatuses,
      assignments: assignments.map(item => ({ ...item, updatedAt: "2026-10-18T12:00:00Z" })),
      receivables: [], removedReceivableIds: [],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.updateLeaseWithAssignmentsPersisted(
        { ...lease, monthlyRent: 1300 }, [{
          unitId: "unit-1", rentShare: 1300, chargesShare: 100,
          startDate: "2026-01-01", endDate: "2026-12-31",
        }],
      );
    });
    expect(result.current.leases[0].updatedAt).toBe("2026-10-18T12:00:00Z");
    expect(result.current.leaseUnitAssignments[0]).toMatchObject({
      rentShare: 1300, updatedAt: "2026-10-18T12:00:00Z",
    });
  });

  it("replaces only unpaid future schedule rows when lease billing changes", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "signed",
      pricingMode: "all-inclusive", startDate: "2030-01-01", endDate: "2030-12-31",
      monthlyCharges: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const assignment = { ...savedAssignment, startDate: "2030-01-01", endDate: "2030-12-31", chargesShare: 0 };
    const oldRent = { ...receivable("future-open", "EUR", "2030-01-01"),
      leaseId: lease.id, tenantId: "tenant-1", propertyId: "property-1", unitId: "unit-1",
      origin: "lease-schedule", periodMonth: "2030-01", expectedAmount: 1200,
      outstandingAmount: 1200 };
    const paidRent = { ...receivable("future-paid", "EUR", "2030-02-01"),
      leaseId: lease.id, tenantId: "tenant-1", propertyId: "property-1", unitId: "unit-1",
      origin: "lease-schedule", periodMonth: "2030-02", status: "paid" as const,
      expectedAmount: 1200, allocatedAmount: 1200, outstandingAmount: 0 };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [assignment], receivableItems: [oldRent, paidRent],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateLeaseWithAssignmentsPersisted({ ...lease, monthlyRent: 1300 }, [{
        unitId: "unit-1", rentShare: 1300, chargesShare: 0,
        startDate: "2030-01-01", endDate: "2030-12-31",
      }]);
    });

    const schedule = mock.saveLeaseWithAssignments.mock.calls[0][6];
    expect(schedule.expected.map((item: ReceivableItem) => item.id)).toEqual(["future-open", "future-paid"]);
    expect(schedule.removed.map((item: ReceivableItem) => item.id)).toEqual(["future-open"]);
    expect(schedule.fresh).toEqual([expect.objectContaining({ dueDate: "2030-01-01", expectedAmount: 1300 })]);
    expect(result.current.receivableItems).toEqual([
      expect.objectContaining({ id: "future-paid", status: "paid", allocatedAmount: 1200 }),
      expect.objectContaining({ dueDate: "2030-01-01", expectedAmount: 1300 }),
    ]);
  });

  it("refuses a lease unit edit that would orphan an already paid schedule row", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "signed",
      startDate: "2030-01-01", endDate: "2030-12-31",
      createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const assignment = { ...savedAssignment, startDate: "2030-01-01", endDate: "2030-12-31" };
    const paidRent = { ...receivable("future-paid", "EUR", "2030-02-01"),
      leaseId: lease.id, tenantId: "tenant-1", propertyId: "property-1", unitId: "unit-1",
      origin: "lease-schedule", periodMonth: "2030-02", status: "paid" as const,
      expectedAmount: 1200, allocatedAmount: 1200, outstandingAmount: 0 };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [assignment], receivableItems: [paidRent],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateLeaseWithAssignmentsPersisted(lease, [{
        unitId: "unit-1", rentShare: 1200, chargesShare: 100,
        startDate: "2030-03-01", endDate: "2030-12-31",
      }])).rejects.toThrow("leases.assignmentReceivableConflict");
    });
    expect(mock.saveLeaseWithAssignments).not.toHaveBeenCalled();
    expect(result.current.leaseUnitAssignments[0].startDate).toBe("2030-01-01");
  });

  it("keeps a paid cycle once when the due day changes on a lease", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "signed",
      startDate: "2030-01-01", endDate: "2030-12-31", dueDayOfMonth: 1,
      createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const assignment = { ...savedAssignment, startDate: "2030-01-01", endDate: "2030-12-31" };
    const paidRent = { ...receivable("paid-january", "EUR", "2030-01-01"),
      leaseId: lease.id, tenantId: "tenant-1", propertyId: "property-1", unitId: "unit-1",
      origin: "lease-schedule" as const, periodMonth: "2030-01", cycleIndex: 1,
      cycleEndDate: "2030-01-31", status: "paid" as const,
      expectedAmount: 1200, allocatedAmount: 1200, outstandingAmount: 0 };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [assignment],
      receivableItems: [paidRent],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateLeaseWithAssignmentsPersisted(
        { ...lease, dueDayOfMonth: 20 }, [{
          unitId: "unit-1", rentShare: 1200, chargesShare: 100,
          startDate: "2030-01-01", endDate: "2030-12-31",
        }],
      );
    });

    const schedule = mock.saveLeaseWithAssignments.mock.calls[0][6];
    expect(schedule.removed).toEqual([]);
    expect(schedule.fresh.filter((item: ReceivableItem) => item.itemType === "rent")).toEqual([]);
    expect(result.current.receivableItems.filter(item => item.itemType === "rent")
      .map(item => item.id)).toEqual(["paid-january"]);
  });

  it("reopens the existing assignment when a past-dated notice is cancelled", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const noticedAssignment = { ...savedAssignment, endDate: "2026-06-30" };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [noticedAssignment],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.updateLeaseWithAssignmentsPersisted(lease, [{
        unitId: "unit-1", rentShare: 1200, chargesShare: 100,
        startDate: "2026-01-01", endDate: "2026-12-31",
      }]);
    });
    expect(mock.saveLeaseWithAssignments).toHaveBeenCalledWith(
      lease, [], [noticedAssignment],
      [expect.objectContaining({ id: noticedAssignment.id, endDate: "2026-12-31" })],
      "portfolio-1", lease.updatedAt, expect.objectContaining({ fromDate: "2026-06-30" }),
    );
    expect(result.current.leaseUnitAssignments).toHaveLength(1);
  });

  it("extends unit coverage and creates the first missing rent cycle on renewal", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active",
      endDate: "2026-06-30", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const assignment = { ...savedAssignment, endDate: "2026-06-30" };
    const oldJuneRent = { ...receivable("june-rent", "EUR", "2026-06-01"),
      leaseId: lease.id, origin: "lease-schedule", periodMonth: "2026-06" };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [assignment],
      receivableItems: [oldJuneRent],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateLeaseWithAssignmentsPersisted(
        { ...lease, endDate: "2026-12-31" }, [{
          unitId: "unit-1", rentShare: 1200, chargesShare: 100,
          startDate: "2026-01-01", endDate: "2026-12-31",
        }],
      );
    });

    const schedule = mock.saveLeaseWithAssignments.mock.calls[0][6];
    expect(schedule.fromDate).toBe("2026-06-30");
    expect(schedule.removed).toEqual([]);
    expect(schedule.fresh).toEqual(expect.arrayContaining([
      expect.objectContaining({ dueDate: "2026-07-01", itemType: "rent", expectedAmount: 1200 }),
      expect.objectContaining({ dueDate: "2026-07-01", itemType: "charges", expectedAmount: 100 }),
    ]));
    expect(result.current.leases[0].endDate).toBe("2026-12-31");
    expect(result.current.leaseUnitAssignments[0].endDate).toBe("2026-12-31");
  });

  it.each(["moveOutScheduledDate", "moveOutActualDate"] as const)(
    "removes an unpaid future cycle when %s is set", async (field) => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active",
      startDate: "2026-01-01", endDate: "2026-12-31",
      moveOutScheduledDate: null, moveOutActualDate: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const julyRent = { ...receivable("july-rent", "EUR", "2026-07-01"),
      leaseId: lease.id, tenantId: "tenant-1", propertyId: "property-1",
      unitId: "unit-1", origin: "lease-schedule", periodMonth: "2026-07",
      expectedAmount: 1200, outstandingAmount: 1200 };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
      receivableItems: [julyRent],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateLeaseWithAssignmentsPersisted(
        { ...lease, [field]: "2026-06-30" }, [{
          unitId: "unit-1", rentShare: 1200, chargesShare: 100,
          startDate: "2026-01-01", endDate: "2026-12-31",
        }],
      );
    });

    const schedule = mock.saveLeaseWithAssignments.mock.calls[0][6];
    expect(schedule.fromDate).toBe("2026-06-30");
    expect(schedule.removed).toEqual([expect.objectContaining({ id: "july-rent" })]);
    expect(schedule.fresh.some((item: ReceivableItem) => item.dueDate === "2026-07-01")).toBe(false);
  });

  it("restores unpaid cycles when a recorded move-out is cancelled", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active",
      startDate: "2026-01-01", endDate: "2026-12-31",
      moveOutActualDate: "2026-06-30", createdAt: "2026-01-01",
      updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateLeaseWithAssignmentsPersisted(
        { ...lease, moveOutActualDate: null }, [{
          unitId: "unit-1", rentShare: 1200, chargesShare: 100,
          startDate: "2026-01-01", endDate: "2026-12-31",
        }],
      );
    });

    const schedule = mock.saveLeaseWithAssignments.mock.calls[0][6];
    expect(schedule.fromDate).toBe("2026-06-30");
    expect(schedule.fresh).toEqual(expect.arrayContaining([
      expect.objectContaining({ dueDate: "2026-07-01", itemType: "rent" }),
      expect.objectContaining({ dueDate: "2026-07-01", itemType: "charges" }),
    ]));
  });

  it("restores missed cycles after cancelling a past-dated notice", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active",
      noticeGiven: true, intendedMoveOutDate: "2026-06-30",
      createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const assignment = { ...savedAssignment, endDate: "2026-06-30" };
    const oldJuneRent = { ...receivable("june-rent", "EUR", "2026-06-01"),
      leaseId: lease.id, origin: "lease-schedule", periodMonth: "2026-06" };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [assignment],
      receivableItems: [oldJuneRent],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.updateLeaseWithAssignmentsPersisted({
        ...lease, noticeGiven: false, intendedMoveOutDate: null,
      }, [{ unitId: "unit-1", rentShare: 1200, chargesShare: 100,
        startDate: "2026-01-01", endDate: "2026-12-31" }]);
    });
    const schedule = mock.saveLeaseWithAssignments.mock.calls[0][6];
    expect(schedule.fromDate).toBe("2026-06-30");
    expect(schedule.removed).toEqual([]);
    expect(schedule.fresh).toEqual(expect.arrayContaining([
      expect.objectContaining({ dueDate: "2026-07-01", itemType: "rent", expectedAmount: 1200 }),
      expect.objectContaining({ dueDate: "2026-07-01", itemType: "charges", expectedAmount: 100 }),
    ]));
    expect(result.current.receivableItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "june-rent", dueDate: "2026-06-01" }),
      expect.objectContaining({ dueDate: "2026-07-01", itemType: "rent" }),
    ]));
  });

  it("keeps closure state unchanged when its atomic tenant update fails", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [{ ...savedAssignment, endDate: null }],
      units: [{ ...snapshot().units[0], currentStatus: "occupied" }],
    }));
    mock.closeLeaseAtomically.mockRejectedValue(new Error("Tenant update rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const originalTenantStatus = result.current.tenants[0].status;

    await act(async () => {
      await expect(result.current.finalizeLeasePersisted({ ...lease, lifecycleStage: "ended", endDate: "2026-06-30" }))
        .rejects.toThrow("Tenant update rejected");
    });

    expect(result.current.leases[0].lifecycleStage).toBe("active");
    expect(result.current.leaseUnitAssignments[0].endDate).toBeNull();
    expect(result.current.units[0].currentStatus).toBe("occupied");
    expect(result.current.tenants[0].status).toBe(originalTenantStatus);
    expect(mock.closeLeaseAtomically).toHaveBeenCalledOnce();
    expect(mock.updateReturningAsync).not.toHaveBeenCalled();
    expect(mock.updateAsync).not.toHaveBeenCalled();
  });

  it("leaves linked rows and the lease open when atomic closure fails", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const assignment = { ...savedAssignment, endDate: null };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [assignment],
      units: [{ ...snapshot().units[0], currentStatus: "occupied", availableFrom: null }],
    }));
    mock.closeLeaseAtomically.mockRejectedValue(new Error("Unit update rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.finalizeLeasePersisted({ ...lease, lifecycleStage: "terminated", endDate: "2026-06-30" }))
        .rejects.toMatchObject({ message: "Unit update rejected" });
    });

    expect(result.current.leases[0].lifecycleStage).toBe("active");
    expect(result.current.leaseUnitAssignments[0].endDate).toBeNull();
    expect(result.current.units[0].currentStatus).toBe("occupied");
    expect(mock.closeLeaseAtomically).toHaveBeenCalledOnce();
    expect(mock.updateAsync).not.toHaveBeenCalled();
    expect(mock.updateReturningAsync).not.toHaveBeenCalled();
  });

  it("can end a lease without marking its unit vacant", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [{ ...savedAssignment, endDate: null }],
      units: [{ ...snapshot().units[0], currentStatus: "unavailable" }],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.finalizeLeasePersisted({ ...lease, lifecycleStage: "ended", endDate: "2026-06-30" }, { freeUnits: false });
    });

    expect(result.current.leaseUnitAssignments[0].endDate).toBe("2026-06-30");
    expect(result.current.units[0].currentStatus).toBe("unavailable");
    expect(mock.updateAsync.mock.calls.some(([table]) => table === "units")).toBe(false);
  });

  it("does not end a lease before its selected future end date", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.finalizeLeasePersisted({ ...lease, lifecycleStage: "ended", endDate: "2099-06-30" }))
        .rejects.toThrow("before its end date");
    });

    expect(result.current.leases[0].lifecycleStage).toBe("active");
    expect(mock.updateAsync).not.toHaveBeenCalled();
  });

  it("keeps a unit occupied when another active lease has a current assignment", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const otherLease = { ...lease, id: "lease-2", leaseReference: "OTHER-LEASE" };
    const otherAssignment = { ...savedAssignment, id: "assignment-2", leaseId: "lease-2", endDate: null };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease, otherLease],
      leaseUnitAssignments: [{ ...savedAssignment, endDate: null }, otherAssignment],
      units: [{ ...snapshot().units[0], currentStatus: "occupied" }],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.finalizeLeasePersisted({ ...lease, lifecycleStage: "ended", endDate: "2026-06-30" });
    });

    expect(result.current.units[0].currentStatus).toBe("occupied");
    expect(mock.updateAsync.mock.calls.some(([table]) => table === "units")).toBe(false);
  });

  it("removes future unit assignments when a lease ends early", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const futureAssignment = { ...savedAssignment, id: "assignment-future", unitId: "unit-2", startDate: "2026-09-01", endDate: null };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [{ ...savedAssignment, endDate: null }, futureAssignment],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.finalizeLeasePersisted({ ...lease, lifecycleStage: "ended", endDate: "2026-06-30" }, { freeUnits: false });
    });

    expect(mock.closeLeaseAtomically).toHaveBeenCalledOnce();
    expect(mock.removeAsync).not.toHaveBeenCalled();
    expect(result.current.leaseUnitAssignments.map(item => item.id)).toEqual(["assignment-1"]);
  });

  it("uses the actual move-out date when it precedes the planned lease end", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.confirmMoveOut({ ...lease, moveOutActualDate: "2026-06-30" });
    });

    expect(result.current.leases[0].endDate).toBe("2026-06-30");
    expect(result.current.leaseUnitAssignments[0].endDate).toBe("2026-06-30");
  });

  it("shows the database-confirmed receivables after lease closure", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const futureOpen = {
      ...receivable("future-open", "EUR", "2026-11-01"),
      leaseId: lease.id, origin: "lease-schedule", periodMonth: "2026-11",
    } as ReceivableItem;
    const futurePaid = {
      ...receivable("future-paid", "EUR", "2026-12-01"),
      leaseId: lease.id, origin: "lease-schedule", periodMonth: "2026-12",
      status: "paid", allocatedAmount: 100, outstandingAmount: 0,
    } as ReceivableItem;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment],
      receivableItems: [futureOpen, futurePaid],
    }));
    mock.loadLeaseReceivables.mockResolvedValue([futurePaid]);
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.finalizeLeasePersisted({ ...lease, lifecycleStage: "ended", endDate: "2026-06-30" });
    });

    expect(mock.loadLeaseReceivables).toHaveBeenCalledWith(lease.id, "portfolio-1");
    expect(result.current.receivableItems.map(item => item.id)).toEqual(["future-paid"]);
  });

  it("keeps amendment state unchanged when the atomic creation fails", async () => {
    mock.saveAmendmentWithChanges.mockRejectedValueOnce(new Error("Amendment changes rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.addAmendment({
        leaseId: "lease-1", title: "New amendment", reason: "Updated terms", notes: "",
        effectiveDate: "2026-06-01", signedDate: null, supersedesAmendmentId: null,
      }, [{ fieldName: "clauseSummary", changeType: "set", oldValue: null, newValue: "Updated terms" }]))
        .rejects.toThrow("Amendment changes rejected");
    });

    expect(result.current.amendments).toHaveLength(0);
    expect(mock.insertAsync).not.toHaveBeenCalled();
  });

  it("uses the database-confirmed amendment number and changes after creation", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({ ...snapshot(), leases: [lease] }));
    mock.saveAmendmentWithChanges.mockImplementationOnce(async (amendment, changes) => ({
      amendment: { ...amendment, portfolioId: "portfolio-1", amendmentNumber: 4 },
      changes: changes.map(change => ({ ...change, portfolioId: "portfolio-1" })),
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.addAmendment({
        leaseId: "lease-1", title: "New amendment", reason: "Updated terms", notes: "",
        effectiveDate: "2026-06-01", signedDate: null, supersedesAmendmentId: null,
      }, [{ fieldName: "clauseSummary", changeType: "set", oldValue: null, newValue: "Updated terms" }]);
    });
    expect(result.current.amendments[0].amendmentNumber).toBe(4);
    expect(result.current.amendmentChanges).toHaveLength(1);
    expect(mock.insertAsync).not.toHaveBeenCalled();
  });

  it("keeps an amendment and its changes unchanged when atomic replacement fails", async () => {
    const amendment: LeaseAmendment = {
      id: "amendment-1", leaseId: "lease-1", amendmentNumber: 1,
      title: "Original", reason: "Original terms", notes: "", effectiveDate: "2026-06-01",
      signedDate: null, status: "draft", supersedesAmendmentId: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    const originalChange: LeaseAmendmentChange = {
      id: "change-1", amendmentId: amendment.id, fieldName: "clauseSummary", changeType: "set",
      oldValue: null, newValue: "Original terms", createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    const lease = { ...leaseDraft, id: amendment.leaseId, createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], amendments: [amendment], amendmentChanges: [originalChange],
    }));
    mock.saveAmendmentWithChanges.mockRejectedValueOnce(new Error("Replacement changes rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.amendments).toHaveLength(1));

    await act(async () => {
      await expect(result.current.updateAmendment(
        { ...amendment, title: "Revised" },
        [{ fieldName: "clauseSummary", changeType: "set", oldValue: "Original terms", newValue: "Revised terms" }],
      )).rejects.toThrow("Replacement changes rejected");
    });

    expect(result.current.amendments[0].title).toBe("Original");
    expect(result.current.amendmentChanges).toEqual([originalChange]);
    expect(mock.saveAmendmentWithChanges).toHaveBeenCalledWith(
      expect.objectContaining({ id: amendment.id, title: "Revised" }),
      expect.any(Array), "portfolio-1", amendment.updatedAt,
    );
    expect(mock.removeWhereAsync).not.toHaveBeenCalled();
  });

  it("deletes only a confirmed draft amendment and preserves state on failure", async () => {
    const draft = {
      id: "draft-amendment", leaseId: "lease-1", amendmentNumber: 1,
      title: "Draft", reason: "Proposed terms", notes: "", effectiveDate: "2026-06-01",
      signedDate: null, status: "draft", supersedesAmendmentId: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as LeaseAmendment;
    const active = { ...draft, id: "active-amendment", amendmentNumber: 2, status: "active" } as LeaseAmendment;
    const change = {
      id: "change-1", amendmentId: draft.id, fieldName: "clauseSummary", changeType: "set",
      oldValue: null, newValue: "Proposed terms", createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as LeaseAmendmentChange;
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], amendments: [draft, active], amendmentChanges: [change],
    }));
    mock.deleteDraftAmendment.mockRejectedValueOnce(new Error("Amendment changed since it was opened"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.amendments).toHaveLength(2));

    await act(async () => {
      await expect(result.current.deleteAmendment(draft.id))
        .rejects.toThrow("Amendment changed since it was opened");
    });
    expect(result.current.amendments).toHaveLength(2);
    expect(result.current.amendmentChanges).toEqual([change]);
    await act(async () => {
      await result.current.deleteAmendment(draft.id);
    });
    expect(mock.deleteDraftAmendment).toHaveBeenCalledWith(draft, "portfolio-1");
    expect(result.current.amendments.map(item => item.id)).toEqual([active.id]);
    expect(result.current.amendmentChanges).toEqual([]);
    await act(async () => {
      await expect(result.current.deleteAmendment(active.id))
        .rejects.toThrow("Only draft amendments can be deleted");
    });
    expect(mock.deleteDraftAmendment).toHaveBeenCalledTimes(2);
    expect(mock.removeAsync).not.toHaveBeenCalledWith("lease_amendments", expect.anything());
  });

  it("keeps lease and assignments unchanged when atomic amendment activation fails", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const amendment = {
      id: "amendment-1", leaseId: "lease-1", amendmentNumber: 1, title: "Renewal", reason: "Updated terms",
      notes: "", effectiveDate: "2026-06-01", signedDate: "2026-05-20", status: "draft",
      supersedesAmendmentId: null, createdAt: "2026-05-20", updatedAt: "2026-05-20",
    };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment], amendments: [amendment],
    }));
    mock.activateAmendmentWithSchedule.mockRejectedValue(new Error("Amendment update rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let activation: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      activation = await result.current.activateAmendment("amendment-1");
    });

    expect(activation).toMatchObject({ ok: false });
    expect(result.current.amendments[0].status).toBe("draft");
    expect(result.current.leases[0].monthlyRent).toBe(1200);
    expect(mock.activateAmendmentWithSchedule).toHaveBeenCalledOnce();
    expect(mock.updateAsync).not.toHaveBeenCalledWith("leases", expect.anything(), expect.anything());
    expect(mock.upsertManyAsync).not.toHaveBeenCalled();
  });

  it("persists zero rent and charges when an amendment explicitly clears both unit shares", async () => {
    const lease = { ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const amendment: LeaseAmendment = {
      id: "amendment-1", leaseId: lease.id, amendmentNumber: 1, title: "Free period", reason: "Agreed concession",
      notes: "", effectiveDate: "2026-06-01", signedDate: "2026-05-20", status: "draft",
      supersedesAmendmentId: null, createdAt: "2026-05-20", updatedAt: "2026-05-20",
    };
    const changes: LeaseAmendmentChange[] = [
      { id: "change-rent", amendmentId: amendment.id, fieldName: "unitRentShare", changeType: "set", oldValue: 1200, newValue: 0, metadata: { unitId: "unit-1" }, createdAt: "2026-05-20", updatedAt: "2026-05-20" },
      { id: "change-charges", amendmentId: amendment.id, fieldName: "unitChargesShare", changeType: "set", oldValue: 100, newValue: 0, metadata: { unitId: "unit-1" }, createdAt: "2026-05-20", updatedAt: "2026-05-20" },
    ];
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment], amendments: [amendment], amendmentChanges: changes,
      receivableItems: [
        { ...receivable("past-rent", "EUR", "2026-05-01"), leaseId: lease.id, origin: "lease-schedule", periodMonth: "2026-05", expectedAmount: 1200, outstandingAmount: 1200 },
        { ...receivable("future-rent", "EUR", "2026-11-01"), leaseId: lease.id, origin: "lease-schedule", periodMonth: "2026-11", expectedAmount: 1200, outstandingAmount: 1200 },
        { ...receivable("future-charges", "EUR", "2026-11-01"), leaseId: lease.id, itemType: "charges", origin: "lease-schedule", periodMonth: "2026-11" },
      ],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let activation: { ok: boolean; reason?: string } | undefined;
    await act(async () => { activation = await result.current.activateAmendment(amendment.id); });

    expect(activation).toEqual({ ok: true });
    expect(result.current.leases[0]).toMatchObject({ monthlyRent: 0, monthlyCharges: 0 });
    expect(result.current.receivableItems.filter(item => item.dueDate >= amendment.effectiveDate)).toHaveLength(0);
    expect(result.current.receivableItems.some(item => item.dueDate < amendment.effectiveDate)).toBe(true);
    expect(result.current.receivableItems.map(item => item.id)).not.toContain("future-rent");
    expect(result.current.receivableItems.map(item => item.id)).not.toContain("future-charges");
    expect(mock.activateAmendmentWithSchedule).toHaveBeenCalledWith(
      amendment.id, expect.objectContaining({ monthlyRent: 0, monthlyCharges: 0 }),
      expect.any(Array), expect.any(Array), expect.any(Array), expect.any(Array),
      expect.any(Array), "portfolio-1", lease.updatedAt,
    );
  });

  it("persists cleared indexation fields when an amendment disables indexation", async () => {
    const lease = {
      ...leaseDraft, id: "lease-1", lifecycleStage: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01",
      indexationEnabled: true, indexationBaseDate: "2026-01-01", indexationBaseIndex: 100,
      indexationCurrentIndex: 110, indexationCapPercent: 5,
    } as Lease;
    const amendment: LeaseAmendment = {
      id: "amendment-1", leaseId: lease.id, amendmentNumber: 1, title: "Indexation change", reason: "Agreed terms",
      notes: "", effectiveDate: "2026-06-01", signedDate: "2026-05-20", status: "draft",
      supersedesAmendmentId: null, createdAt: "2026-05-20", updatedAt: "2026-05-20",
    };
    const changes: LeaseAmendmentChange[] = [{
      id: "change-indexation", amendmentId: amendment.id, fieldName: "indexationSettings", changeType: "set",
      oldValue: { indexationEnabled: true, indexationBaseDate: "2026-01-01", indexationBaseIndex: 100, indexationCurrentIndex: 110, indexationCapPercent: 5 },
      newValue: { indexationEnabled: false, indexationBaseDate: null, indexationBaseIndex: null, indexationCurrentIndex: null, indexationCapPercent: null },
      createdAt: "2026-05-20", updatedAt: "2026-05-20",
    }];
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment], amendments: [amendment], amendmentChanges: changes,
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let activation: { ok: boolean; reason?: string } | undefined;
    await act(async () => { activation = await result.current.activateAmendment(amendment.id); });

    expect(activation).toEqual({ ok: true });
    const cleared = {
      indexationEnabled: false, indexationBaseDate: null, indexationBaseIndex: null,
      indexationCurrentIndex: null, indexationCapPercent: null,
    };
    expect(result.current.leases[0]).toMatchObject(cleared);
    expect(mock.activateAmendmentWithSchedule).toHaveBeenCalledWith(
      amendment.id, expect.objectContaining(cleared),
      expect.any(Array), expect.any(Array), expect.any(Array), expect.any(Array),
      expect.any(Array), "portfolio-1", lease.updatedAt,
    );
  });

  it("keeps monthly billing periods anchored to the lease when only indexation changes", async () => {
    const lease = {
      ...leaseDraft, id: "lease-1", lifecycleStage: "active", dueDayOfMonth: 20,
      indexationEnabled: true, indexationBaseDate: "2025-01-01", indexationBaseIndex: 100,
      indexationCurrentIndex: 110, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as Lease;
    const amendment: LeaseAmendment = {
      id: "amendment-1", leaseId: lease.id, amendmentNumber: 1, title: "Stop indexation", reason: "Agreed terms",
      notes: "", effectiveDate: "2026-10-15", signedDate: "2026-10-14", status: "draft",
      supersedesAmendmentId: null, createdAt: "2026-10-14", updatedAt: "2026-10-14",
    };
    const changes: LeaseAmendmentChange[] = [{
      id: "change-indexation", amendmentId: amendment.id, fieldName: "indexationSettings", changeType: "set",
      oldValue: { indexationEnabled: true, indexationBaseDate: "2025-01-01", indexationBaseIndex: 100, indexationCurrentIndex: 110 },
      newValue: { indexationEnabled: false, indexationBaseDate: null, indexationBaseIndex: null, indexationCurrentIndex: null },
      createdAt: "2026-10-14", updatedAt: "2026-10-14",
    }];
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], leaseUnitAssignments: [savedAssignment], amendments: [amendment], amendmentChanges: changes,
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let activation: { ok: boolean; reason?: string } | undefined;
    await act(async () => { activation = await result.current.activateAmendment(amendment.id); });

    expect(activation).toEqual({ ok: true });
    const futureRent = result.current.receivableItems
      .filter(item => item.itemType === "rent" && item.dueDate >= amendment.effectiveDate);
    expect(futureRent).toEqual(expect.arrayContaining([
      expect.objectContaining({ dueDate: "2026-10-20", cycleEndDate: "2026-10-31", expectedAmount: 1200 }),
    ]));
    expect(futureRent.every(item => item.dueDate.endsWith("-20"))).toBe(true);
    expect(futureRent.some(item => item.dueDate === amendment.effectiveDate)).toBe(false);
  });

  it("keeps a scheduled amendment scheduled when reverting to draft is rejected", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const amendment = {
      id: "amendment-1", leaseId: "lease-1", amendmentNumber: 1, title: "Renewal", reason: "Updated terms",
      notes: "", effectiveDate: "2027-06-01", signedDate: null, status: "scheduled",
      supersedesAmendmentId: null, createdAt: "2026-05-20", updatedAt: "2026-05-20",
    };
    mock.loadPortfolio.mockImplementation(async () => ({ ...snapshot(), leases: [lease], amendments: [amendment] }));
    mock.changeAmendmentStatus.mockRejectedValue(new Error("Amendment status rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.revertAmendmentToDraft("amendment-1"))
        .rejects.toThrow("Amendment status rejected");
    });

    expect(result.current.amendments[0].status).toBe("scheduled");
  });

  it("keeps the database version after scheduling an amendment", async () => {
    const amendment = {
      id: "amendment-1", leaseId: "lease-1", amendmentNumber: 1, title: "Renewal", reason: "Updated terms",
      notes: "", effectiveDate: "2099-06-01", signedDate: null, status: "draft",
      supersedesAmendmentId: null, createdAt: "2026-05-20T10:00:00Z", updatedAt: "2026-05-20T10:00:00Z",
    } as LeaseAmendment;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      leases: [{ ...leaseDraft, id: "lease-1", createdAt: "2026-05-20T10:00:00Z", updatedAt: "2026-05-20T10:00:00Z" }],
      amendments: [amendment],
    }));
    mock.changeAmendmentStatus.mockResolvedValue({ ...amendment, status: "scheduled", updatedAt: "2026-10-17T10:00:00Z" });
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.amendments).toHaveLength(1));

    await act(async () => {
      expect(await result.current.scheduleAmendment(amendment.id)).toEqual({ ok: true });
    });

    expect(mock.changeAmendmentStatus).toHaveBeenCalledWith(amendment, "portfolio-1", "scheduled");
    expect(result.current.amendments[0].updatedAt).toBe("2026-10-17T10:00:00Z");
  });

  it("keeps reconciliation and receivables unchanged when the atomic save fails", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease],
      receivableItems: [{ ...receivable("charges-1", "EUR", "2026-01-01"), leaseId: "lease-1", itemType: "charges", allocatedAmount: 100, outstandingAmount: 0, status: "paid" }],
    }));
    mock.createChargesReconciliation.mockRejectedValueOnce(new Error("Reconciliation rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.applyChargesReconciliation({
        leaseId: "lease-1", window: { start: "2026-01-01", end: "2026-01-31" }, resolution: "refund",
      })).rejects.toMatchObject({ message: "Reconciliation rejected" });
    });

    expect(mock.createChargesReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: "refund" }),
      expect.objectContaining({ itemType: "charges-adjustment", expectedAmount: -100 }),
      "portfolio-1",
    );
    expect(mock.insertAsync).not.toHaveBeenCalled();
    expect(result.current.chargesReconciliations).toHaveLength(0);
    expect(result.current.receivableItems).toHaveLength(1);
  });

  it("publishes an adjustment only after the atomic reconciliation is saved and removes both together", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease],
      receivableItems: [{ ...receivable("charges-1", "EUR", "2026-01-01"), leaseId: "lease-1", itemType: "charges", allocatedAmount: 100, outstandingAmount: 0, status: "paid" }],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let savedId = "";
    await act(async () => {
      const saved = await result.current.applyChargesReconciliation({
        leaseId: "lease-1", window: { start: "2026-01-01", end: "2026-01-31" }, resolution: "refund",
      });
      savedId = saved?.id ?? "";
    });
    expect(result.current.chargesReconciliations).toHaveLength(1);
    expect(result.current.receivableItems).toHaveLength(2);
    expect(result.current.receivableItems[1].expectedAmount).toBe(-100);
    await act(async () => result.current.deleteChargesReconciliation(savedId));
    expect(mock.deleteChargesReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({ id: savedId }), "portfolio-1",
    );
    expect(result.current.chargesReconciliations).toHaveLength(0);
    expect(result.current.receivableItems).toHaveLength(1);
  });

  it("blocks deletion of a reconciled receivable that has been paid", async () => {
    const lease = { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease;
    const reconciliation = {
      id: "rec-1", leaseId: "lease-1", periodStart: "2026-01-01", periodEnd: "2026-01-31",
      provisionsCollected: 100, actualRecoverable: 0, delta: 100, resolution: "refund",
      receivableItemId: "adjustment-1", notes: "", createdAt: "2026-01-31", updatedAt: "2026-01-31",
    };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [lease], chargesReconciliations: [reconciliation],
      receivableItems: [{ ...receivable("adjustment-1", "EUR", "2026-01-31"), allocatedAmount: 10, status: "partially-paid" }],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.deleteChargesReconciliation("rec-1"))
        .rejects.toThrow("reconciliation.deleteAllocated");
    });

    expect(mock.deleteChargesReconciliation).not.toHaveBeenCalled();
    expect(result.current.chargesReconciliations).toHaveLength(1);
  });

  it("leaves cost and allocations unchanged when the atomic write fails", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), costEntries: [savedCost], allocationRules: [savedRule],
      costAllocationResults: [savedCostAllocation],
    }));
    mock.saveCostEntryWithAllocations.mockRejectedValueOnce(new Error("New allocation rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateCostEntry({ ...savedCost, amount: 200 }))
        .rejects.toThrow("New allocation rejected");
    });

    expect(mock.saveCostEntryWithAllocations).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cost-1", amount: 200 }),
      expect.arrayContaining([expect.objectContaining({ unitId: "unit-1" })]),
      "portfolio-1", savedCost.updatedAt,
    );
    expect(mock.removeWhereAsync).not.toHaveBeenCalled();
    expect(mock.upsertManyAsync).not.toHaveBeenCalled();
    expect(result.current.costEntries[0].amount).toBe(100);
    expect(result.current.costAllocationResults).toEqual([savedCostAllocation]);
  });

  it("rejects a unit-specific cost with a property allocation rule before saving", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), costEntries: [savedCost], allocationRules: [savedRule],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = savedCost;

    await act(async () => {
      await expect(result.current.addCostEntryPersisted({ ...draft, unitId: "unit-1" }))
        .rejects.toThrow("A unit-specific cost cannot also use a property allocation rule.");
      await expect(result.current.updateCostEntry({ ...savedCost, unitId: "unit-1" }))
        .rejects.toThrow("A unit-specific cost cannot also use a property allocation rule.");
    });
    expect(mock.saveCostEntryWithAllocations).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", []],
    ["from another property", [{ ...savedRule, propertyId: "property-2" }]],
  ])("does not save a cost with an allocation rule %s", async (_reason, rules) => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), costEntries: [savedCost], allocationRules: rules,
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = savedCost;

    await act(async () => {
      await expect(result.current.addCostEntryPersisted(draft))
        .rejects.toThrow("costs.validation.allocationRuleInvalid");
      await expect(result.current.updateCostEntry(savedCost))
        .rejects.toThrow("costs.validation.allocationRuleInvalid");
    });

    expect(mock.saveCostEntryWithAllocations).not.toHaveBeenCalled();
    expect(result.current.costEntries).toEqual([savedCost]);
  });

  it("does not allocate a cost without the property's ownership settings", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), properties: [], costEntries: [savedCost], allocationRules: [savedRule],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = savedCost;

    await act(async () => {
      await expect(result.current.addCostEntryPersisted(draft))
        .rejects.toThrow("costs.validation.propertyMissing");
      await expect(result.current.updateCostEntry(savedCost))
        .rejects.toThrow("costs.validation.propertyMissing");
    });

    expect(mock.saveCostEntryWithAllocations).not.toHaveBeenCalled();
  });

  it("does not show a newly created cost until the atomic write succeeds", async () => {
    mock.saveCostEntryWithAllocations.mockRejectedValueOnce(new Error("Atomic migration is missing"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = savedCost;

    await act(async () => {
      await expect(result.current.addCostEntryPersisted({ ...draft, allocationRuleId: null }))
        .rejects.toThrow("Atomic migration is missing");
    });
    expect(result.current.costEntries).toEqual([]);
    expect(result.current.costAllocationResults).toEqual([]);

    await act(async () => {
      await result.current.addCostEntryPersisted({ ...draft, allocationRuleId: null });
    });
    expect(result.current.costEntries).toHaveLength(1);
    expect(mock.insertAsync).not.toHaveBeenCalledWith("cost_entries", expect.anything(), expect.anything());
  });

  it("keeps the previous cost when a concurrent edit makes its version stale", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), costEntries: [savedCost], allocationRules: [savedRule],
      costAllocationResults: [savedCostAllocation],
    }));
    mock.saveCostEntryWithAllocations.mockRejectedValueOnce(new Error("Cost entry changed since it was opened"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateCostEntry({ ...savedCost, amount: 200 }))
        .rejects.toThrow("changed since it was opened");
    });

    expect(mock.insertManyAsync).not.toHaveBeenCalled();
    expect(mock.upsertManyAsync).not.toHaveBeenCalled();
    expect(result.current.costEntries[0].amount).toBe(100);
    expect(result.current.costAllocationResults).toEqual([savedCostAllocation]);
  });

  it("requires an explicit partial recovery share and recalculates saved allocations", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), costEntries: [savedCost], allocationRules: [savedRule],
      costAllocationResults: [savedCostAllocation],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateCostEntry({
        ...savedCost, recoveryType: "partially-recoverable", recoverablePercentage: null,
      })).rejects.toThrow("requires a tenant-recoverable percentage");
    });
    expect(mock.saveCostEntryWithAllocations).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.updateCostEntry({
        ...savedCost, recoveryType: "partially-recoverable", recoverablePercentage: 30,
      });
    });
    expect(result.current.costEntries[0].recoverablePercentage).toBe(30);
    expect(result.current.costAllocationResults).toEqual([
      expect.objectContaining({ unitId: "unit-1", allocatedAmount: 50, recoverableAmount: 15, ownerBurdenAmount: 35 }),
      expect.objectContaining({ unitId: "unit-2", allocatedAmount: 50, recoverableAmount: 15, ownerBurdenAmount: 35 }),
    ]);
  });

  it("keeps manual allocation shares unchanged when atomic replacement fails", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), allocationRules: [{ ...savedRule, method: "manual-percentage" }], allocationRuleUnitShares: [savedShare],
    }));
    mock.saveAllocationRuleWithShares.mockRejectedValue(new Error("New shares rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.setAllocationRuleUnitShares("rule-1", [{
        allocationRuleId: "rule-1", unitId: "unit-2", percentageShare: 100,
        fixedAmountShare: null, coefficient: null,
      }])).rejects.toThrow("New shares rejected");
    });

    expect(mock.saveAllocationRuleWithShares).toHaveBeenCalledOnce();
    expect(mock.removeWhereAsync).not.toHaveBeenCalledWith("allocation_rule_unit_shares", expect.anything(), expect.anything(), expect.anything());
    expect(result.current.allocationRuleUnitShares).toEqual([savedShare]);
  });

  it("saves a new manual rule and its shares together", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveAllocationRuleWithSharesPersisted({
        propertyId: "property-1", name: "Manual", method: "manual-percentage",
        applyOnlyToOccupiedUnits: false, includeUnavailableUnits: false, notes: "",
      }, [{
        allocationRuleId: "", unitId: "unit-1", percentageShare: 100,
        fixedAmountShare: null, coefficient: null,
      }]);
    });

    expect(mock.saveAllocationRuleWithShares).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Manual", method: "manual-percentage" }),
      [expect.objectContaining({ unitId: "unit-1", allocationRuleId: expect.stringMatching(/^id-/) })],
      "portfolio-1", undefined,
    );
    expect(result.current.allocationRules).toHaveLength(1);
    expect(result.current.allocationRuleUnitShares).toHaveLength(1);
    expect(mock.insertAsync).not.toHaveBeenCalledWith("allocation_rules", expect.anything(), expect.anything());
  });

  it("keeps a failed manual rule creation out of local state", async () => {
    mock.saveAllocationRuleWithShares.mockRejectedValue(new Error("Share rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.saveAllocationRuleWithSharesPersisted({
        propertyId: "property-1", name: "Manual", method: "manual-percentage",
        applyOnlyToOccupiedUnits: false, includeUnavailableUnits: false, notes: "",
      }, [{
        allocationRuleId: "", unitId: "unit-1", percentageShare: 100,
        fixedAmountShare: null, coefficient: null,
      }])).rejects.toThrow("Share rejected");
    });

    expect(result.current.allocationRules).toHaveLength(0);
    expect(result.current.allocationRuleUnitShares).toHaveLength(0);
  });

  it("clears manual shares when the rule changes to equal allocation", async () => {
    const manualRule = { ...savedRule, method: "manual-percentage" as const };
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), allocationRules: [manualRule], allocationRuleUnitShares: [savedShare],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveAllocationRuleWithSharesPersisted({ ...manualRule, method: "equal" }, []);
    });

    expect(mock.saveAllocationRuleWithShares).toHaveBeenCalledWith(
      expect.objectContaining({ method: "equal" }), [], "portfolio-1", manualRule.updatedAt,
    );
    expect(result.current.allocationRules[0].method).toBe("equal");
    expect(result.current.allocationRuleUnitShares).toHaveLength(0);
  });

  it("does not publish a lease if its generated receivables fail in the transaction", async () => {
    mock.createLeaseWithSchedule.mockRejectedValue(new Error("Receivables rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.addLease({ ...leaseDraft, lifecycleStage: "signed", signedDate: "2025-12-01" },
        { receivableAssignments: assignmentDrafts }))
        .rejects.toThrow("Receivables rejected");
    });

    expect(mock.createLeaseWithSchedule.mock.calls[0][2].length).toBeGreaterThan(0);
    expect(mock.removeWhereAsync).not.toHaveBeenCalledWith("receivable_items", "lease_id", expect.anything());
    expect(mock.removeAsync).not.toHaveBeenCalledWith("leases", expect.anything());
    expect(result.current.leases).toHaveLength(0);
    expect(result.current.receivableItems).toHaveLength(0);
  });

  it("does not allocate a EUR receipt to an older GBP receivable", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      receivableItems: [receivable("gbp", "GBP", "2026-01-01"), receivable("eur", "EUR", "2026-01-02")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createCashReceiptPersisted(receiptDraft, true);
    });

    expect(result.current.receivableItems.find(item => item.id === "gbp")?.outstandingAmount).toBe(100);
    expect(result.current.receivableItems.find(item => item.id === "eur")?.outstandingAmount).toBe(0);
  });

  it("does not allocate cancelled, disputed, or written-off receivables", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      receivableItems: [
        { ...receivable("cancelled", "EUR", "2026-01-01"), status: "cancelled" },
        { ...receivable("disputed", "EUR", "2026-01-02"), status: "disputed" },
        { ...receivable("written-off", "EUR", "2026-01-03"), status: "written-off" },
        receivable("open", "EUR", "2026-01-04"),
      ],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createCashReceiptPersisted(receiptDraft, true);
    });
    expect(result.current.receivableItems.filter(item => item.outstandingAmount === 0).map(item => item.id)).toEqual(["open"]);
    expect(result.current.allocations).toHaveLength(1);
    await act(async () => {
      await expect(result.current.quickPayReceivable({
        receivableItemId: "cancelled", amountReceived: 100, paymentDate: "2026-01-15", sourceType: "manual",
      })).rejects.toThrow("no longer open for payment");
    });
  });

  it("does not auto-allocate a lease receipt to another tenant in the same property", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      leases: [
        { ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease,
        { ...leaseDraft, id: "lease-other", primaryTenantId: "tenant-other", tenantIds: ["tenant-other"], billingTenantId: "tenant-other", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease,
      ],
      tenants: [
        ...snapshot().tenants,
        { id: "tenant-other", portfolioId: "portfolio-1", firstName: "Other", lastName: "Tenant", status: "active" },
      ],
      receivableItems: [
        { ...receivable("other", "EUR", "2026-01-01"), leaseId: "lease-other", tenantId: "tenant-other" },
        { ...receivable("own", "EUR", "2026-01-02"), leaseId: "lease-1" },
      ],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createCashReceiptPersisted({ ...receiptDraft, leaseId: "lease-1" }, true);
    });

    expect(result.current.receivableItems.find(item => item.id === "other")?.outstandingAmount).toBe(100);
    expect(result.current.receivableItems.find(item => item.id === "own")?.outstandingAmount).toBe(0);
  });

  it("rejects a receipt linked to a lease belonging to another tenant", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      leases: [{ ...leaseDraft, id: "lease-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as Lease],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.createCashReceiptPersisted({ ...receiptDraft, tenantId: "tenant-other", leaseId: "lease-1" }, true))
        .rejects.toThrow("tenant does not belong");
    });
    expect(mock.saveReceiptAllocations).not.toHaveBeenCalled();
  });

  it("records an unlinked GBP receipt without forcing EUR", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createCashReceiptPersisted({ ...receiptDraft, tenantId: null, propertyId: null, currencyCode: "GBP" });
    });
    expect(mock.saveReceiptAllocations.mock.calls[0][0].currencyCode).toBe("GBP");
  });

  it("keeps receipt and balances unchanged when atomic auto-allocation fails", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    mock.saveReceiptAllocations.mockRejectedValue(new Error("Receivable update rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.createCashReceiptPersisted(receiptDraft, true))
        .rejects.toMatchObject({ message: "Receivable update rejected" });
    });

    expect(mock.saveReceiptAllocations).toHaveBeenCalledOnce();
    expect(mock.insertAsync).not.toHaveBeenCalledWith("cash_receipts", expect.any(Object), "portfolio-1");
    expect(result.current.cashReceipts).toHaveLength(0);
    expect(result.current.receivableItems[0].outstandingAmount).toBe(100);
  });

  it("saves an unmatched receipt through the atomic payment RPC", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved: CashReceipt | undefined;
    await act(async () => {
      saved = await result.current.createCashReceiptPersisted(receiptDraft);
    });

    expect(saved?.unmatchedAmount).toBe(100);
    expect(result.current.cashReceipts).toHaveLength(1);
    expect(mock.saveReceiptAllocations).toHaveBeenCalledWith(
      expect.objectContaining({ amountReceived: 100 }), [], [], "portfolio-1",
    );
    expect(mock.insertReturningAsync).not.toHaveBeenCalledWith("cash_receipts", expect.anything(), "portfolio-1");
  });

  it("does not show an unmatched receipt when the payment RPC rejects it", async () => {
    mock.saveReceiptAllocations.mockRejectedValue(new Error("Receipt rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.createCashReceiptPersisted(receiptDraft)).rejects.toThrow("Receipt rejected");
    });

    expect(result.current.cashReceipts).toHaveLength(0);
    expect(mock.insertReturningAsync).not.toHaveBeenCalledWith("cash_receipts", expect.anything(), "portfolio-1");
  });

  it("does not mutate local receivables when the atomic allocation fails", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    mock.saveReceiptAllocations.mockRejectedValue(new Error("Allocation insert rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.createCashReceiptPersisted(receiptDraft, true))
        .rejects.toMatchObject({ message: "Allocation insert rejected" });
    });

    expect(mock.saveReceiptAllocations).toHaveBeenCalledOnce();
    expect(mock.updateAsync).not.toHaveBeenCalledWith("receivable_items", expect.anything(), expect.anything());
    expect(result.current.cashReceipts).toHaveLength(0);
    expect(result.current.receivableItems[0].outstandingAmount).toBe(100);
  });

  it("does not create schedule rows during an editor visit; the server job owns due cycles", async () => {
    const activeLease = {
      ...leaseDraft, id: "lease-1", lifecycleStage: "active", signedDate: "2026-09-15",
      startDate: "2026-10-01", endDate: "2026-12-31", createdAt: "2026-09-15", updatedAt: "2026-09-15",
    } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), leases: [activeLease],
      leaseUnitAssignments: [{ ...savedAssignment, startDate: activeLease.startDate, endDate: activeLease.endDate }],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.receivableItems).toHaveLength(0);
    expect(mock.insertManyAsync.mock.calls.filter(([table]) => table === "receivable_items")).toHaveLength(0);
  });

  it("does not generate receivables during a viewer visit", async () => {
    mock.role = "viewer";
    const activeLease = {
      ...leaseDraft, id: "lease-1", lifecycleStage: "active", signedDate: "2026-09-15",
      startDate: "2026-10-01", endDate: "2026-12-31", createdAt: "2026-09-15", updatedAt: "2026-09-15",
    } as Lease;
    mock.loadPortfolio.mockImplementation(async () => ({ ...snapshot(), leases: [activeLease] }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mock.insertManyAsync.mock.calls.filter(([table]) => table === "receivable_items")).toHaveLength(0);
  });

  it("rejects manual cross-currency allocation", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      cashReceipts: [{ ...receiptDraft, id: "receipt-1", createdAt: "2026-01-15", updatedAt: "2026-01-15" }],
      receivableItems: [receivable("gbp", "GBP", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.allocateCashReceipt("receipt-1", [{ receivableItemId: "gbp", amount: 100 }]))
        .rejects.toThrow("no longer eligible");
    });

    expect(result.current.receivableItems[0].outstandingAmount).toBe(100);
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(100);
    expect(result.current.allocations).toHaveLength(0);
  });

  it("rejects an entire manual allocation when a later line is stale or ineligible", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      cashReceipts: [{ ...receiptDraft, id: "receipt-1", createdAt: "2026-01-15", updatedAt: "2026-01-15" }],
      receivableItems: [receivable("eur", "EUR", "2026-01-01"), receivable("gbp", "GBP", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.allocateCashReceipt("receipt-1", [
        { receivableItemId: "eur", amount: 50 },
        { receivableItemId: "gbp", amount: 50 },
      ])).rejects.toThrow("no longer eligible");
      await expect(result.current.allocateCashReceipt("receipt-1", [
        { receivableItemId: "eur", amount: 50 },
        { receivableItemId: "deleted", amount: 50 },
      ])).rejects.toThrow("no longer eligible");
    });
    expect(mock.saveReceiptAllocations).not.toHaveBeenCalled();
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(100);
    expect(result.current.receivableItems.find(item => item.id === "eur")?.outstandingAmount).toBe(100);
  });

  it("rejects manual allocation overflow, duplicate rows and sub-cent amounts instead of silently reducing them", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      cashReceipts: [{ ...receiptDraft, id: "receipt-1", createdAt: "2026-01-15", updatedAt: "2026-01-15" }],
      receivableItems: [receivable("eur", "EUR", "2026-01-01"), receivable("eur-2", "EUR", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.allocateCashReceipt("receipt-1", [
        { receivableItemId: "eur", amount: 60 },
        { receivableItemId: "eur-2", amount: 50 },
      ])).rejects.toThrow("exceeds the available receipt");
      await expect(result.current.allocateCashReceipt("receipt-1", [
        { receivableItemId: "eur", amount: 60 },
        { receivableItemId: "eur", amount: 40 },
      ])).rejects.toThrow("only once");
      await expect(result.current.allocateCashReceipt("receipt-1", [
        { receivableItemId: "eur", amount: 0.001 },
      ])).rejects.toThrow("at most two decimal places");
    });
    expect(mock.saveReceiptAllocations).not.toHaveBeenCalled();
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(100);
    expect(result.current.allocations).toHaveLength(0);
  });

  it("rejects terminal receipts before manual or automatic allocation", async () => {
    const receipts = (["exception", "reversed", "refunded"] as const).map(status => ({
      ...receiptDraft, id: status, status, createdAt: "2026-01-15", updatedAt: "2026-01-15",
    }));
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), cashReceipts: receipts,
      receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      for (const receipt of receipts) {
        await expect(result.current.allocateCashReceipt(receipt.id, [{ receivableItemId: "eur", amount: 50 }]))
          .rejects.toThrow("not available for allocation");
        await expect(result.current.autoAllocateCashReceipt(receipt.id))
          .rejects.toThrow("not available for allocation");
      }
    });
    expect(result.current.getTenantUnappliedCredit("tenant-1", "EUR")).toBe(0);
    expect(mock.saveReceiptAllocations).not.toHaveBeenCalled();
  });

  it("keeps a tenant's unapplied credit separate by currency", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), cashReceipts: [
        { ...receiptDraft, id: "eur", unmatchedAmount: 50, status: "partially-matched", createdAt: "2026-01-15", updatedAt: "2026-01-15" },
        { ...receiptDraft, id: "gbp", currencyCode: "GBP", createdAt: "2026-01-15", updatedAt: "2026-01-15" },
        { ...receiptDraft, id: "other-lease", leaseId: "lease-2", amountReceived: 30, unmatchedAmount: 30, createdAt: "2026-01-15", updatedAt: "2026-01-15" },
        { ...receiptDraft, id: "lease-only", tenantId: null, leaseId: "lease-1", amountReceived: 20, unmatchedAmount: 20, createdAt: "2026-01-15", updatedAt: "2026-01-15" },
      ],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getTenantUnappliedCredit("tenant-1", "EUR")).toBe(80);
    expect(result.current.getTenantUnappliedCredit("tenant-1", "EUR", "lease-1")).toBe(70);
    expect(result.current.getTenantUnappliedCredit("tenant-1", "GBP")).toBe(100);
  });

  it("rejects non-finite receipt amounts before any write", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.createCashReceiptPersisted({ ...receiptDraft, amountReceived: Number.NaN }))
        .rejects.toThrow("positive amount");
      await expect(result.current.createCashReceiptPersisted({ ...receiptDraft, amountReceived: -1 }))
        .rejects.toThrow("positive amount");
    });
    expect(mock.insertAsync).not.toHaveBeenCalledWith("cash_receipts", expect.anything(), expect.anything());
  });

  it("reports stale payment targets instead of claiming quick-pay or allocation succeeded", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.quickPayReceivable({
        receivableItemId: "missing", amountReceived: 100, paymentDate: "2026-01-15", sourceType: "manual",
      })).rejects.toThrow("Receivable no longer exists");
      await expect(result.current.allocateCashReceipt("missing", [{ receivableItemId: "missing", amount: 100 }]))
        .rejects.toThrow("Receipt no longer exists");
    });
    expect(mock.insertAsync).not.toHaveBeenCalledWith("cash_receipts", expect.anything(), expect.anything());
  });

  it("rejects non-finite manual allocation amounts without changing balances", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      cashReceipts: [{ ...receiptDraft, id: "receipt-1", createdAt: "2026-01-15", updatedAt: "2026-01-15" }],
      receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.allocateCashReceipt("receipt-1", [{ receivableItemId: "eur", amount: Number.NaN }]))
        .rejects.toThrow("positive, finite amount");
    });
    expect(result.current.receivableItems[0].outstandingAmount).toBe(100);
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(100);
    expect(result.current.allocations).toHaveLength(0);
  });

  it("rejects repeated manual receivable rows without changing balances", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      cashReceipts: [{ ...receiptDraft, id: "receipt-1", createdAt: "2026-01-15", updatedAt: "2026-01-15" }],
      receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.allocateCashReceipt("receipt-1", [
        { receivableItemId: "eur", amount: 75 },
        { receivableItemId: "eur", amount: 75 },
      ])).rejects.toThrow("only once");
    });

    expect(result.current.receivableItems[0].outstandingAmount).toBe(100);
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(100);
    expect(result.current.allocations).toHaveLength(0);
    expect(mock.saveReceiptAllocations).not.toHaveBeenCalled();
  });

  it("keeps the remaining balance open after a partial payment", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      cashReceipts: [{ ...receiptDraft, id: "receipt-1", createdAt: "2026-01-15", updatedAt: "2026-01-15" }],
      receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.allocateCashReceipt("receipt-1", [{ receivableItemId: "eur", amount: 40 }]);
    });

    expect(result.current.receivableItems[0]).toMatchObject({ allocatedAmount: 40, outstandingAmount: 60, status: "overdue" });
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(60);
    expect(result.current.allocations[0].allocatedAmount).toBe(40);
  });

  it("leaves cross-currency receivables untouched by quick-pay surplus", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      receivableItems: [receivable("eur", "EUR", "2026-01-02"), receivable("gbp", "GBP", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.quickPayReceivable({
        receivableItemId: "eur", amountReceived: 150, paymentDate: "2026-01-15", sourceType: "manual",
      });
    });

    expect(result.current.receivableItems.find(item => item.id === "eur")?.outstandingAmount).toBe(0);
    expect(result.current.receivableItems.find(item => item.id === "gbp")?.outstandingAmount).toBe(100);
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(50);
  });

  it("rejects sub-cent receipts and quick-pay amounts before persistence", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.createCashReceiptPersisted({ ...receiptDraft, amountReceived: 1.001, unmatchedAmount: 1.001 }))
        .rejects.toThrow("at most two decimal places");
      await expect(result.current.quickPayReceivable({
        receivableItemId: "eur", amountReceived: 1.001, paymentDate: "2026-01-15", sourceType: "manual",
      })).rejects.toThrow("at most two decimal places");
    });
    expect(mock.saveReceiptAllocations).not.toHaveBeenCalled();
    expect(result.current.cashReceipts).toHaveLength(0);
  });

  it("allocates a small quick-pay amount exactly in cents", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      receivableItems: [
        { ...receivable("first", "EUR", "2026-01-01"), expectedAmount: 0.1, outstandingAmount: 0.1 },
        { ...receivable("second", "EUR", "2026-01-02"), expectedAmount: 0.2, outstandingAmount: 0.2 },
      ],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.quickPayReceivable({
        receivableItemId: "first", amountReceived: 0.3, paymentDate: "2026-01-15", sourceType: "manual",
      });
    });
    expect(result.current.allocations.map(row => row.allocatedAmount)).toEqual([0.1, 0.2]);
    expect(result.current.cashReceipts[0]).toMatchObject({ amountReceived: 0.3, unmatchedAmount: 0, status: "matched" });
    expect(result.current.receivableItems.map(item => item.outstandingAmount)).toEqual([0, 0]);
  });

  it("does not spread quick-pay surplus to another property of the same tenant", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      properties: [
        { id: "property-1", portfolioId: "portfolio-1", currencyCode: "EUR" },
        { id: "property-2", portfolioId: "portfolio-1", currencyCode: "EUR" },
      ],
      units: [
        { id: "unit-1", propertyId: "property-1", unitType: "apartment" },
        { id: "unit-3", propertyId: "property-2", unitType: "apartment" },
      ],
      receivableItems: [
        receivable("first", "EUR", "2026-01-01"),
        { ...receivable("second", "EUR", "2026-01-02"), propertyId: "property-2", unitId: "unit-3" },
      ],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.quickPayReceivable({
        receivableItemId: "first", amountReceived: 150,
        paymentDate: "2026-01-15", sourceType: "manual",
      });
    });

    expect(result.current.receivableItems.find(item => item.id === "first")?.outstandingAmount).toBe(0);
    expect(result.current.receivableItems.find(item => item.id === "second")?.outstandingAmount).toBe(100);
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(50);
    expect(result.current.allocations).toHaveLength(1);
  });

  it("keeps balances unchanged if a manual allocation fails to persist", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      cashReceipts: [{ ...receiptDraft, id: "receipt-1", createdAt: "2026-01-15", updatedAt: "2026-01-15" }],
      receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    mock.saveReceiptAllocations.mockRejectedValue(new Error("Allocation rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.allocateCashReceipt("receipt-1", [
        { receivableItemId: "eur", amount: 50 },
      ])).rejects.toThrow("Allocation rejected");
    });

    expect(result.current.receivableItems[0].outstandingAmount).toBe(100);
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(100);
    expect(result.current.allocations).toHaveLength(0);
    expect(mock.saveReceiptAllocations).toHaveBeenCalledOnce();
    expect(mock.removeManyAsync).not.toHaveBeenCalledWith("receipt_allocations", expect.anything());
  });

  it("keeps quick-pay closed to success if receipt insertion fails", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(), receivableItems: [receivable("eur", "EUR", "2026-01-01")],
    }));
    mock.saveReceiptAllocations.mockRejectedValue(new Error("Receipt rejected"));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.quickPayReceivable({
        receivableItemId: "eur", amountReceived: 100, paymentDate: "2026-01-15", sourceType: "manual",
      })).rejects.toThrow("Receipt rejected");
    });

    expect(result.current.receivableItems[0].outstandingAmount).toBe(100);
    expect(result.current.cashReceipts).toHaveLength(0);
    expect(result.current.allocations).toHaveLength(0);
  });

  it("auto-allocates only matching-currency receivables after persistence succeeds", async () => {
    mock.loadPortfolio.mockImplementation(async () => ({
      ...snapshot(),
      cashReceipts: [{ ...receiptDraft, id: "receipt-1", createdAt: "2026-01-15", updatedAt: "2026-01-15" }],
      receivableItems: [receivable("eur", "EUR", "2026-01-01"), receivable("gbp", "GBP", "2026-01-01")],
    }));
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.autoAllocateCashReceipt("receipt-1");
    });

    expect(result.current.receivableItems.find(item => item.id === "eur")?.outstandingAmount).toBe(0);
    expect(result.current.receivableItems.find(item => item.id === "gbp")?.outstandingAmount).toBe(100);
    expect(result.current.cashReceipts[0].unmatchedAmount).toBe(0);
    expect(result.current.allocations).toHaveLength(1);
    expect(mock.saveReceiptAllocations).toHaveBeenCalledOnce();
    expect(mock.updateAsync.mock.calls.filter(([table]) => table === "receivable_items")).toHaveLength(0);
  });
});
