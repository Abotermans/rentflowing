import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  tickets: [] as Array<Record<string, unknown>>,
  properties: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/context/AppContext", () => ({
  useAppData: () => ({
    tickets: mock.tickets,
    properties: mock.properties,
    units: [],
    vendors: [],
    leases: [],
    tenants: [],
    receivableItems: [],
    guarantees: [],
    getGuaranteeByLease: () => null,
    getAncillaryLeaseUnits: () => [],
  }),
}));
vi.mock("@/context/SettingsContext", async () => {
  const { getTranslation } = await vi.importActual<typeof import("@/i18n/translations")>("@/i18n/translations");
  return { useSettings: () => ({ t: (key: Parameters<typeof getTranslation>[1]) => getTranslation("en", key) }) };
});

import Reports from "@/pages/Reports";

function renderMaintenanceReport(createdDate: string, countryCode: string) {
  mock.properties = [{ id: "property-1", name: "Example", countryCode }];
  mock.tickets = [{
    id: "ticket-1", propertyId: "property-1", unitId: null,
    assignedVendorId: null, title: "Heating repair", createdDate,
    category: "heating", priority: "medium", status: "open",
  }];
  render(<MemoryRouter><Reports /></MemoryRouter>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Maintenance" }), {
    button: 0, ctrlKey: false,
  });
  return screen.getByText("Heating repair").closest("tr")!;
}

describe("maintenance backlog age", () => {
  afterEach(() => {
    vi.useRealTimers();
    mock.tickets = [];
    mock.properties = [];
  });

  it("shows zero days for a ticket created today, even after noon", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:00:00Z"));
    const row = renderMaintenanceReport("2026-06-30", "BE");
    expect(within(row).getByText("0")).toBeInTheDocument();
  });

  it("counts calendar days in the property zone across a clock change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T22:30:00Z"));
    const row = renderMaintenanceReport("2026-10-24", "BE");
    expect(within(row).getByText("1")).toBeInTheDocument();
  });

  it("keeps assigned work in the backlog but excludes completed work", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:00:00Z"));
    mock.properties = [{ id: "property-1", name: "Example", countryCode: "BE" }];
    mock.tickets = [
      { id: "assigned", propertyId: "property-1", unitId: null, assignedVendorId: null,
        title: "Assigned repair", createdDate: "2026-06-29", category: "heating", priority: "high", status: "assigned" },
      { id: "completed", propertyId: "property-1", unitId: null, assignedVendorId: null,
        title: "Completed repair", createdDate: "2026-06-01", category: "heating", priority: "high", status: "completed" },
    ];
    render(<MemoryRouter><Reports /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Maintenance" }), { button: 0, ctrlKey: false });

    expect(screen.getByText("Assigned repair")).toBeInTheDocument();
    expect(screen.queryByText("Completed repair")).not.toBeInTheDocument();
    expect(screen.getByText("Open Tickets").parentElement).toHaveTextContent("1");
  });
});
