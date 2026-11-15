import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
  portfolioId: "portfolio-1",
  role: "owner",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mock.invoke },
    rpc: mock.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => table === "portfolio_members"
          ? Promise.resolve({ data: [], error: null })
          : { is: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) },
      }),
    }),
  },
}));
vi.mock("@/context/PortfolioContext", () => ({
  usePortfolio: () => ({
    currentPortfolio: { id: mock.portfolioId, name: "Example", role: mock.role, default_currency: "EUR", default_locale: "en" },
    currentPortfolioId: mock.portfolioId,
    refresh: mock.refresh,
  }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner-1", email: "owner@example.com" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));

import PortfolioSettings from "@/pages/PortfolioSettings";

describe("existing portfolio member addition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.portfolioId = "portfolio-1";
    mock.role = "owner";
    mock.invoke.mockResolvedValue({ data: { email: "colleague@example.com" }, error: null });
    mock.rpc.mockResolvedValue({ data: [], error: null });
  });

  it("adds only a verified existing account without collecting or sending a password", async () => {
    render(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Members" }), { button: 0 });
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument());

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "colleague@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() => expect(mock.invoke).toHaveBeenCalledWith("create-portfolio-user", {
      body: { portfolio_id: "portfolio-1", email: "colleague@example.com", role: "editor" },
    }));
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Existing user added" }));
  });

  it("shows a backend verification error without clearing the email", async () => {
    mock.invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge function returned an error",
        context: { json: async () => ({ error: "This account has not confirmed its email. Send an invitation instead." }) },
      },
    });
    render(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Members" }), { button: 0 });
    const email = await screen.findByLabelText("Email");
    fireEvent.change(email, { target: { value: "pending@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not add member",
      description: "This account has not confirmed its email. Send an invitation instead.",
      variant: "destructive",
    })));
    expect(email).toHaveValue("pending@example.com");
  });

  it("identifies members by email before offering role changes", async () => {
    mock.rpc.mockResolvedValueOnce({
      data: [{ id: "member-2", user_id: "user-2", email: "colleague@example.com", role: "editor", joined_at: "2026-01-01" }],
      error: null,
    });
    render(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Members" }), { button: 0 });

    expect(await screen.findByText("colleague@example.com")).toBeInTheDocument();
    expect(mock.rpc).toHaveBeenCalledWith("list_portfolio_members_for_management", { _portfolio_id: "portfolio-1" });
  });

  it("does not show an old portfolio's members when its response arrives late", async () => {
    let resolveOld!: (result: { data: unknown[]; error: null }) => void;
    mock.rpc.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    mock.rpc.mockResolvedValueOnce({
      data: [{ id: "member-b", user_id: "user-b", email: "b@example.com", role: "editor", joined_at: "2026-01-01" }],
      error: null,
    });
    const view = render(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledTimes(1));

    mock.portfolioId = "portfolio-2";
    view.rerender(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Members" }), { button: 0 });
    expect(await screen.findByText("b@example.com")).toBeInTheDocument();

    await act(async () => {
      resolveOld({
        data: [{ id: "member-a", user_id: "user-a", email: "a@example.com", role: "owner", joined_at: "2026-01-01" }],
        error: null,
      });
    });
    expect(screen.queryByText("a@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("b@example.com")).toBeInTheDocument();
  });

  it("disables membership changes when the member list cannot be verified", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: "Migration missing" } });
    render(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Members" }), { button: 0 });
    expect(await screen.findByRole("alert")).toHaveTextContent("Member list unavailable");
    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "new@example.com" } });
    expect(screen.getByRole("button", { name: "Add member" })).toBeDisabled();
  });

  it("hides loaded member emails immediately after management access is lost", async () => {
    mock.rpc.mockResolvedValueOnce({
      data: [{ id: "member-2", user_id: "user-2", email: "private@example.com", role: "editor", joined_at: "2026-01-01" }],
      error: null,
    });
    const view = render(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Members" }), { button: 0 });
    expect(await screen.findByText("private@example.com")).toBeInTheDocument();

    await act(async () => {
      mock.role = "viewer";
      view.rerender(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
    });
    expect(screen.queryByText("private@example.com")).not.toBeInTheDocument();
  });
});
