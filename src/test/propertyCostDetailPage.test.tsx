import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/formatters";

const data = vi.hoisted(() => ({
  properties: [{
    id: "p1", name: "Mixed property", referenceCode: "P1", address1: "Main Street",
    address2: "", city: "Brussels", postalCode: "1000", regionOrState: "",
    countryCode: "BE", propertyType: "residential", status: "active",
    locale: "en-GB", currencyCode: "GBP", measurementSystem: "metric",
    milliemeBase: 1000, milliemeKeys: ["general"], isPartiallyOwned: false,
    ownerName: "", description: "",
  }],
  units: [{
    id: "u1", propertyId: "p1", unitCode: "U1", unitLabel: "Unit A",
    unitType: "apartment", floor: 1, surfaceArea: 50, currentStatus: "vacant",
    baseRent: null, baseCharges: null, milliemeShares: { general: 100 },
  }],
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
  useAppData: () => ({
    properties: data.properties, units: data.units, leases: [], leaseUnitAssignments: [], tenants: [],
    getPropertyStats: () => ({ total: 1, occupied: 0, vacant: 1, reserved: 0, unavailable: 0, occupancyRate: 0 }),
    getActiveLease: () => null,
    getOwnersForProperty: () => [],
    getCostEntriesByProperty: (id: string) => data.costEntries.filter(entry => entry.propertyId === id),
    getAllocationResultsByProperty: (id: string) => data.costAllocationResults.filter(row => row.propertyId === id),
  }),
}));
vi.mock("@/context/SettingsContext", () => ({ useSettings: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-integrity-state", () => ({ useIntegrityState: () => ({}) }));
vi.mock("@/hooks/use-portfolio-write-access", () => ({ usePortfolioWriteAccess: () => false }));
vi.mock("@/hooks/use-business-now", () => ({ useBusinessNow: () => new Date("2026-11-05T12:00:00Z") }));
vi.mock("@/context/OverrideContext", () => ({ useOverrideHistory: () => ({ addOverride: vi.fn() }) }));
vi.mock("@/components/profitability/PropertyProfitabilitySection", () => ({ PropertyProfitabilitySection: () => null }));

import PropertyDetail from "@/pages/PropertyDetail";

describe("property cost detail display", () => {
  it("groups costs by invoice currency and ignores cancelled allocation rows", () => {
    render(
      <MemoryRouter initialEntries={["/properties/p1"]}>
        <Routes><Route path="/properties/:id" element={<PropertyDetail />} /></Routes>
      </MemoryRouter>,
    );
    const euro = formatCurrency(200, "EUR", "en-GB");
    const pound = formatCurrency(100, "GBP", "en-GB");
    const normalized = (value: string | null) => (value ?? "").replace(/\s/g, " ");
    const total = screen.getByText("propertyDetail.totalCosts").parentElement!;
    const unitRow = screen.getAllByRole("link", { name: "U1" }).at(-1)!.closest("tr")!;

    expect(normalized(total.textContent)).toContain(normalized(`${euro} + ${pound}`));
    expect(normalized(unitRow.textContent)).toContain(normalized(`${euro} + ${pound}`));
    expect(normalized(unitRow.textContent)).not.toContain(normalized(formatCurrency(1000, "GBP", "en-GB")));
    expect(within(unitRow).getAllByRole("cell")).toHaveLength(4);
  });
});
