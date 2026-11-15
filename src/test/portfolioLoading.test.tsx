import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  eq: vi.fn(), profileEq: vi.fn(), user: { id: "user-1" } as { id: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => table === "profiles"
    ? { select: () => ({ eq: () => ({ maybeSingle: mock.profileEq }) }) }
    : { select: () => ({ eq: mock.eq }) } },
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: mock.user }),
}));

import { PortfolioProvider, usePortfolio } from "@/context/PortfolioContext";

const wrapper = ({ children }: { children: ReactNode }) => <PortfolioProvider>{children}</PortfolioProvider>;

describe("portfolio loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mock.user = { id: "user-1" };
    mock.profileEq.mockResolvedValue({ data: { default_portfolio_id: null }, error: null });
  });

  it("uses the profile default on a new browser and preserves an accessible recent choice", async () => {
    mock.eq.mockResolvedValue({ data: ["portfolio-1", "portfolio-2"].map(id => ({
      role: "owner", portfolios: {
        id, name: id, default_currency: "EUR", default_locale: "en",
        show_occupancy_operations: false,
      },
    })), error: null });
    mock.profileEq.mockResolvedValue({ data: { default_portfolio_id: "portfolio-2" }, error: null });
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.currentPortfolioId).toBe("portfolio-2"));
    act(() => result.current.switchPortfolio("other-portfolio"));
    expect(result.current.currentPortfolioId).toBe("portfolio-2");
    act(() => result.current.switchPortfolio("portfolio-1"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.currentPortfolioId).toBe("portfolio-1");
  });

  it("ignores an inaccessible profile default and stale browser selection", async () => {
    localStorage.setItem("currentPortfolioId:user-1", "removed-portfolio");
    mock.eq.mockResolvedValue({ data: [{ role: "viewer", portfolios: {
      id: "portfolio-1", name: "Accessible", default_currency: "EUR",
      default_locale: "en", show_occupancy_operations: false,
    } }], error: null });
    mock.profileEq.mockResolvedValue({ data: { default_portfolio_id: "other-portfolio" }, error: null });
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.currentPortfolioId).toBe("portfolio-1"));
    expect(result.current.error).toBeNull();
  });

  it("shows load errors and propagates failed refreshes instead of treating them as no portfolios", async () => {
    mock.eq.mockResolvedValue({ data: null, error: { message: "Database unavailable" } });
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Database unavailable");
    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow("Database unavailable");
    });

    mock.eq.mockResolvedValue({
      data: [{ role: "editor", portfolios: {
        id: "portfolio-1", name: "Example", default_currency: "EUR",
        default_locale: "en", show_occupancy_operations: false,
      } }],
      error: null,
    });
    await act(async () => { await result.current.refresh(); });

    expect(result.current.error).toBeNull();
    expect(result.current.currentPortfolio?.name).toBe("Example");
  });

  it("does not expose an old account's portfolios while switching accounts or after a late response", async () => {
    mock.user = { id: "user-1" };
    let resolveOldRefresh: ((response: unknown) => void) | undefined;
    let resolveNewLoad: ((response: unknown) => void) | undefined;
    const portfolioRow = (id: string) => ({
      role: "editor", portfolios: {
        id, name: id, default_currency: "EUR", default_locale: "en",
        show_occupancy_operations: false,
      },
    });
    let oldRequests = 0;
    mock.eq.mockImplementation((_field: string, userId: string) => {
      if (userId === "user-2") return new Promise(resolve => { resolveNewLoad = resolve; });
      oldRequests += 1;
      if (oldRequests === 1) return Promise.resolve({ data: [portfolioRow("portfolio-1")], error: null });
      return new Promise(resolve => { resolveOldRefresh = resolve; });
    });
    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.currentPortfolioId).toBe("portfolio-1"));
    const oldAccountRefresh = result.current.refresh;
    const oldAccountSwitch = result.current.switchPortfolio;
    const staleRefresh = result.current.refresh();
    await waitFor(() => expect(resolveOldRefresh).toBeDefined());

    act(() => {
      mock.user = { id: "user-2" };
      rerender();
    });
    expect(result.current.currentPortfolioId).toBeNull();
    expect(result.current.portfolios).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => {
      resolveNewLoad?.({ data: [portfolioRow("portfolio-2")], error: null });
    });
    await waitFor(() => expect(result.current.currentPortfolioId).toBe("portfolio-2"));
    await act(async () => {
      resolveOldRefresh?.({ data: [portfolioRow("portfolio-1")], error: null });
      await expect(staleRefresh).rejects.toThrow("superseded");
    });
    expect(result.current.portfolios.map(portfolio => portfolio.id)).toEqual(["portfolio-2"]);
    expect(result.current.currentPortfolioId).toBe("portfolio-2");
    expect(localStorage.getItem("currentPortfolioId:user-2")).toBe("portfolio-2");
    await expect(oldAccountRefresh()).rejects.toThrow("superseded");
    act(() => oldAccountSwitch("portfolio-1"));
    expect(result.current.currentPortfolioId).toBe("portfolio-2");
  });

  it("hides the previous account's portfolios immediately on sign-out", async () => {
    mock.eq.mockResolvedValue({ data: [{ role: "owner", portfolios: {
      id: "portfolio-1", name: "Private", default_currency: "EUR",
      default_locale: "en", show_occupancy_operations: false,
    } }], error: null });
    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.currentPortfolioId).toBe("portfolio-1"));
    act(() => {
      mock.user = null;
      rerender();
    });
    expect(result.current.portfolios).toEqual([]);
    expect(result.current.currentPortfolioId).toBeNull();
    expect(result.current.currentPortfolio).toBeNull();
  });

  it("loads and switches portfolios when browser storage is unavailable", async () => {
    mock.eq.mockResolvedValue({ data: ["portfolio-1", "portfolio-2"].map(id => ({
      role: "owner", portfolios: {
        id, name: id, default_currency: "EUR", default_locale: "en",
        show_occupancy_operations: false,
      },
    })), error: null });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage denied");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage denied");
    });
    try {
      const { result } = renderHook(() => usePortfolio(), { wrapper });
      await waitFor(() => expect(result.current.currentPortfolioId).toBe("portfolio-1"));
      expect(result.current.error).toBeNull();
      act(() => result.current.switchPortfolio("portfolio-2"));
      expect(result.current.currentPortfolioId).toBe("portfolio-2");
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
