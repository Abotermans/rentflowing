import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  leases: [] as Array<Record<string, unknown>>,
  assignments: [] as Array<{ leaseId: string; unit: { id: string; unitCode: string }; assignment?: { unitId: string; rentShare: number | null } }>,
  assignmentQueryDates: [] as Array<{ leaseId: string; onDate?: string }>,
  activeLookupDates: [] as Array<{ unitId: string; onDate?: string }>,
  activeAssignments: [] as Array<{ leaseId: string; unitId: string; rentShare: number | null }>,
  units: [] as Array<Record<string, unknown>>,
  tenants: [] as Array<Record<string, unknown>>,
  receivableItems: [] as Array<Record<string, unknown>>,
  guarantees: [] as Array<Record<string, unknown>>,
  properties: [{ id: "property-1", name: "Example", countryCode: "BE", currencyCode: "EUR" }] as Array<Record<string, unknown>>,
  locale: "en" as "en" | "fr",
}));

const exportMock = vi.hoisted(() => ({ exportToCSV: vi.fn() }));

vi.mock("@/context/AppContext", () => ({
  useAppData: () => ({
    leases: mock.leases,
    properties: mock.properties,
    units: mock.units, tenants: mock.tenants, receivableItems: mock.receivableItems,
    guarantees: mock.guarantees, tickets: [], vendors: [],
    getGuaranteeByLease: () => null,
    getLeaseAssignedUnits: (leaseId: string, opts?: { onDate?: string }) => {
      mock.assignmentQueryDates.push({ leaseId, onDate: opts?.onDate });
      return mock.assignments.filter(row => row.leaseId === leaseId);
    },
    getActiveLeaseAssignmentForUnit: (unitId: string, onDate?: string) => {
      mock.activeLookupDates.push({ unitId, onDate });
      const assignment = mock.activeAssignments.find(row => row.unitId === unitId);
      const lease = mock.leases.find(row => row.id === assignment?.leaseId);
      return assignment && lease ? { lease, assignment } : undefined;
    },
    getActiveLease: (unitId: string) => {
      const assignment = mock.activeAssignments.find(row => row.unitId === unitId);
      return mock.leases.find(row => row.id === assignment?.leaseId);
    },
  }),
}));
vi.mock("@/context/SettingsContext", async () => {
  const { getTranslation } = await vi.importActual<typeof import("@/i18n/translations")>("@/i18n/translations");
  return { useSettings: () => ({
    locale: mock.locale,
    t: (key: Parameters<typeof getTranslation>[1]) => getTranslation(mock.locale, key),
  }) };
});
vi.mock("@/lib/exportCsv", () => exportMock);

import Reports from "@/pages/Reports";

const lease = (id: string, lifecycleStage: string, startDate: string, endDate: string | null, monthlyRent: number) => ({
  id, leaseReference: id, propertyId: "property-1", unitId: "stale-unit",
  primaryTenantId: null, lifecycleStage, startDate, endDate,
  monthlyRent, monthlyCharges: 0, noticeGiven: false,
});

