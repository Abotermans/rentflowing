import { render, screen, within } from "@testing-library/react";
import { vi, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";

const data = vi.hoisted(() => ({
  overallocated: false,
  canWrite: true,
  properties: [{ id: "p1", name: "Mixed property", currencyCode: "GBP", locale: "en-GB", isPartiallyOwned: false }],
  units: [{ id: "u1", propertyId: "p1", unitLabel: "Unit A" }],
  costEntries: [
    { id: "eur", propertyId: "p1", unitId: "u1", amount: 200, currencyCode: "EUR", status: "active", isTax: false, recoveryType: "tenant-recoverable" },
    { id: "gbp", propertyId: "p1", unitId: "u1", amount: 100, currencyCode: "GBP", status: "active", isTax: true, recoveryType: "owner-only" },
    { id: "cancelled", propertyId: "p1", unitId: null, amount: 1000, currencyCode: "GBP", status: "cancelled", isTax: false, recoveryType: "owner-only" },
  ],
  costAllocationResults: [
    { id: "stale", costEntryId: "cancelled", propertyId: "p1", unitId: "u1", allocatedAmount: 1000, ownerBurdenAmount: 1000, recoverableAmount: 0 },
  ],
}));

vi.mock("@/context/AppContext", () => ({
  useAppData: () => {
    const properties = data.overallocated
      ? [{ id: "p1", name: "Mixed property", currencyCode: "GBP", locale: "en-GB",
        isPartiallyOwned: true, milliemeBase: 1000 }]
      : data.properties;
    const units = data.overallocated
      ? [{ id: "u1", propertyId: "p1", unitLabel: "Unit A", milliemeShares: { general: 100 } }]
      : data.units;
    const costEntries = data.overallocated
      ? [{ id: "shared", label: "Roof repairs", propertyId: "p1", unitId: null, amount: 1000,
        currencyCode: "GBP", status: "active", isTax: false, recoveryType: "tenant-recoverable" }]
      : data.costEntries;
    const costAllocationResults = data.overallocated
      ? [{ id: "stale", costEntryId: "shared", propertyId: "p1", unitId: "u1",
        allocatedAmount: 1000, ownerBurdenAmount: 0, recoverableAmount: 1000 }]
      : data.costAllocationResults;
    return {
      properties, units, costEntries, costAllocationResults,
      getPropertyById: (id: string) => properties.find(item => item.id === id),
      getUnitById: (id: string) => units.find(item => item.id === id),
    };
  },
}));
vi.mock("@/context/SettingsContext", () => ({ useSettings: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-portfolio-write-access", () => ({ usePortfolioWriteAccess: () => data.canWrite }));

import CostsAllocations from "@/pages/CostsAllocations";

describe("cost allocation overview display", () => {
  it("shows actual currencies and excludes cancelled costs from property and unit totals", () => {
    render(<CostsAllocations />);
    const [propertyTable, unitTable] = screen.getAllByRole("table");
    const propertyRow = within(propertyTable).getByText("Mixed property").closest("tr")!;
    const unitRow = within(unitTable).getByText("Unit A").closest("tr")!;
    const euro = formatCurrency(200, "EUR", "en-GB");
    const pound = formatCurrency(100, "GBP", "en-GB");
    const normalized = (value: string | null) => (value ?? "").replace(/\s/g, " ");
    const propertyTotal = within(propertyRow).getAllByRole("cell").at(-1)!;
    const unitTotal = within(unitRow).getAllByRole("cell").at(-1)!;

    expect(normalized(propertyTotal.textContent)).toBe(normalized(`${euro} + ${pound}`));
    expect(normalized(unitTotal.textContent)).toBe(normalized(`${euro} + ${pound}`));
    expect(normalized(unitRow.textContent)).not.toContain(normalized(formatCurrency(1000, "GBP", "en-GB")));
  });

  it("warns when historical unit allocations exceed a partially owned property's cost", () => {
    data.overallocated = true;
    try {
      render(<MemoryRouter><CostsAllocations /></MemoryRouter>);
      const warning = screen.getByRole("alert");
      expect(warning).toHaveTextContent("costs.allocationExcessWarning");
      expect((warning.textContent ?? "").replace(/\s/g, " "))
        .toContain(formatCurrency(900, "GBP", "en-GB").replace(/\s/g, " "));
      expect(within(warning).getByRole("link", { name: "Roof repairs" }))
        .toHaveAttribute("href", "/costs/entries?edit=shared");
      const [propertyTable, unitTable] = screen.getAllByRole("table");
      const normalized = (value: string | null) => (value ?? "").replace(/\s/g, " ");
      const propertyRow = within(propertyTable).getByText("Mixed property").closest("tr")!;
      const unitRow = within(unitTable).getByText("Unit A").closest("tr")!;
      expect(normalized(within(propertyRow).getAllByRole("cell").at(-1)!.textContent))
        .toBe(normalized(formatCurrency(100, "GBP", "en-GB")));
      expect(normalized(within(unitRow).getAllByRole("cell").at(-1)!.textContent))
        .toBe(normalized(formatCurrency(1000, "GBP", "en-GB")));
    } finally {
      data.overallocated = false;
    }
  });

  it("shows the affected cost without a dead edit link to read-only users", () => {
    data.overallocated = true;
    data.canWrite = false;
    try {
      render(<CostsAllocations />);
      const warning = screen.getByRole("alert");
      expect(warning).toHaveTextContent("Roof repairs");
      expect(within(warning).queryByRole("link")).not.toBeInTheDocument();
    } finally {
      data.overallocated = false;
      data.canWrite = true;
    }
  });
});
