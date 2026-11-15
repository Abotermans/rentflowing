import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ leadDays: 15 }));
vi.mock("@/context/PortfolioContext", () => ({
  usePortfolio: () => ({ currentPortfolio: { receivable_lead_days: mock.leadDays } }),
}));

import { SettingsProvider, useSettings } from "@/context/SettingsContext";

const wrapper = ({ children }: { children: ReactNode }) => <SettingsProvider>{children}</SettingsProvider>;

describe("portfolio receivable lead time", () => {
  it("uses the current portfolio value instead of a browser-only preference", () => {
    localStorage.setItem("app-receivable-lead-days", "90");
    mock.leadDays = 7;
    const { result, rerender } = renderHook(useSettings, { wrapper });
    expect(result.current.receivableLeadDays).toBe(7);

    mock.leadDays = 30;
    rerender();
    expect(result.current.receivableLeadDays).toBe(30);
    localStorage.removeItem("app-receivable-lead-days");
  });
});
