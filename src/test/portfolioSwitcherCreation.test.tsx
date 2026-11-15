import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTranslation } from "@/i18n/translations";
import type { Locale, TranslationKey } from "@/i18n/translations";

const mock = vi.hoisted(() => ({
  create: vi.fn(), refresh: vi.fn(), switchPortfolio: vi.fn(), toast: vi.fn(), locale: "en" as Locale,
}));
vi.mock("@/lib/repo/portfolioCreation", () => ({ createPortfolioConfirmed: mock.create }));
vi.mock("@/context/PortfolioContext", () => ({
  usePortfolio: () => ({
    portfolios: [], currentPortfolio: null, loading: false,
    refresh: mock.refresh, switchPortfolio: mock.switchPortfolio,
  }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ t: (key: TranslationKey) => getTranslation(mock.locale, key) }),
}));

import { PortfolioSwitcher } from "@/components/layout/PortfolioSwitcher";

describe("portfolio switcher creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.locale = "en";
    mock.refresh.mockResolvedValue(undefined);
  });

  async function openCreateDialog() {
    fireEvent.click(screen.getByRole("button", { name: "No portfolio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create new portfolio" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Example" } });
  }

  it("reuses the same portfolio ID after an uncertain response", async () => {
    mock.create.mockRejectedValueOnce(new Error("Save outcome unknown")).mockResolvedValueOnce("created-id");
    render(<PortfolioSwitcher />);
    await openCreateDialog();
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not confirm portfolio creation", variant: "destructive",
    })));
    expect(screen.getByLabelText("Name")).toHaveValue("Example");

    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() => expect(mock.switchPortfolio).toHaveBeenCalledTimes(1));
    const first = mock.create.mock.calls[0][0] as { id: string; name: string; created_by: string };
    const second = mock.create.mock.calls[1][0] as typeof first;
    expect(second).toEqual(first);
    expect(first).toMatchObject({ name: "Example", created_by: "user-1" });
    expect(mock.switchPortfolio).toHaveBeenCalledWith(first.id);
  });

  it("does not tell the user to retry creation when only list refresh failed", async () => {
    mock.create.mockResolvedValue("created-id");
    mock.refresh.mockRejectedValue(new Error("List unavailable"));
    render(<PortfolioSwitcher />);
    await openCreateDialog();
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Portfolio created, but the list could not refresh",
      description: "List unavailable",
    })));
    expect(mock.switchPortfolio).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("labels the creation dialog and error in French", async () => {
    mock.locale = "fr";
    mock.create.mockRejectedValue(new Error("Service indisponible"));
    render(<PortfolioSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Aucun portefeuille" }));
    fireEvent.click(await screen.findByRole("button", { name: "Créer un portefeuille" }));
    expect(screen.getByText("Créer un portefeuille", { selector: "h2" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Exemple" } });
    fireEvent.click(screen.getByRole("button", { name: /^Créer$/ }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Impossible de confirmer la création du portefeuille",
      description: "Service indisponible",
      variant: "destructive",
    })));
  });
});
