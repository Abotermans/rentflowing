import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CashReceipt, ReceivableItem } from "@/types/receivables";

const mocks = vi.hoisted(() => ({ allocateCashReceipt: vi.fn().mockResolvedValue(undefined) }));

const receivable: ReceivableItem = {
  id: "rent", leaseId: null, tenantId: "tenant", propertyId: "property", unitId: null,
  itemType: "rent", label: "Monthly rent", periodMonth: "2026-06", dueDate: "2026-06-01",
  currencyCode: "EUR", expectedAmount: 100, allocatedAmount: 0, outstandingAmount: 100,
  status: "open", priority: 10, origin: "manual", notes: "", createdAt: "2026-06-01", updatedAt: "2026-06-01",
};
const receipt: CashReceipt = {
  id: "receipt", tenantId: "tenant", leaseId: null, propertyId: "property", unitId: null,
  sourceType: "manual", paymentDate: "2026-06-01", bookingDate: null, valueDate: null,
  amountReceived: 100, currencyCode: "EUR", payerName: null, payerIban: null, payerBic: null,
  reference: "TEST", remittanceInformation: null, endToEndReference: null,
  status: "unmatched", unmatchedAmount: 100, notes: "", importBatchId: null,
  rawBankTransactionId: null, createdAt: "2026-06-01", updatedAt: "2026-06-01",
};

vi.mock("@/context/AppContext", () => ({ useAppData: () => ({
  retryLoad: vi.fn(), receivableItems: [receivable], cashReceipts: [receipt], allocations: [],
  leases: [], tenants: [], units: [],
  properties: [{ id: "property", name: "Brussels", countryCode: "BE", currencyCode: "EUR" }],
  allocateCashReceipt: mocks.allocateCashReceipt,
  autoAllocateCashReceipt: vi.fn(), createCashReceiptPersisted: vi.fn(),
  getReceivableItemsByLease: () => [], getReceivableItemsByTenant: () => [],
}) }));
vi.mock("@/context/SettingsContext", () => ({ useSettings: () => ({ t: (key: string) => key }) }));
vi.mock("@/context/PortfolioContext", () => ({ usePortfolio: () => ({ currentPortfolio: { id: "portfolio", role: "editor" } }) }));
vi.mock("@/hooks/use-portfolio-write-access", () => ({ usePortfolioWriteAccess: () => true }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/payments/QuickPayReceivableDialog", () => ({ QuickPayReceivableDialog: () => null }));

import Payments from "@/pages/Payments";

describe("manual allocation dialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("keeps receivable and receipt status filters independent across tabs", () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Element.prototype.scrollIntoView = vi.fn();
    render(<MemoryRouter><Payments /></MemoryRouter>);

    fireEvent.click(screen.getByText("payments.filter.status"));
    fireEvent.click(screen.getByText("payments.filter.overdue"));
    expect(screen.getByText("Monthly rent")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /payments.tab.cashReceipts/ }), {
      button: 0, ctrlKey: false,
    });
    expect(screen.getByText("TEST")).toBeInTheDocument();

    fireEvent.click(screen.getByText("payments.filter.status"));
    fireEvent.click(screen.getByText("payments.filter.unmatched"));
    expect(screen.getByText("TEST")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /payments.tab.receivables/ }), {
      button: 0, ctrlKey: false,
    });
    expect(screen.getByText("Monthly rent")).toBeInTheDocument();
  });

  it("shows errors below invalid amounts and submits only an exact corrected amount", async () => {
    mocks.allocateCashReceipt.mockClear();
    render(<MemoryRouter><Payments /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /payments.tab.cashReceipts/ }), {
      button: 0, ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "payments.action.allocate" }));

    const input = screen.getByRole("textbox", { name: "Monthly rent payments.dialog.amount" });
    const submit = screen.getByRole("button", { name: "payments.dialog.applyManual" });
    fireEvent.change(input, { target: { value: "1e" } });
    expect(screen.getByText("payments.dialog.invalidAmount")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();

    fireEvent.change(input, { target: { value: "101" } });
    expect(screen.getByText("payments.dialog.exceedsReceivable")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(input, { target: { value: "50,25" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.allocateCashReceipt).toHaveBeenCalledWith("receipt", [
      { receivableItemId: "rent", amount: 50.25 },
    ]));
  });
});
