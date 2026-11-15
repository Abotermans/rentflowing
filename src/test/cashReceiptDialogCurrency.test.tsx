import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  properties: [] as Array<{ id: string; currencyCode: string }>,
  leases: [] as Array<{ id: string; propertyId: string; primaryTenantId: string; coTenantIds: string[]; tenantIds: string[]; lifecycleStage: string; leaseReference: string }>,
  save: vi.fn(),
}));

vi.mock("@/context/AppContext", () => ({
  useAppData: () => ({
    tenants: [], leases: mock.leases, properties: mock.properties,
    createCashReceiptPersisted: mock.save,
  }),
}));
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({
    t: (key: string) => ({
      "properties.currency": "Currency",
      "payments.dialog.amountReceived": "Amount received",
      "payments.dialog.selectCurrency": "Select currency",
      "payments.dialog.currencyRequired": "Select a currency for this receipt.",
      "payments.recordCashReceipt": "Record cash receipt",
      "payments.dialog.invalidAmount": "Enter an amount with at most two decimal places.",
      "common.mandatoryField": "Mandatory field",
      "common.positiveAmount": "Amount must be greater than zero.",
    })[key] ?? key,
  }),
}));

import { CashReceiptDialog } from "@/components/payments/CashReceiptDialog";

describe("cash receipt currency field", () => {
  beforeEach(() => {
    mock.properties = [
      { id: "eur-property", currencyCode: "EUR" },
      { id: "gbp-property", currencyCode: "GBP" },
    ];
    mock.leases = [{
      id: "gbp-lease", propertyId: "gbp-property", primaryTenantId: "tenant-1",
      tenantIds: ["tenant-1"], coTenantIds: [], lifecycleStage: "active",
      leaseReference: "GBP-001",
    }];
    mock.save.mockReset();
  });

  it("asks for a currency when no lease is selected in a mixed portfolio", () => {
    render(<CashReceiptDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Currency *")).toBeInTheDocument();
    expect(screen.getByText("Select currency")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Record cash receipt" }));
    expect(screen.getByText("Select a currency for this receipt.")).toBeInTheDocument();
    expect(mock.save).not.toHaveBeenCalled();
  });

  it("defaults to the selected lease currency while allowing an override", () => {
    render(<CashReceiptDialog open onOpenChange={vi.fn()} prefillLeaseId="gbp-lease" />);
    expect(screen.getByText("Amount received (GBP) *")).toBeInTheDocument();
    expect(screen.getByText("Currency *")).toBeInTheDocument();
  });

  it("shows the amount error below the field and accepts comma-decimal cents", async () => {
    mock.save.mockResolvedValue({});
    render(<CashReceiptDialog open onOpenChange={vi.fn()} prefillLeaseId="gbp-lease" />);
    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "1.001" } });
    fireEvent.click(screen.getByRole("button", { name: "Record cash receipt" }));
    expect(screen.getByText("Enter an amount with at most two decimal places.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(mock.save).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "1,25" } });
    fireEvent.click(screen.getByRole("button", { name: "Record cash receipt" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledWith(
      expect.objectContaining({ amountReceived: 1.25, unmatchedAmount: 1.25 }), true,
    ));
  });

  it("does not submit a second receipt while the first save is pending", async () => {
    let finishSave: ((value: object) => void) | undefined;
    mock.save.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
    render(<CashReceiptDialog open onOpenChange={vi.fn()} prefillLeaseId="gbp-lease" />);
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "2,50" } });
    const button = screen.getByRole("button", { name: "Record cash receipt" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mock.save).toHaveBeenCalledOnce();
    finishSave?.({});
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
