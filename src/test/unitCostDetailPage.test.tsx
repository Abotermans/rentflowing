import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/formatters";
import { TooltipProvider } from "@/components/ui/tooltip";

const data = vi.hoisted(() => ({
  properties: [{
    id: "p1", name: "Mixed property", referenceCode: "P1", address1: "Main Street",
    address2: "", city: "Brussels", postalCode: "1000", regionOrState: "",
    countryCode: "BE", propertyType: "residential", status: "active",
    locale: "en-GB", currencyCode: "GBP", measurementSystem: "metric",
    milliemeBase: 1000, milliemeKeys: ["general"], isPartiallyOwned: false,
    ownerName: "", description: "", timeZone: "Europe/Brussels",
  }],
  units: [{
    id: "u1", propertyId: "p1", unitCode: "U1", unitLabel: "Unit A",
    unitType: "apartment", floor: 1, surfaceArea: 50, bedrooms: 1, bathrooms: 1,
    furnished: false, currentStatus: "vacant", baseRent: null, rentTiers: [],
    baseCharges: null, availableFrom: null, description: "", notes: "",
    milliemeShares: { general: 100 }, createdAt: "2026-01-01", updatedAt: "2026-01-01",
  }],
  costEntries: [
    {
      id: "eur", propertyId: "p1", unitId: "u1", label: "Heating repair",
      categoryId: "c1", amount: 100, currencyCode: "EUR", status: "active",
      isTax: false, recoveryType: "partially-recoverable", recoverablePercentage: 40,
      startDate: "2026-01-01", endDate: null, frequency: "one-off", allocationRuleId: null,
    },
    {
      id: "gbp", propertyId: "p1", unitId: "u1", label: "Local tax",
      categoryId: "c1", amount: 25, currencyCode: "GBP", status: "active",
      isTax: true, recoveryType: "owner-only", recoverablePercentage: null,
      startDate: "2026-01-01", endDate: null, frequency: "one-off", allocationRuleId: null,
    },
    {
      id: "cancelled", propertyId: "p1", unitId: null, label: "Cancelled expense",
      categoryId: "c1", amount: 1000, currencyCode: "GBP", status: "cancelled",
      isTax: false, recoveryType: "owner-only", recoverablePercentage: null,
      startDate: "2026-01-01", endDate: null, frequency: "one-off", allocationRuleId: null,
    },
  ],
  costAllocationResults: [{
    id: "stale", costEntryId: "cancelled", propertyId: "p1", unitId: "u1",
    allocatedAmount: 1000, ownerBurdenAmount: 1000, recoverableAmount: 0,
    recoveryType: "owner-only", periodStart: "2026-01-01", periodEnd: null,
  }],
}));

vi.mock("@/context/AppContext", () => ({
  useAppData: () => ({
    properties: data.properties, units: data.units, leases: [], leaseUnitAssignments: [], tenants: [],
    costEntries: data.costEntries, costAllocationResults: data.costAllocationResults,
    getActiveLease: () => null,
    getTicketsByUnit: () => [],
    getCostEntriesByUnit: (id: string) => data.costEntries.filter(entry => entry.unitId === id),
    getAllocationResultsByUnit: (id: string) => data.costAllocationResults.filter(row => row.unitId === id),
    getCostCategoryById: () => ({ name: "Maintenance" }),
    getAllocationRuleById: () => null,
  }),
}));
vi.mock("@/context/SettingsContext", () => ({ useSettings: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-integrity-state", () => ({ useIntegrityState: () => ({}) }));
vi.mock("@/hooks/use-portfolio-write-access", () => ({ usePortfolioWriteAccess: () => false }));
vi.mock("@/hooks/use-business-now", () => ({ useBusinessNow: () => new Date("2026-11-05T12:00:00Z") }));
vi.mock("@/context/OverrideContext", () => ({ useOverrideHistory: () => ({ addOverride: vi.fn() }) }));
vi.mock("@/components/profitability/UnitProfitabilitySection", () => ({ UnitProfitabilitySection: () => null }));
vi.mock("@/components/leases/LeaseAddDialog", () => ({ LeaseAddDialog: () => null }));
vi.mock("@/components/maintenance/MaintenanceTicketDialog", () => ({ MaintenanceTicketDialog: () => null }));
vi.mock("@/components/costs/CostEntryDialog", () => ({ CostEntryDialog: () => null }));

import UnitDetail from "@/pages/UnitDetail";

describe("unit cost detail display", () => {
  it("shows each invoice currency and recovery split without cancelled allocations", () => {
    render(
      <TooltipProvider>
        <MemoryRouter initialEntries={["/units/u1"]}>
          <Routes><Route path="/units/:id" element={<UnitDetail />} /></Routes>
        </MemoryRouter>
      </TooltipProvider>,
    );

    const normalized = (value: string | null) => (value ?? "").replace(/\s/g, " ");
    const owner = screen.getByText("units.ownerBorne").parentElement!;
    const recoverable = screen.getByText("units.recoverable").parentElement!;
    const euroRow = screen.getByText("Heating repair").closest("tr")!;
    const poundRow = screen.getByText("Local tax").closest("tr")!;

    expect(normalized(owner.textContent)).toContain(normalized(formatCurrency(60, "EUR", "en-GB")));
    expect(normalized(owner.textContent)).toContain(normalized(formatCurrency(25, "GBP", "en-GB")));
    expect(normalized(recoverable.textContent)).toContain(normalized(formatCurrency(40, "EUR", "en-GB")));
    expect(normalized(within(euroRow).getAllByRole("cell")[7].textContent)).toContain(normalized(formatCurrency(100, "EUR", "en-GB")));
    expect(normalized(within(poundRow).getAllByRole("cell")[7].textContent)).toContain(normalized(formatCurrency(25, "GBP", "en-GB")));
    expect(screen.queryByText("Cancelled expense")).not.toBeInTheDocument();
  });
});
