import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReceivableItem } from "@/types/receivables";

const rows: ReceivableItem[] = [
  {
    id: "be-rent", leaseId: null, tenantId: null, propertyId: "be", unitId: null,
    itemType: "rent", label: "BE rent", periodMonth: "2026-06", dueDate: "2026-06-30",
    currencyCode: "EUR", expectedAmount: 100, allocatedAmount: 0, outstandingAmount: 100,
    status: "open", priority: 10, origin: "manual", notes: "", createdAt: "2026-06-01", updatedAt: "2026-06-01",
  },
  {
    id: "gb-rent", leaseId: null, tenantId: null, propertyId: "gb", unitId: null,
    itemType: "rent", label: "GB rent", periodMonth: "2026-06", dueDate: "2026-06-30",
    currencyCode: "GBP", expectedAmount: 100, allocatedAmount: 0, outstandingAmount: 100,
    status: "open", priority: 10, origin: "manual", notes: "", createdAt: "2026-06-01", updatedAt: "2026-06-01",
  },
];

vi.mock("@/context/AppContext", () => ({ useAppData: () => ({
  retryLoad: vi.fn(), receivableItems: rows, cashReceipts: [], allocations: [],
  leases: [], tenants: [], units: [],
  properties: [
    { id: "be", name: "Brussels", countryCode: "BE", currencyCode: "EUR" },
    { id: "gb", name: "London", countryCode: "GB", currencyCode: "GBP" },
  ],
  getReceivableItemsByLease: () => [], getReceivableItemsByTenant: () => [],
}) }));
vi.mock("@/context/SettingsContext", () => ({ useSettings: () => ({ t: (key: string) => key }) }));
vi.mock("@/context/PortfolioContext", () => ({ usePortfolio: () => ({ currentPortfolio: { role: "viewer" } }) }));
vi.mock("@/hooks/use-portfolio-write-access", () => ({ usePortfolioWriteAccess: () => false }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/payments/QuickPayReceivableDialog", () => ({ QuickPayReceivableDialog: () => null }));

import Payments from "@/pages/Payments";

describe("payment overdue filter", () => {
  afterEach(() => vi.useRealTimers());

  it("filters by each receivable property's date at a cross-border midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T22:30:00.000Z"));
    render(<MemoryRouter><Payments /></MemoryRouter>);

    expect(screen.getByText("BE rent")).toBeInTheDocument();
    expect(screen.getByText("GB rent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "payments.filter.overdueOnly" }));
    expect(screen.getByText("BE rent")).toBeInTheDocument();
    expect(screen.queryByText("GB rent")).not.toBeInTheDocument();
  });
});
