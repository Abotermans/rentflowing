import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock("@/context/AppContext", () => ({
  useAppData: () => ({
    receivableItems: [{
      id: "item-1", tenantId: "tenant-1", leaseId: null,
      propertyId: "property-1", unitId: null, currencyCode: "EUR",
      outstandingAmount: 100,
    }],
    tenants: [{ id: "tenant-1", firstName: "Test", lastName: "Tenant" }],
    leases: [], properties: [{ id: "property-1", currencyCode: "EUR" }], units: [],
    quickPayReceivable: mock.save,
  }),
}));
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({
    t: (key: string) => ({
      "payments.quickPay.amount": "Amount",
      "payments.quickPay.confirm": "Confirm payment",
      "payments.dialog.invalidAmount": "Enter an amount with at most two decimal places.",
      "common.mandatoryField": "Mandatory field",
      "common.positiveAmount": "Amount must be greater than zero.",
    })[key] ?? key,
  }),
}));

import { QuickPayReceivableDialog } from "@/components/payments/QuickPayReceivableDialog";

describe("quick-pay amount", () => {
  beforeEach(() => mock.save.mockReset().mockResolvedValue(undefined));

  it("shows a sub-cent error below the field and saves a valid comma decimal", async () => {
    render(<QuickPayReceivableDialog receivableItemId="item-1" onOpenChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Amount (EUR) *" });
    fireEvent.change(input, { target: { value: "1.001" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter an amount with at most two decimal places.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeDisabled();
    expect(mock.save).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "1,25" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledWith(
      expect.objectContaining({ receivableItemId: "item-1", amountReceived: 1.25 }),
    ));
  });
});
