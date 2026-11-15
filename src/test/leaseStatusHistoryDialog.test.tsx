import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/useLeaseStatusHistory", () => ({
  useLeaseStatusHistory: () => ({
    loading: false,
    entries: [
      {
        id: "change-1", leaseId: "lease-1", portfolioId: "portfolio-1",
        fromStage: "signed", toStage: "active",
        reason: "scheduled-date-transition", notes: null,
        changedBy: null, changedAt: "2026-10-17T00:00:00Z",
      },
      {
        id: "change-2", leaseId: "lease-1", portfolioId: "portfolio-1",
        fromStage: "active", toStage: "ended",
        reason: "Specific owner instruction", notes: null,
        changedBy: null, changedAt: "2026-10-16T00:00:00Z",
      },
    ],
  }),
}));

import { LeaseStatusHistoryDialog } from "@/components/leases/LeaseStatusHistoryDialog";

describe("lease status history labels", () => {
  it("translates known reasons and preserves a custom reason", () => {
    render(
      <LeaseStatusHistoryDialog
        open onOpenChange={vi.fn()} leaseId="lease-1"
        leaseReference="LEASE-1" currentStage="active"
      />,
    );
    expect(screen.getByText("lease.statusHistory.reason.scheduledDateTransition")).toBeInTheDocument();
    expect(screen.getByText("Specific owner instruction")).toBeInTheDocument();
  });
});
