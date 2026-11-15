import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTranslation } from "@/i18n/translations";
import type { Locale, TranslationKey } from "@/i18n/translations";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  membership: vi.fn(),
  useAuth: vi.fn(),
  refresh: vi.fn(),
  switchPortfolio: vi.fn(),
  toast: vi.fn(),
  locale: "en" as Locale,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc, from: mock.from } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: mock.useAuth }));
vi.mock("@/context/PortfolioContext", () => ({
  usePortfolio: () => ({ refresh: mock.refresh, switchPortfolio: mock.switchPortfolio }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ t: (key: TranslationKey) => getTranslation(mock.locale, key) }),
}));

import AcceptInvite from "@/pages/auth/AcceptInvite";

const invite = {
  id: "invite-1", portfolio_id: "portfolio-1", email: "invitee@example.com",
  role: "editor", expires_at: "2099-01-01T00:00:00Z", accepted_at: null,
  portfolio_name: "Example portfolio",
};

function renderInvite() {
  render(
    <MemoryRouter initialEntries={["/accept-invite/token-1"]}>
      <Routes>
        <Route path="/accept-invite/:token" element={<AcceptInvite />} />
        <Route path="/" element={<div>Portfolio home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("portfolio invitation acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.locale = "en";
    mock.refresh.mockResolvedValue(undefined);
    mock.membership.mockResolvedValue({ data: null, error: null });
    mock.from.mockImplementation(() => {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        maybeSingle: mock.membership,
      };
      return builder;
    });
    mock.rpc.mockImplementation(async (name: string) => name === "get_portfolio_invitation"
      ? { data: [invite], error: null }
      : { data: "portfolio-1", error: null });
  });

  it("shows a token-scoped invitation to a signed-out invitee", async () => {
    mock.useAuth.mockReturnValue({ user: null });
    renderInvite();

    expect(await screen.findByText("Join Example portfolio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to accept" })).toHaveAttribute(
      "href", "/login?next=%2Faccept-invite%2Ftoken-1",
    );
    expect(mock.rpc).toHaveBeenCalledWith("get_portfolio_invitation", { _token: "token-1" });
  });

  it("shows the invitation and account mismatch in French", async () => {
    mock.locale = "fr";
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: "other@example.com" } });
    renderInvite();

    expect(await screen.findByText("Rejoindre Example portfolio")).toBeInTheDocument();
    expect(screen.getByText(/Vous êtes invité comme/)).toHaveTextContent("Vous êtes invité comme Éditeur (invitee@example.com).");
    fireEvent.click(screen.getByRole("button", { name: "Accepter l'invitation" }));

    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Mauvais compte",
      description: "Cette invitation est destinée à invitee@example.com. Connectez-vous avec cette adresse.",
      variant: "destructive",
    }));
    expect(mock.rpc).not.toHaveBeenCalledWith("accept_portfolio_invitation", expect.anything());
  });

  it("accepts atomically through the backend function before switching portfolios", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.switchPortfolio).toHaveBeenCalledWith("portfolio-1"));
    expect(mock.rpc).toHaveBeenCalledWith("accept_portfolio_invitation", { _token: "token-1" });
    expect(await screen.findByText("Portfolio home")).toBeInTheDocument();
  });

  it("does not report success when backend acceptance fails", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    mock.rpc.mockImplementation(async (name: string) => name === "get_portfolio_invitation"
      ? { data: [invite], error: null }
      : { data: null, error: { message: "Invitation expired" } });
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Failed to join", description: "Invitation expired", variant: "destructive",
    })));
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
  });

  it("clears the busy state when the backend request throws", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    mock.rpc.mockImplementation(async (name: string) => name === "get_portfolio_invitation"
      ? { data: [invite], error: null }
      : Promise.reject(new Error("Network unavailable")));
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Failed to join", description: "Network unavailable",
    })));
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
  });

  it("reports an accepted invitation separately from a failed portfolio refresh", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    mock.refresh.mockRejectedValue(new Error("Portfolio list unavailable"));
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Invitation accepted, but portfolio could not be loaded",
      description: "Portfolio list unavailable",
    })));
    expect(mock.switchPortfolio).toHaveBeenCalledWith("portfolio-1");
    expect(screen.getByText("Portfolio home")).toBeInTheDocument();
  });

  it("recovers an accepted invitation after the RPC response is lost", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    mock.rpc.mockImplementation(async (name: string) => name === "get_portfolio_invitation"
      ? { data: [invite], error: null }
      : Promise.reject(new Error("Connection lost")));
    mock.membership.mockResolvedValue({ data: { portfolio_id: "portfolio-1" }, error: null });
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.switchPortfolio).toHaveBeenCalledWith("portfolio-1"));
    expect(mock.membership).toHaveBeenCalledTimes(1);
    expect(mock.from).toHaveBeenCalledWith("portfolio_members");
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Joined portfolio" }));
    expect(await screen.findByText("Portfolio home")).toBeInTheDocument();
  });

  it("rejects a successful response naming a different portfolio", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    mock.rpc.mockImplementation(async (name: string) => name === "get_portfolio_invitation"
      ? { data: [invite], error: null }
      : { data: "portfolio-other", error: null });
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Failed to join", description: expect.stringContaining("different portfolio"),
    })));
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
    expect(mock.membership).not.toHaveBeenCalled();
  });

  it("does not claim acceptance when membership readback fails", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    mock.rpc.mockImplementation(async (name: string) => name === "get_portfolio_invitation"
      ? { data: [invite], error: null }
      : { data: null, error: { message: "Connection lost" } });
    mock.membership.mockResolvedValue({ data: null, error: { message: "Membership unavailable" } });
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not verify invitation", description: expect.stringContaining("Membership unavailable"),
    })));
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
  });

  it("treats a thrown membership readback as an unverified outcome", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    mock.rpc.mockImplementation(async (name: string) => name === "get_portfolio_invitation"
      ? { data: [invite], error: null }
      : Promise.reject(new Error("Connection lost")));
    mock.membership.mockRejectedValue(new Error("Read timed out"));
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not verify invitation", description: expect.stringContaining("Read timed out"),
    })));
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
  });

  it("does not trust a successful-looking ID when the RPC also reports an error", async () => {
    mock.useAuth.mockReturnValue({ user: { id: "user-1", email: invite.email } });
    mock.rpc.mockImplementation(async (name: string) => name === "get_portfolio_invitation"
      ? { data: [invite], error: null }
      : { data: "portfolio-1", error: { message: "Transaction rolled back" } });
    renderInvite();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Failed to join", description: "Transaction rolled back",
    })));
    expect(mock.membership).toHaveBeenCalledTimes(1);
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
  });
});