describe("current rent roll", () => {
  afterEach(() => {
    vi.useRealTimers();
    mock.leases = [];
    mock.assignments = [];
    mock.assignmentQueryDates = [];
    mock.activeLookupDates = [];
    mock.activeAssignments = [];
    mock.units = [];
    mock.tenants = [];
    mock.receivableItems = [];
    mock.guarantees = [];
    mock.properties = [{ id: "property-1", name: "Example", countryCode: "BE", currencyCode: "EUR" }];
    mock.locale = "en";
    exportMock.exportToCSV.mockReset();
  });

  it("totals only current leases with an assigned unit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    mock.leases = [
      lease("CURRENT", "active", "2026-01-01", "2027-01-01", 600),
      lease("SIGNED-PAST-START", "signed", "2026-09-01", "2027-09-01", 800),
      lease("STALE-EXPIRED", "active", "2025-01-01", "2026-10-31", 1000),
      lease("NO-ASSIGNMENT", "active", "2026-01-01", "2027-01-01", 500),
    ];
    mock.assignments = [
      { leaseId: "CURRENT", unit: { id: "unit-1", unitCode: "BRU-A01" } },
      { leaseId: "SIGNED-PAST-START", unit: { id: "unit-2", unitCode: "BRU-A02" } },
      { leaseId: "STALE-EXPIRED", unit: { id: "unit-3", unitCode: "BRU-A03" } },
    ];

    render(<MemoryRouter><Reports /></MemoryRouter>);

    expect(screen.getByText("CURRENT")).toBeInTheDocument();
    expect(screen.getByText("SIGNED-PAST-START")).toBeInTheDocument();
    expect(screen.queryByText("STALE-EXPIRED")).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("NO-ASSIGNMENT")).not.toBeInTheDocument();
    expect(within(screen.getByRole("alert")).getByRole("link", { name: "NO-ASSIGNMENT" }))
      .toHaveAttribute("href", "/leases/NO-ASSIGNMENT");
    expect(screen.getByText("BRU-A01")).toBeInTheDocument();
    expect(screen.getByText("BRU-A02")).toBeInTheDocument();
    expect(screen.getByText("Active Leases").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Total Monthly Rent").parentElement).toHaveTextContent(/1\s400\s€/);
  });

  it("uses each property's calendar day at a cross-border midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T23:30:00Z"));
    mock.properties = [
      { id: "property-1", name: "Brussels", countryCode: "BE", currencyCode: "EUR" },
      { id: "property-2", name: "London", countryCode: "GB", currencyCode: "GBP" },
    ];
    mock.leases = [
      lease("BRUSSELS", "active", "2026-01-01", "2026-10-31", 600),
      { ...lease("LONDON", "active", "2026-01-01", "2026-10-31", 800), propertyId: "property-2" },
    ];
    mock.assignments = [
      { leaseId: "BRUSSELS", unit: { id: "unit-1", unitCode: "BRU-A01" } },
      { leaseId: "LONDON", unit: { id: "unit-2", unitCode: "LON-A01" } },
    ];
    mock.units = [
      { id: "unit-1", propertyId: "property-1", unitCode: "BRU-A01", unitType: "apartment", currentStatus: "vacant" },
      { id: "unit-2", propertyId: "property-2", unitCode: "LON-A01", unitType: "apartment", currentStatus: "vacant" },
    ];

    render(<MemoryRouter><Reports /></MemoryRouter>);

    expect(screen.queryByText("BRUSSELS")).not.toBeInTheDocument();
    expect(screen.getByText("LONDON")).toBeInTheDocument();
    expect(screen.getByText("Total Monthly Rent").parentElement).toHaveTextContent(/800\s£/);
    expect(mock.assignmentQueryDates).toContainEqual({ leaseId: "LONDON", onDate: "2026-10-31" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Occupancy" }), { button: 0 });
    expect(mock.activeLookupDates).toContainEqual({ unitId: "unit-1", onDate: "2026-11-01" });
    expect(mock.activeLookupDates).toContainEqual({ unitId: "unit-2", onDate: "2026-10-31" });
  });

  it("shows indexed lease rent and only reconciled indexed shares for occupied units", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"));
    mock.leases = [{
      ...lease("INDEXED", "active", "2026-01-01", "2027-12-31", 1000),
      indexationEnabled: true, indexationBaseDate: "2026-01-01",
      indexationBaseIndex: 100, indexationCurrentIndex: 110,
    }];
    mock.units = ["unit-1", "unit-2"].map((id, index) => ({
      id, propertyId: "property-1", unitCode: `BRU-A0${index + 1}`,
      unitType: "apartment", currentStatus: "occupied", availableFrom: null,
    }));
    mock.assignments = [
      { leaseId: "INDEXED", unit: { id: "unit-1", unitCode: "BRU-A01" }, assignment: { unitId: "unit-1", rentShare: 900 } },
      { leaseId: "INDEXED", unit: { id: "unit-2", unitCode: "BRU-A02" }, assignment: { unitId: "unit-2", rentShare: 100 } },
    ];
    mock.activeAssignments = [
      { leaseId: "INDEXED", unitId: "unit-1", rentShare: 900 },
      { leaseId: "INDEXED", unitId: "unit-2", rentShare: 100 },
    ];

    const { rerender } = render(<MemoryRouter><Reports /></MemoryRouter>);

    expect(screen.getByText("Total Monthly Rent").parentElement).toHaveTextContent(/1\s100\s€/);
    expect(within(screen.getByRole("table")).getAllByText(/1\s100\s€/)).toHaveLength(2);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Occupancy" }), { button: 0 });
    const rows = within(screen.getByRole("tabpanel", { name: "Occupancy" })).getAllByRole("row");
    expect(rows.find(row => within(row).queryByText("BRU-A01"))).toHaveTextContent(/990\s€/);
    expect(rows.find(row => within(row).queryByText("BRU-A02"))).toHaveTextContent(/110\s€/);

    mock.assignments[1].assignment!.rentShare = 50;
    rerender(<MemoryRouter><Reports /></MemoryRouter>);
    const inconsistentRow = within(screen.getByRole("tabpanel", { name: "Occupancy" }))
      .getAllByRole("row").find(row => within(row).queryByText("BRU-A01"));
    expect(within(inconsistentRow!).getAllByRole("cell")[5]).toHaveTextContent("—");
  });

  it("does not count analytical charges twice for an all-inclusive lease", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    mock.leases = [{
      ...lease("INCLUSIVE", "active", "2026-01-01", "2027-01-01", 1000),
      monthlyCharges: 150, pricingMode: "all-inclusive",
    }];
    mock.assignments = [{ leaseId: "INCLUSIVE", unit: { id: "unit-1", unitCode: "BRU-A01" } }];

    render(<MemoryRouter><Reports /></MemoryRouter>);

    expect(screen.getByText("Total Monthly Rent").parentElement).toHaveTextContent(/1\s000\s€/);
    expect(screen.getByText("Total Monthly Charges").parentElement).toHaveTextContent(/0\s€/);
    expect(screen.getByText("Total Monthly Income").parentElement).toHaveTextContent(/1\s000\s€/);
    const row = within(screen.getByRole("table")).getByRole("row", { name: /INCLUSIVE/ });
    expect(row).toHaveTextContent(/1\s000\s€0\s€1\s000\s€/);
  });

  it("excludes cancelled and written-off balances from the overdue report", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    mock.tenants = [{ id: "tenant-1", firstName: "Marie", lastName: "Martin" }];
    mock.receivableItems = [
      { id: "due", tenantId: "tenant-1", leaseId: null, propertyId: "property-1", dueDate: "2026-10-01", outstandingAmount: 40, currencyCode: "EUR", status: "overdue" },
      { id: "future", tenantId: "tenant-1", leaseId: null, propertyId: "property-1", dueDate: "2026-12-01", outstandingAmount: 20, currencyCode: "EUR", status: "open" },
      { id: "cancelled", tenantId: "tenant-1", leaseId: null, propertyId: "property-1", dueDate: "2026-09-01", outstandingAmount: 100, currencyCode: "EUR", status: "cancelled" },
      { id: "written-off", tenantId: "tenant-1", leaseId: null, propertyId: "property-1", dueDate: "2026-09-01", outstandingAmount: 200, currencyCode: "EUR", status: "written-off" },
    ];

    render(<MemoryRouter><Reports /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Overdue" }), { button: 0 });

    expect(screen.getByText("Total Overdue").parentElement).toHaveTextContent(/40\s€/);
    expect(screen.getByText("Total Outstanding").parentElement).toHaveTextContent(/60\s€/);
    const row = within(screen.getByRole("tabpanel", { name: "Overdue" }))
      .getByRole("row", { name: /Marie Martin/ });
    expect(row).toHaveTextContent(/40\s€60\s€/);
  });

  it("renders French report labels and exports French column headings", () => {
    mock.locale = "fr";
    mock.leases = [lease("LEASE-FR", "ended", "2025-01-01", "2025-12-31", 800)];
    mock.guarantees = [{
      id: "guarantee-1", leaseId: "LEASE-FR", type: "cash-deposit",
      expectedAmount: 1600, receivedAmount: 1600, status: "active",
    }];
    render(<MemoryRouter><Reports /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Rapports" })).toBeInTheDocument();
    expect(screen.getByText("Baux actifs")).toBeInTheDocument();
    expect(screen.getByText("Aucun bail actif trouvé.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exporter CSV" }));
    expect(exportMock.exportToCSV).toHaveBeenCalledWith("rent-roll", [
      "Référence", "Bien", "Unité", "Locataire", "Loyer", "Charges", "Total", "Statut de la garantie",
    ], []);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Occupation" }), { button: 0 });
    expect(screen.getByText("Total des unités")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Impayés" }), { button: 0 });
    expect(screen.getByText("Total à percevoir")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Échéances de baux" }), { button: 0 });
    expect(screen.getByText("Aucun bail n’arrive à échéance sur cette période.")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dépôts & Garanties" }), { button: 0 });
    expect(screen.getByText("Total des garanties")).toBeInTheDocument();
    expect(screen.getByText("Dépôt de garantie")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exporter CSV" }));
    expect(exportMock.exportToCSV).toHaveBeenLastCalledWith("deposits", [
      "Bail", "Locataire", "Bien", "Type", "Attendu", "Reçu", "Statut",
    ], expect.any(Array));
    expect(exportMock.exportToCSV.mock.lastCall?.[2][0][3]).toBe("Dépôt de garantie");
    expect(exportMock.exportToCSV.mock.lastCall?.[2][0][6]).toBe("Actif");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Maintenance" }), { button: 0 });
    expect(screen.getAllByText("Tickets ouverts")).toHaveLength(2);
  });
});
