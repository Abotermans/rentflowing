import { describe, expect, it } from "vitest";
import { generateServerSchedule, toServerReceivableRow } from "@/lib/serverReceivableSchedule";

const lease = {
  id: "lease-1", portfolio_id: "portfolio-1", property_id: "property-1",
  tenant_ids: ["tenant-1"], billing_tenant_id: "tenant-1",
  lifecycle_stage: "active", start_date: "2026-01-01", end_date: "2026-12-31",
  monthly_rent: 900, monthly_charges: 100, rent_formula: 1,
  due_day_of_month: 5, pricing_mode: "separated",
};
const assignments = [{ lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01", end_date: null }];
const base = {
  lease, assignments, units: [{ id: "unit-1", unit_type: "apartment" }],
  amendments: [], changes: [], currencyCode: "EUR",
  leadDays: 15, businessDate: "2026-01-01", genId: () => crypto.randomUUID(),
};

describe("server receivable schedule adapter", () => {
  it("uses the shared calculator and maps the result for database insertion", () => {
    const items = generateServerSchedule(base);
    expect(items).toHaveLength(2);
    expect(items.map(item => item.expectedAmount)).toEqual([900, 100]);
    expect(items.every(item => item.unitId === "unit-1" && item.status === "open")).toBe(true);
    const row = toServerReceivableRow(items[0], "portfolio-1");
    expect(row).toMatchObject({ portfolio_id: "portfolio-1", lease_id: "lease-1", unit_id: "unit-1", due_date: "2026-01-05" });
    expect(row).not.toHaveProperty("created_at");
  });

  it("rejects invalid persisted billing terms instead of substituting defaults", () => {
    const invalid = [
      { due_day_of_month: 0 },
      { due_day_of_month: 32 },
      { rent_formula: 0 },
      { rent_formula: 1.5 },
      { monthly_rent: null },
      { monthly_rent: -1 },
      { monthly_charges: "" },
      { monthly_charges: -1 },
      { end_date: "2025-12-31" },
    ];
    for (const override of invalid) {
      expect(() => generateServerSchedule({ ...base, lease: { ...lease, ...override } }))
        .toThrow("invalid billing terms");
    }
  });

  it("restarts advance formula cycles at an activated amendment's effective date", () => {
    const items = generateServerSchedule({
      ...base,
      lease: { ...lease, rent_formula: 6, monthly_rent: 800 },
      businessDate: "2026-04-01",
      amendments: [{ id: "amendment-1", lease_id: "lease-1", status: "active", effective_date: "2026-04-01" }],
      changes: [{ amendment_id: "amendment-1", field_name: "rentFormula" }],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ periodMonth: "2026-04", cycleIndex: 1, expectedAmount: 4800 });
    expect(items[1]).toMatchObject({ periodMonth: "2026-04", expectedAmount: 600 });
  });

  it("uses the indexation terms in force for each historical billing cycle", () => {
    const indexation = (currentIndex: number) => ({
      indexationEnabled: true,
      indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100,
      indexationCurrentIndex: currentIndex,
      indexationCapPercent: null,
      indexationRoundingMode: "nearest-cent",
    });
    const items = generateServerSchedule({
      ...base,
      lease: { ...lease, end_date: "2028-02-28", monthly_rent: 1000,
        indexation_enabled: true, indexation_base_date: "2026-01-01",
        indexation_base_index: 100, indexation_current_index: 130 },
      businessDate: "2028-01-01",
      amendments: [
        { id: "amendment-1", lease_id: "lease-1", status: "ended", amendment_number: 1, effective_date: "2027-01-01" },
        { id: "amendment-2", lease_id: "lease-1", status: "active", amendment_number: 2, effective_date: "2028-01-01" },
      ],
      changes: [
        { amendment_id: "amendment-1", field_name: "indexationSettings", old_value: indexation(100), new_value: indexation(110) },
        { amendment_id: "amendment-2", field_name: "indexationSettings", old_value: indexation(110), new_value: indexation(130) },
      ],
    });
    const rent = (month: string) => items.find(item => item.itemType === "rent" && item.periodMonth === month);
    expect(rent("2026-01")?.expectedAmount).toBe(1000);
    expect(rent("2027-01")?.expectedAmount).toBe(1100);
    expect(rent("2028-01")?.expectedAmount).toBe(1300);
  });

  it("recreates old cycles with their former rent, charges, and billing tenant", () => {
    const items = generateServerSchedule({
      ...base,
      lease: { ...lease, monthly_rent: 1300, monthly_charges: 150,
        tenant_ids: ["tenant-2"], billing_tenant_id: "tenant-2" },
      assignments: [
        { lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01",
          end_date: "2026-06-30", rent_share: 1200, charges_share: 100 },
        { lease_id: "lease-1", unit_id: "unit-1", start_date: "2026-07-01",
          end_date: null, rent_share: 1300, charges_share: 150 },
      ],
      businessDate: "2026-07-01",
      amendments: [{ id: "amendment-1", lease_id: "lease-1", status: "active",
        amendment_number: 1, effective_date: "2026-07-01" }],
      changes: [
        { amendment_id: "amendment-1", field_name: "unitRentShare", old_value: 1200,
          new_value: 1300, metadata: { unitId: "unit-1" } },
        { amendment_id: "amendment-1", field_name: "unitChargesShare", old_value: 100,
          new_value: 150, metadata: { unitId: "unit-1" } },
        { amendment_id: "amendment-1", field_name: "tenantIds", old_value: ["tenant-1"],
          new_value: ["tenant-2"] },
        { amendment_id: "amendment-1", field_name: "billingTenantId", old_value: "tenant-1",
          new_value: "tenant-2" },
      ],
    });
    const bill = (month: string, type: string) => items.find(item =>
      item.periodMonth === month && item.itemType === type);
    expect(bill("2026-06", "rent")).toMatchObject({ expectedAmount: 1200, tenantId: "tenant-1" });
    expect(bill("2026-06", "charges")).toMatchObject({ expectedAmount: 100, tenantId: "tenant-1" });
    expect(bill("2026-07", "rent")).toMatchObject({ expectedAmount: 1300, tenantId: "tenant-2" });
    expect(bill("2026-07", "charges")).toMatchObject({ expectedAmount: 150, tenantId: "tenant-2" });
  });

  it("uses recorded pre-amendment totals and refuses incomplete billing history", () => {
    const input = {
      ...base,
      lease: { ...lease, monthly_rent: 1200, monthly_charges: 150 },
      businessDate: "2026-07-01",
      amendments: [{ id: "amendment-1", lease_id: "lease-1", status: "active",
        amendment_number: 1, effective_date: "2026-07-01" }],
      changes: [
        { amendment_id: "amendment-1", field_name: "baseMonthlyRentTotal",
          old_value: 900 as number | null, new_value: 1200 },
        { amendment_id: "amendment-1", field_name: "baseMonthlyChargesTotal",
          old_value: 100 as number | null, new_value: 150 },
      ],
    };
    const items = generateServerSchedule(input);
    expect(items.find(item => item.periodMonth === "2026-06" && item.itemType === "rent")?.expectedAmount).toBe(900);
    expect(items.find(item => item.periodMonth === "2026-06" && item.itemType === "charges")?.expectedAmount).toBe(100);
    expect(items.find(item => item.periodMonth === "2026-07" && item.itemType === "rent")?.expectedAmount).toBe(1200);
    expect(() => generateServerSchedule({ ...input, changes: [
      { ...input.changes[0], old_value: null }, input.changes[1],
    ] })).toThrow("Historical baseMonthlyRentTotal terms are missing");
    expect(() => generateServerSchedule({ ...input, changes: [
      input.changes[0], { ...input.changes[1], old_value: null },
    ] })).toThrow("Historical baseMonthlyChargesTotal terms are missing");
    expect(() => generateServerSchedule({ ...input, changes: [
      { ...input.changes[0], old_value: [] }, input.changes[1],
    ] })).toThrow("Historical baseMonthlyRentTotal terms are missing");
  });

  it("refuses to infer historical pricing from empty unit shares after a unit amendment", () => {
    const input = {
      ...base,
      lease: { ...lease, monthly_rent: 1100, monthly_charges: 140 },
      businessDate: "2026-07-01",
      amendments: [{ id: "amendment-1", lease_id: "lease-1", status: "active",
        amendment_number: 1, effective_date: "2026-07-01" }],
      changes: [{ amendment_id: "amendment-1", field_name: "unitAssignments",
        change_type: "add", metadata: { unitId: "unit-2" },
        new_value: { rentShare: 200, chargesShare: 40 } }],
    };
    expect(() => generateServerSchedule(input)).toThrow("missing unit rent shares");
    expect(() => generateServerSchedule({ ...input,
      assignments: [{ ...assignments[0], rent_share: 900 }],
    })).toThrow("missing unit charges shares");
    expect(generateServerSchedule({ ...input,
      assignments: [{ ...assignments[0], rent_share: 900, charges_share: 100 }],
    }).length).toBeGreaterThan(0);
    const recordedTotals = generateServerSchedule({
      ...input,
      changes: [
        ...input.changes,
        { amendment_id: "amendment-1", field_name: "baseMonthlyRentTotal",
          old_value: 900, new_value: 1100 },
        { amendment_id: "amendment-1", field_name: "baseMonthlyChargesTotal",
          old_value: 100, new_value: 140 },
      ],
    });
    expect(recordedTotals.find(item => item.periodMonth === "2026-06" && item.itemType === "rent")?.expectedAmount)
      .toBe(900);
    expect(recordedTotals.find(item => item.periodMonth === "2026-06" && item.itemType === "charges")?.expectedAmount)
      .toBe(100);
  });

  it("refuses to recreate old bills when earlier indexation terms are missing", () => {
    expect(() => generateServerSchedule({
      ...base,
      lease: { ...lease, indexation_enabled: true, indexation_base_date: "2026-01-01",
        indexation_base_index: 100, indexation_current_index: 130 },
      businessDate: "2027-01-01",
      amendments: [{ id: "amendment-1", lease_id: "lease-1", status: "active",
        amendment_number: 1, effective_date: "2027-01-01" }],
      changes: [{ amendment_id: "amendment-1", field_name: "indexationSettings", old_value: null }],
    })).toThrow("Historical indexation terms are missing");
  });

  it("allows base rent before the first anniversary but rejects missing indices afterward", () => {
    const input = {
      ...base,
      lease: { ...lease, end_date: "2027-02-28", indexation_enabled: true,
        indexation_base_date: "2026-01-01", indexation_base_index: null,
        indexation_current_index: null },
    };
    expect(generateServerSchedule(input).find(item => item.periodMonth === "2026-01" && item.itemType === "rent")?.expectedAmount)
      .toBe(900);
    expect(() => generateServerSchedule({ ...input, businessDate: "2027-01-01" }))
      .toThrow("Indexation cannot be calculated for lease lease-1 on 2027-01-01");
  });

  it("still bills charges on a zero-rent lease with unused indexation settings", () => {
    const items = generateServerSchedule({
      ...base,
      lease: { ...lease, end_date: "2027-01-31", monthly_rent: 0,
        indexation_enabled: true, indexation_base_date: "2026-01-01",
        indexation_base_index: null, indexation_current_index: null },
      businessDate: "2027-01-01",
    });
    expect(items.filter(item => item.periodMonth === "2027-01"))
      .toEqual([expect.objectContaining({ itemType: "charges", expectedAmount: 100 })]);
  });

  it("does not create a schedule for a lease without a persisted assignment", () => {
    expect(generateServerSchedule({ ...base, assignments: [] })).toEqual([]);
  });

  it("anchors a whole-lease bill to the main unit when parking sorts first", () => {
    const items = generateServerSchedule({
      ...base,
      assignments: [
        { lease_id: "lease-1", unit_id: "parking-1", start_date: "2026-01-01", end_date: null },
        ...assignments,
      ],
      units: [
        { id: "parking-1", unit_type: "parking" },
        { id: "unit-1", unit_type: "apartment" },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items.every(item => item.unitId === "unit-1")).toBe(true);
  });
});
