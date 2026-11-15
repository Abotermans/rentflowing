import { describe, expect, it, vi } from "vitest";
import { collectRowsById, isValidBusinessDate, runDueReceivableJob, type DueReceivableStore } from "@/lib/serverReceivableJob";

function store(): DueReceivableStore {
  return {
    listPortfolios: vi.fn(async () => [{ id: "portfolio-1", receivable_lead_days: 10 }]),
    listLeases: vi.fn(async () => [{
      id: "lease-1", property_id: "property-1", tenant_ids: ["tenant-1"],
      billing_tenant_id: "tenant-1", lifecycle_stage: "active",
      start_date: "2026-01-01", end_date: "2026-01-31",
      monthly_rent: 1000, monthly_charges: 100, rent_formula: 1,
      due_day_of_month: 5, pricing_mode: "separated",
    }]),
    listProperties: vi.fn(async () => [{ id: "property-1", portfolio_id: "portfolio-1", currency_code: "EUR" }]),
    listAssignments: vi.fn(async () => [{ lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01", end_date: null }]),
    listUnits: vi.fn(async () => [{ id: "unit-1", property_id: "property-1", portfolio_id: "portfolio-1", unit_type: "apartment" }]),
    listAmendments: vi.fn(async () => []),
    listChanges: vi.fn(async () => []),
    insert: vi.fn(async (_portfolioId, rows) => rows.length),
  };
}

describe("scheduled job row pagination", () => {
  it("does not skip the final row when an earlier row disappears between pages", async () => {
    let rows = Array.from({ length: 501 }, (_, index) => ({ id: `row-${String(index + 1).padStart(3, "0")}` }));
    const listPage = vi.fn(async (afterId: string | null, limit: number) => {
      if (afterId && rows.length === 501) rows = rows.slice(1);
      return rows.filter(row => !afterId || row.id > afterId).slice(0, limit);
    });

    const result = await collectRowsById(listPage);
    expect(result).toHaveLength(501);
    expect(result.at(-1)?.id).toBe("row-501");
    expect(listPage).toHaveBeenNthCalledWith(2, "row-500", 500);
  });

  it("fails closed on a repeated or oversized page", async () => {
    await expect(collectRowsById(async () => [{ id: "row-1" }, { id: "row-1" }], 2))
      .rejects.toThrow("out-of-order IDs");
    await expect(collectRowsById(async () => [{ id: "row-1" }, { id: "row-2" }], 1))
      .rejects.toThrow("exceeded its limit");
  });
});

describe("due receivable server job", () => {
  it("validates exact calendar dates", () => {
    expect(isValidBusinessDate("2026-02-28")).toBe(true);
    expect(isValidBusinessDate("2026-02-30")).toBe(false);
    expect(isValidBusinessDate("2026-2-8")).toBe(false);
  });

  it("uses portfolio lead time and inserts the calculated schedule", async () => {
    const data = store();
    const result = await runDueReceivableJob(data, "2026-01-01", () => crypto.randomUUID());
    expect(result).toEqual({ leasesExamined: 1, rowsGenerated: 2, rowsInserted: 2, incompleteLeaseIds: [] });
    expect(data.insert).toHaveBeenCalledWith("portfolio-1", expect.arrayContaining([
      expect.objectContaining({ item_type: "rent", expected_amount: 1000, currency_code: "EUR" }),
      expect.objectContaining({ item_type: "charges", expected_amount: 100 }),
    ]));
  });

  it("does not skip the last lease when an earlier processed lease leaves the result set", async () => {
    const data = store();
    const baseLease = (await data.listLeases("portfolio-1", null, 50))[0];
    let leases = Array.from({ length: 51 }, (_, index) => ({
      ...baseLease, id: `lease-${String(index + 1).padStart(3, "0")}`,
    }));
    data.listLeases = vi.fn(async (_portfolioId, afterId, limit) => {
      if (afterId && leases.length === 51) leases = leases.slice(1);
      return leases.filter(lease => !afterId || String(lease.id) > afterId).slice(0, limit);
    });
    data.listAssignments = vi.fn(async leaseIds => leaseIds.map(leaseId => ({
      lease_id: leaseId, unit_id: "unit-1", start_date: "2026-01-01", end_date: null,
    })));

    const result = await runDueReceivableJob(data, "2026-01-01");
    expect(result).toEqual({ leasesExamined: 51, rowsGenerated: 102, rowsInserted: 102, incompleteLeaseIds: [] });
    expect(data.listLeases).toHaveBeenNthCalledWith(2, "portfolio-1", "lease-050", 50);
    expect(vi.mocked(data.insert).mock.calls.flatMap(([, batch]) => batch))
      .toEqual(expect.arrayContaining([expect.objectContaining({ lease_id: "lease-051" })]));
  });

  it("does not skip the last portfolio when an earlier portfolio is removed", async () => {
    const data = store();
    let portfolios = Array.from({ length: 51 }, (_, index) => ({
      id: `portfolio-${String(index + 1).padStart(3, "0")}`,
      receivable_lead_days: 10,
    }));
    data.listPortfolios = vi.fn(async (afterId, limit) => {
      if (afterId && portfolios.length === 51) portfolios = portfolios.slice(1);
      return portfolios.filter(portfolio => !afterId || portfolio.id > afterId).slice(0, limit);
    });
    data.listLeases = vi.fn(async () => []);

    const result = await runDueReceivableJob(data, "2026-01-01");
    expect(result.leasesExamined).toBe(0);
    expect(data.listPortfolios).toHaveBeenNthCalledWith(2, "portfolio-050", 50);
    expect(data.listLeases).toHaveBeenCalledWith("portfolio-051", null, 50);
  });

  it("fails instead of reporting success if a page repeats an ID", async () => {
    const data = store();
    const lease = (await data.listLeases("portfolio-1", null, 50))[0];
    data.listLeases = vi.fn(async () => [lease, lease]);
    await expect(runDueReceivableJob(data, "2026-01-01"))
      .rejects.toThrow("out-of-order IDs");
    expect(data.insert).not.toHaveBeenCalled();
  });

  it("inserts historical and current bills with their respective amendment terms", async () => {
    const data = store();
    data.listLeases = vi.fn(async () => [{
      id: "lease-1", property_id: "property-1", tenant_ids: ["tenant-2"],
      billing_tenant_id: "tenant-2", lifecycle_stage: "active",
      start_date: "2026-01-01", end_date: "2026-07-31",
      monthly_rent: 1300, monthly_charges: 150, rent_formula: 1,
      due_day_of_month: 5, pricing_mode: "separated",
    }]);
    data.listAssignments = vi.fn(async () => [
      { lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01",
        end_date: "2026-06-30", rent_share: 1200, charges_share: 100 },
      { lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-07-01",
        end_date: null, rent_share: 1300, charges_share: 150 },
    ]);
    data.listAmendments = vi.fn(async () => [{ id: "amendment-1", lease_id: "lease-1",
      status: "active", amendment_number: 1, effective_date: "2026-07-01" }]);
    data.listChanges = vi.fn(async () => [
      { amendment_id: "amendment-1", field_name: "unitRentShare", old_value: 1200,
        new_value: 1300, metadata: { unitId: "unit-1" } },
      { amendment_id: "amendment-1", field_name: "unitChargesShare", old_value: 100,
        new_value: 150, metadata: { unitId: "unit-1" } },
      { amendment_id: "amendment-1", field_name: "tenantIds", old_value: ["tenant-1"],
        new_value: ["tenant-2"] },
      { amendment_id: "amendment-1", field_name: "billingTenantId", old_value: "tenant-1",
        new_value: "tenant-2" },
    ]);

    const result = await runDueReceivableJob(data, "2026-07-01");
    expect(result.incompleteLeaseIds).toEqual([]);
    const rows = vi.mocked(data.insert).mock.calls.flatMap(([, batch]) => batch);
    expect(rows.find(row => row.period_month === "2026-06" && row.item_type === "rent"))
      .toMatchObject({ expected_amount: 1200, tenant_id: "tenant-1" });
    expect(rows.find(row => row.period_month === "2026-06" && row.item_type === "charges"))
      .toMatchObject({ expected_amount: 100, tenant_id: "tenant-1" });
    expect(rows.find(row => row.period_month === "2026-07" && row.item_type === "rent"))
      .toMatchObject({ expected_amount: 1300, tenant_id: "tenant-2" });
    expect(rows.find(row => row.period_month === "2026-07" && row.item_type === "charges"))
      .toMatchObject({ expected_amount: 150, tenant_id: "tenant-2" });
  });

  it("marks an indexed lease incomplete instead of inserting base-rent bills when indices are missing", async () => {
    const data = store();
    data.listLeases = vi.fn(async () => [{
      id: "lease-1", property_id: "property-1", tenant_ids: ["tenant-1"],
      billing_tenant_id: "tenant-1", lifecycle_stage: "active",
      start_date: "2026-01-01", end_date: "2027-02-28",
      monthly_rent: 1000, monthly_charges: 100, rent_formula: 1,
      due_day_of_month: 5, pricing_mode: "separated",
      indexation_enabled: true, indexation_base_date: "2026-01-01",
      indexation_base_index: null, indexation_current_index: null,
    }]);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runDueReceivableJob(data, "2027-01-01")).toEqual({
        leasesExamined: 1, rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: ["lease-1"],
      });
      expect(data.insert).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining("lease lease-1 failed"),
        expect.objectContaining({ message: expect.stringContaining("Indexation cannot be calculated") }),
      );
    } finally {
      errorLog.mockRestore();
    }
  });

  it("uses the property's date rather than the run's latest calendar date", async () => {
    const data = store();
    await runDueReceivableJob(data, "2026-01-06", undefined, () => "2026-01-05");
    expect(data.insert).toHaveBeenCalledWith("portfolio-1", expect.arrayContaining([
      expect.objectContaining({ due_date: "2026-01-05", status: "open" }),
    ]));
  });

  it("does not advance London's next bill at Brussels midnight", async () => {
    const data = store();
    data.listPortfolios = vi.fn(async () => [{ id: "portfolio-1", receivable_lead_days: 0 }]);
    const baseLease = {
      id: "lease-brussels", property_id: "property-brussels", tenant_ids: ["tenant-1"],
      billing_tenant_id: "tenant-1", lifecycle_stage: "active",
      start_date: "2026-10-01", end_date: "2026-11-30",
      monthly_rent: 1000, monthly_charges: 0, rent_formula: 1,
      due_day_of_month: 1, pricing_mode: "separated",
    };
    data.listLeases = vi.fn(async () => [baseLease, {
      ...baseLease, id: "lease-london", property_id: "property-london",
    }]);
    data.listProperties = vi.fn(async () => [
      { id: "property-brussels", portfolio_id: "portfolio-1", currency_code: "EUR" },
      { id: "property-london", portfolio_id: "portfolio-1", currency_code: "GBP" },
    ]);
    data.listAssignments = vi.fn(async () => [
      { lease_id: "lease-brussels", unit_id: "unit-brussels", start_date: "2026-10-01", end_date: null },
      { lease_id: "lease-london", unit_id: "unit-london", start_date: "2026-10-01", end_date: null },
    ]);
    data.listUnits = vi.fn(async () => [
      { id: "unit-brussels", property_id: "property-brussels", portfolio_id: "portfolio-1", unit_type: "apartment" },
      { id: "unit-london", property_id: "property-london", portfolio_id: "portfolio-1", unit_type: "apartment" },
    ]);

    const result = await runDueReceivableJob(data, "2026-11-01", undefined,
      property => property.id === "property-london" ? "2026-10-31" : "2026-11-01");
    expect(result).toMatchObject({ rowsGenerated: 3, rowsInserted: 3, incompleteLeaseIds: [] });
    const inserted = vi.mocked(data.insert).mock.calls.flatMap(([, rows]) => rows);
    expect(inserted.filter(row => row.lease_id === "lease-brussels").map(row => row.due_date))
      .toEqual(["2026-10-01", "2026-11-01"]);
    expect(inserted.filter(row => row.lease_id === "lease-london").map(row => row.due_date))
      .toEqual(["2026-10-01"]);
  });

  it("reports missing assignments without fabricating unit receivables", async () => {
    const data = store();
    data.listAssignments = vi.fn(async () => []);
    expect(await runDueReceivableJob(data, "2026-01-01")).toEqual({
      leasesExamined: 1, rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: ["lease-1"],
    });
    expect(data.insert).not.toHaveBeenCalled();
  });

  it("does not partially bill a lease whose earlier cycle has no main unit", async () => {
    const data = store();
    data.listLeases = vi.fn(async () => [{
      id: "lease-1", property_id: "property-1", tenant_ids: ["tenant-1"],
      billing_tenant_id: "tenant-1", lifecycle_stage: "active",
      start_date: "2026-01-01", end_date: "2026-03-31",
      monthly_rent: 1000, monthly_charges: 100, rent_formula: 1,
      due_day_of_month: 5, pricing_mode: "separated",
    }]);
    data.listAssignments = vi.fn(async () => [{
      lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-02-01", end_date: null,
    }]);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runDueReceivableJob(data, "2026-02-10")).toEqual({
        leasesExamined: 1, rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: ["lease-1"],
      });
      expect(data.insert).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("2026-01-01"));
    } finally {
      errorLog.mockRestore();
    }
  });

  it("refuses an ancillary-only lease instead of billing all rent to parking", async () => {
    const data = store();
    data.listUnits = vi.fn(async () => [{
      id: "unit-1", property_id: "property-1", portfolio_id: "portfolio-1", unit_type: "parking",
    }]);
    expect(await runDueReceivableJob(data, "2026-01-01")).toMatchObject({
      rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: ["lease-1"],
    });
    expect(data.insert).not.toHaveBeenCalled();
  });

  it("bills the main unit when an ancillary assignment is returned first", async () => {
    const data = store();
    data.listAssignments = vi.fn(async () => [
      { lease_id: "lease-1", unit_id: "parking-1", start_date: "2026-01-01", end_date: null },
      { lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01", end_date: null },
    ]);
    data.listUnits = vi.fn(async () => [
      { id: "parking-1", property_id: "property-1", portfolio_id: "portfolio-1", unit_type: "parking" },
      { id: "unit-1", property_id: "property-1", portfolio_id: "portfolio-1", unit_type: "apartment" },
    ]);

    const result = await runDueReceivableJob(data, "2026-01-01");
    expect(result.incompleteLeaseIds).toEqual([]);
    expect(data.insert).toHaveBeenCalledWith("portfolio-1", expect.arrayContaining([
      expect.objectContaining({ item_type: "rent", unit_id: "unit-1" }),
      expect.objectContaining({ item_type: "charges", unit_id: "unit-1" }),
    ]));
  });

  it("refuses a main unit linked to another property", async () => {
    const data = store();
    data.listUnits = vi.fn(async () => [{
      id: "unit-1", property_id: "property-2", portfolio_id: "portfolio-1", unit_type: "apartment",
    }]);
    expect(await runDueReceivableJob(data, "2026-01-01")).toMatchObject({
      rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: ["lease-1"],
    });
    expect(data.insert).not.toHaveBeenCalled();
  });

  it("refuses an active lease after its main unit ends even if parking remains", async () => {
    const data = store();
    data.listAssignments = vi.fn(async () => [
      { lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01", end_date: "2026-01-10" },
      { lease_id: "lease-1", unit_id: "unit-2", start_date: "2026-01-01", end_date: null },
    ]);
    data.listUnits = vi.fn(async () => [
      { id: "unit-1", property_id: "property-1", portfolio_id: "portfolio-1", unit_type: "apartment" },
      { id: "unit-2", property_id: "property-1", portfolio_id: "portfolio-1", unit_type: "parking" },
    ]);
    expect(await runDueReceivableJob(data, "2026-01-15")).toMatchObject({
      rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: ["lease-1"],
    });
    expect(data.insert).not.toHaveBeenCalled();
  });

  it("reports an active lease whose assignments have ended", async () => {
    const data = store();
    data.listAssignments = vi.fn(async () => [{
      lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01", end_date: "2026-01-10",
    }]);
    expect(await runDueReceivableJob(data, "2026-01-15")).toMatchObject({
      rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: ["lease-1"],
    });
    expect(data.insert).not.toHaveBeenCalled();
  });

  it("rejects a property linked to another portfolio", async () => {
    const data = store();
    data.listProperties = vi.fn(async () => [{
      id: "property-1", portfolio_id: "portfolio-2", currency_code: "EUR",
    }]);
    expect(await runDueReceivableJob(data, "2026-01-01")).toMatchObject({
      rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: ["lease-1"],
    });
    expect(data.insert).not.toHaveBeenCalled();
  });

  it("continues scheduling other leases when one property date fails", async () => {
    const data = store();
    const firstLease = (await data.listLeases("portfolio-1", null, 50))[0];
    data.listLeases = vi.fn(async () => [firstLease, { ...firstLease, id: "lease-2", property_id: "property-2" }]);
    data.listProperties = vi.fn(async () => [
      { id: "property-1", portfolio_id: "portfolio-1", currency_code: "EUR" },
      { id: "property-2", portfolio_id: "portfolio-1", currency_code: "EUR" },
    ]);
    data.listAssignments = vi.fn(async () => [
      { lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01", end_date: null },
      { lease_id: "lease-2", unit_id: "unit-2", start_date: "2026-01-01", end_date: null },
    ]);
    data.listUnits = vi.fn(async () => [
      { id: "unit-1", property_id: "property-1", portfolio_id: "portfolio-1", unit_type: "apartment" },
      { id: "unit-2", property_id: "property-2", portfolio_id: "portfolio-1", unit_type: "apartment" },
    ]);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await runDueReceivableJob(data, "2026-01-01", undefined, property => {
        if (property.id === "property-1") throw new Error("No business date");
        return "2026-01-01";
      });

      expect(result).toEqual({
        leasesExamined: 2, rowsGenerated: 2, rowsInserted: 2, incompleteLeaseIds: ["lease-1"],
      });
      expect(data.insert).toHaveBeenCalledWith("portfolio-1", expect.arrayContaining([
        expect.objectContaining({ lease_id: "lease-2", unit_id: "unit-2" }),
      ]));
      expect(errorLog).toHaveBeenCalledOnce();
    } finally {
      errorLog.mockRestore();
    }
  });

  it("propagates a failed database insert for scheduler retry", async () => {
    const data = store();
    data.insert = vi.fn(async () => { throw new Error("Database unavailable"); });

    await expect(runDueReceivableJob(data, "2026-01-01")).rejects.toThrow("Database unavailable");
    expect(data.insert).toHaveBeenCalledOnce();
  });

  it.each([NaN, -1, 0.5, 3, null as unknown as number])(
    "rejects an invalid insertion acknowledgement (%s)",
    async (count) => {
      const data = store();
      data.insert = vi.fn(async () => count);

      await expect(runDueReceivableJob(data, "2026-01-01"))
        .rejects.toThrow("Invalid receivable insertion count");
    },
  );
});
