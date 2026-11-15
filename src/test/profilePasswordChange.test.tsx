import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  updatePassword: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
  switchPortfolio: vi.fn(),
  deleteMembership: vi.fn(),
  profileRead: vi.fn(),
  profileUpdate: vi.fn(),
  emailUpdate: vi.fn(),
  userId: "user-1",
  portfolios: [] as { id: string; name: string; role: "owner" | "admin" | "editor" | "viewer" }[],
  locale: "en" as "en" | "fr",
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: mock.userId, email: "user@example.com" },
    updatePassword: mock.updatePassword,
  }),
}));
vi.mock("@/context/PortfolioContext", () => ({
  usePortfolio: () => ({ portfolios: mock.portfolios, refresh: mock.refresh, switchPortfolio: mock.switchPortfolio }),
}));
vi.mock("@/context/SettingsContext", async () => {
  const { getTranslation } = await vi.importActual<typeof import("@/i18n/translations")>("@/i18n/translations");
  return { useSettings: () => ({ t: (key: Parameters<typeof getTranslation>[1]) => getTranslation(mock.locale, key) }) };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { updateUser: mock.emailUpdate },
    from: (table: string) => table === "portfolio_members" ? {
      delete: () => ({ match: () => ({ select: mock.deleteMembership }) }),
    } : {
      select: () => ({ eq: () => ({ maybeSingle: mock.profileRead }) }),
      update: () => ({ eq: () => ({ select: mock.profileUpdate }) }),
    },
  },
}));

import Profile from "@/pages/Profile";

