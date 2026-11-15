import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  leases: [] as Array<Record<string, unknown>>,
  receivableItems: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/context/AppContext", () => ({
  useAppData: () => ({
    leases: mock.leases,
    receivableItems: mock.receivableItems,
    properties: [
      { id: "property-1", name: "Property One", countryCode: "BE", currencyCode: "EUR" },
      { id: "property-2", name: "Property Two", countryCode: "GB", currencyCode: "GBP" },
    ],
    tenants: [{ id: "tenant-1", firstName: "Marie", lastName: "Martin", tenantType: "individual" }],
    units: [], tickets: [], vendors: [],
    getGuaranteeByLease: () => null,
    getLeaseAssignedUnits: () => [],
  }),
}));
vi.mock("@/context/SettingsContext", async () => {
  const { getTranslation } = await vi.importActual<typeof import("@/i18n/translations")>("@/i18n/translations");
  return { useSettings: () => ({ t: (key: Parameters<typeof getTranslation>[1]) => getTranslation("en", key) }) };
});

import Reports from "@/pages/Reports";

describe("overdue report attribution", () => {
  afterEach(() => {
    vi.useRealTimers();
    mock.leases = [];
    mock.receivableItems = [];
  });

  it("attributes each tenant balance to its own lease and property", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    mock.leases = [
      { id: "lease-1", leaseReference: "LEASE-ONE", propertyId: "property-1", primaryTenantId: "tenant-1",
        lifecycleStage: "ended", startDate: "2025-01-01", endDate: "2025-12-31", noticeGiven: false },
      { id: "lease-2", leaseReference: "LEASE-TWO", propertyId: "property-2", primaryTenantId: "tenant-1",
        lifecycleStage: "active", startDate: "2026-01-01", endDate: "2027-12-31", noticeGiven: false },
    ];
    mock.receivableItems = [
      { id: "item-1", tenantId: "tenant-1", leaseId: "lease-1", propertyId: "property-1",
        dueDate: "2025-12-01", outstandingAmount: 100, currencyCode: "EUR" },
      { id: "item-2", tenantId: "tenant-1", leaseId: "lease-2", propertyId: "property-2",
        dueDate: "2026-10-01", outstandingAmount: 200, currencyCode: "GBP" },
      { id: "item-3", tenantId: "tenant-1", leaseId: "lease-2", propertyId: "property-2",
        dueDate: "2027-01-01", outstandingAmount: 50, currencyCode: "GBP" },
    ];

    render(<MemoryRouter><Reports /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Overdue" }), { button: 0, ctrlKey: false });

    const oldLeaseRow = screen.getByRole("link", { name: "LEASE-ONE" }).closest("tr")!;
    const currentLeaseRow = screen.getByRole("link", { name: "LEASE-TWO" }).closest("tr")!;
    expect(within(oldLeaseRow).getByText("Property One")).toBeInTheDocument();
    expect(oldLeaseRow).toHaveTextContent(/100\s€/);
    expect(within(currentLeaseRow).getByText("Property Two")).toBeInTheDocument();
    expect(currentLeaseRow).toHaveTextContent(/200\s£/);
    expect(currentLeaseRow).toHaveTextContent(/250\s£/);
    expect(screen.getByText("Overdue Tenants").parentElement).toHaveTextContent("1");
  });
});