describe("profile password change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.profileRead.mockReset();
    mock.profileUpdate.mockReset();
    mock.emailUpdate.mockReset();
    mock.portfolios = [];
    mock.locale = "en";
    mock.userId = "user-1";
    mock.updatePassword.mockResolvedValue({ error: null });
    mock.refresh.mockResolvedValue(undefined);
    mock.deleteMembership.mockResolvedValue({ data: [{ id: "member-1" }], error: null });
    mock.profileRead.mockResolvedValue({ data: { first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: null }, error: null });
    mock.profileUpdate.mockResolvedValue({ data: [{ id: "user-1" }], error: null });
    mock.emailUpdate.mockResolvedValue({ error: null });
  });

  it("recovers from a thrown profile save without clearing entered details", async () => {
    mock.profileUpdate.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<Profile />);
    const firstName = await screen.findByLabelText("First name");
    fireEvent.change(firstName, { target: { value: "Alexandre" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not save profile", description: "Network unavailable", variant: "destructive",
    })));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(firstName).toHaveValue("Alexandre");
  });

  it("sends a profile change only once while its first write is pending", async () => {
    let resolveWrite: (value: { data: { id: string }[]; error: null }) => void = () => {};
    mock.profileUpdate.mockImplementationOnce(() => new Promise(resolve => { resolveWrite = resolve; }));
    render(<Profile />);
    const firstName = await screen.findByLabelText("First name");
    const form = firstName.closest("form") as HTMLFormElement;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mock.profileUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    resolveWrite({ data: [{ id: "user-1" }], error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Profile saved" }));
  });

  it("recovers from a thrown email update and preserves the address", async () => {
    mock.emailUpdate.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Email & password" }), { button: 0 });
    const email = await screen.findByLabelText("New email");
    fireEvent.change(email, { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Update email" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not update email", description: "Network unavailable", variant: "destructive",
    })));
    expect(screen.getByRole("button", { name: "Update email" })).toBeEnabled();
    expect(email).toHaveValue("new@example.com");
  });

  it("recovers from a thrown password update without clearing either field", async () => {
    mock.updatePassword.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Email & password" }), { button: 0 });
    const current = await screen.findByLabelText("Current password");
    const next = screen.getByLabelText("New password");
    fireEvent.change(current, { target: { value: "old-password" } });
    fireEvent.change(next, { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not update password", description: "Network unavailable", variant: "destructive",
    })));
    expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled();
    expect(current).toHaveValue("old-password");
    expect(next).toHaveValue("new-password");
  });

  it("does not mark a default portfolio changed when its save throws", async () => {
    mock.portfolios = [
      { id: "portfolio-1", name: "First", role: "editor" },
      { id: "portfolio-2", name: "Second", role: "editor" },
    ];
    mock.profileRead.mockResolvedValueOnce({ data: { first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: "portfolio-1" }, error: null });
    mock.profileUpdate.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    await waitFor(() => expect(within(screen.getByText("First").closest("div.border") as HTMLElement).getByText("Default")).toBeInTheDocument());
    fireEvent.click(within(screen.getByText("Second").closest("div.border") as HTMLElement).getByRole("button", { name: "Set as default" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not update default portfolio", description: "Network unavailable", variant: "destructive",
    })));
    expect(within(screen.getByText("First").closest("div.border") as HTMLElement).getByText("Default")).toBeInTheDocument();
    expect(within(screen.getByText("Second").closest("div.border") as HTMLElement).getByRole("button", { name: "Set as default" })).toBeEnabled();
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
  });

  it("selects the new default portfolio only after its save succeeds", async () => {
    mock.portfolios = [
      { id: "portfolio-1", name: "First", role: "owner" },
      { id: "portfolio-2", name: "Second", role: "viewer" },
    ];
    mock.profileRead.mockResolvedValue({ data: {
      first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: "portfolio-1",
    }, error: null });
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    fireEvent.click(within(screen.getByText("Second").closest("div.border") as HTMLElement)
      .getByRole("button", { name: "Set as default" }));
    await waitFor(() => expect(mock.switchPortfolio).toHaveBeenCalledWith("portfolio-2"));
    expect(screen.getByText("Second").closest("div.border")).toHaveTextContent("Default");
  });

  it("does not apply an old account's delayed default save to a new account", async () => {
    mock.portfolios = [
      { id: "portfolio-1", name: "First", role: "owner" },
      { id: "portfolio-2", name: "Second", role: "viewer" },
    ];
    mock.profileRead.mockResolvedValueOnce({ data: {
      first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: "portfolio-1",
    }, error: null }).mockResolvedValueOnce({ data: {
      first_name: "Sam", last_name: "Lee", phone: "", default_portfolio_id: "portfolio-1",
    }, error: null });
    let resolveSave: (value: { data: { id: string }[]; error: null }) => void = () => {};
    mock.profileUpdate.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    const view = render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    fireEvent.click(within(screen.getByText("Second").closest("div.border") as HTMLElement)
      .getByRole("button", { name: "Set as default" }));
    await waitFor(() => expect(mock.profileUpdate).toHaveBeenCalled());

    mock.userId = "user-2";
    view.rerender(<Profile />);
    expect(await screen.findByLabelText("First name")).toHaveValue("Sam");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Portfolios" }), { button: 0 });
    await waitFor(() => expect(screen.getByText("First").closest("div.border")).toHaveTextContent("Default"));
    await act(async () => { resolveSave({ data: [{ id: "user-1" }], error: null }); });

    expect(screen.getByText("First").closest("div.border")).toHaveTextContent("Default");
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
  });

  it("keeps a new account's save locked when the old account's request finishes", async () => {
    mock.portfolios = [
      { id: "portfolio-1", name: "First", role: "owner" },
      { id: "portfolio-2", name: "Second", role: "viewer" },
    ];
    mock.profileRead.mockResolvedValueOnce({ data: {
      first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: "portfolio-1",
    }, error: null }).mockResolvedValueOnce({ data: {
      first_name: "Sam", last_name: "Lee", phone: "", default_portfolio_id: "portfolio-1",
    }, error: null });
    let resolveOld: (value: { data: { id: string }[]; error: null }) => void = () => {};
    let resolveNew: (value: { data: { id: string }[]; error: null }) => void = () => {};
    mock.profileUpdate.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
    const view = render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    fireEvent.click(within(screen.getByText("Second").closest("div.border") as HTMLElement)
      .getByRole("button", { name: "Set as default" }));
    await waitFor(() => expect(mock.profileUpdate).toHaveBeenCalledTimes(1));

    mock.userId = "user-2";
    view.rerender(<Profile />);
    expect(await screen.findByLabelText("First name")).toHaveValue("Sam");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Portfolios" }), { button: 0 });
    const button = within(screen.getByText("Second").closest("div.border") as HTMLElement)
      .getByRole("button", { name: "Set as default" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(mock.profileUpdate).toHaveBeenCalledTimes(2));
    expect(button).toBeDisabled();

    await act(async () => { resolveOld({ data: [{ id: "user-1" }], error: null }); });
    expect(button).toBeDisabled();
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
    await act(async () => { resolveNew({ data: [{ id: "user-2" }], error: null }); });
    expect(mock.switchPortfolio).toHaveBeenCalledExactlyOnceWith("portfolio-2");
  });

  it("blocks editing and offers a retry when the profile read fails", async () => {
    mock.profileRead.mockResolvedValueOnce({ data: null, error: { message: "Network unavailable" } })
      .mockResolvedValueOnce({ data: { first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: null }, error: null });
    render(<Profile />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your profile");
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("First name")).toHaveValue("Alex");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not treat an absent profile row as an empty editable profile", async () => {
    mock.profileRead.mockResolvedValueOnce({ data: null, error: null });
    render(<Profile />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your profile");
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
  });

  it("never shows the previous account's profile while another account loads", async () => {
    let resolveSecond: (value: { data: { first_name: string; last_name: string; phone: string; default_portfolio_id: null }; error: null }) => void = () => {};
    mock.profileRead.mockResolvedValueOnce({ data: { first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: null }, error: null })
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
    const view = render(<Profile />);
    expect(await screen.findByLabelText("First name")).toHaveValue("Alex");

    mock.userId = "user-2";
    view.rerender(<Profile />);
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveSecond({ data: { first_name: "Sam", last_name: "Lee", phone: "", default_portfolio_id: null }, error: null });
    expect(await screen.findByLabelText("First name")).toHaveValue("Sam");
  });

  it("clears email and password drafts when the signed-in account changes", async () => {
    mock.profileRead.mockResolvedValueOnce({ data: {
      first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: null,
    }, error: null }).mockResolvedValueOnce({ data: {
      first_name: "Sam", last_name: "Lee", phone: "", default_portfolio_id: null,
    }, error: null });
    const view = render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Email & password" }), { button: 0 });
    fireEvent.change(screen.getByLabelText("New email"), { target: { value: "old@example.com" } });
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-secret" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-secret" } });

    mock.userId = "user-2";
    view.rerender(<Profile />);
    expect(await screen.findByLabelText("First name")).toHaveValue("Sam");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Email & password" }), { button: 0 });
    expect(screen.getByLabelText("New email")).toHaveValue("");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("does not announce an old account's delayed password change in a new session", async () => {
    mock.profileRead.mockResolvedValueOnce({ data: {
      first_name: "Alex", last_name: "Martin", phone: "", default_portfolio_id: null,
    }, error: null }).mockResolvedValueOnce({ data: {
      first_name: "Sam", last_name: "Lee", phone: "", default_portfolio_id: null,
    }, error: null });
    let resolvePassword: (value: { error: null }) => void = () => {};
    mock.updatePassword.mockImplementationOnce(() => new Promise(resolve => { resolvePassword = resolve; }));
    const view = render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Email & password" }), { button: 0 });
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-secret" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(mock.updatePassword).toHaveBeenCalled());

    mock.userId = "user-2";
    view.rerender(<Profile />);
    expect(await screen.findByLabelText("First name")).toHaveValue("Sam");
    await act(async () => { resolvePassword({ error: null }); });

    expect(mock.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Password updated" }));
  });

  it("requires the current password and sends both passwords to the auth client", async () => {
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Email & password" }), { button: 0 });

    const current = await screen.findByLabelText("Current password");
    const next = screen.getByLabelText("New password");
    const submit = screen.getByRole("button", { name: "Update password" });

    expect(current).toHaveAttribute("type", "password");
    expect(submit).toBeDisabled();
    fireEvent.change(next, { target: { value: "new-password" } });
    expect(submit).toBeDisabled();
    fireEvent.change(current, { target: { value: "old-password" } });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(mock.updatePassword).toHaveBeenCalledWith("new-password", "old-password"));
    await waitFor(() => expect(current).toHaveValue(""));
    expect(next).toHaveValue("");
  });

  it("asks before leaving a portfolio and closes only after a confirmed save", async () => {
    mock.portfolios = [{ id: "portfolio-1", name: "Demo", role: "editor" }];
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Demo");
    expect(mock.deleteMembership).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mock.deleteMembership).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(mock.deleteMembership).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mock.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps the leave confirmation open when the backend rejects the request", async () => {
    mock.portfolios = [{ id: "portfolio-1", name: "Demo", role: "owner" }];
    mock.deleteMembership.mockResolvedValue({ data: null, error: { message: "Cannot remove the last owner" } });
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not leave portfolio", variant: "destructive",
    })));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mock.refresh).not.toHaveBeenCalled();
  });

  it("keeps the confirmation open when the membership request throws", async () => {
    mock.portfolios = [{ id: "portfolio-1", name: "Demo", role: "editor" }];
    mock.deleteMembership.mockRejectedValue(new Error("Network unavailable"));
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not leave portfolio", description: "Network unavailable", variant: "destructive",
    })));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("reports a refresh failure without misreporting a completed departure", async () => {
    mock.portfolios = [{ id: "portfolio-1", name: "Demo", role: "editor" }];
    mock.refresh.mockRejectedValue(new Error("Portfolio list unavailable"));
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Left portfolio" })));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not load this portfolio", description: "Portfolio list unavailable", variant: "destructive",
    })));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows the newly selected default portfolio after leaving the previous one", async () => {
    mock.portfolios = [
      { id: "portfolio-1", name: "First", role: "editor" },
      { id: "portfolio-2", name: "Second", role: "viewer" },
    ];
    mock.profileRead.mockResolvedValueOnce({ data: { default_portfolio_id: "portfolio-1" }, error: null })
      .mockResolvedValueOnce({ data: { default_portfolio_id: "portfolio-2" }, error: null });
    mock.refresh.mockImplementation(async () => {
      mock.portfolios = [{ id: "portfolio-2", name: "Second", role: "viewer" }];
    });
    render(<Profile />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Portfolios" }), { button: 0 });
    await waitFor(() => expect(screen.getByText("Default")).toBeInTheDocument());
    fireEvent.click(within(screen.getByText("First").closest("div.border") as HTMLElement).getByRole("button", { name: "Leave" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(screen.getByText("Second").closest("div.border")).toHaveTextContent("Default"));
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });

  it("shows French profile labels and confirmation in a French session", async () => {
    mock.locale = "fr";
    mock.portfolios = [{ id: "portfolio-1", name: "Démo", role: "viewer" }];
    render(<Profile />);
    expect(await screen.findByRole("heading", { name: "Profil" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Portefeuilles" }), { button: 0 });
    expect(screen.getByText("Lecteur")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Vous perdrez l'accès à ce portefeuille et à ses données.");
  });
});
