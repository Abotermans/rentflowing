import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  signOut: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { email: "manager@example.com" }, signOut: mock.signOut }),
}));
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ t: (key: string) => ({
    "userMenu.account": "Account menu",
    "userMenu.signedIn": "Signed in",
    "userMenu.profile": "Profile",
    "userMenu.portfolioSettings": "Portfolio settings",
    "userMenu.appSettings": "App settings",
    "userMenu.signOut": "Sign out",
    "userMenu.signOutFailed": "Could not sign out",
  })[key] ?? key }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));

import { UserMenu } from "@/components/layout/UserMenu";

function renderMenu() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<><UserMenu /><div>Workspace</div></>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Account menu" }), { key: "Enter" });
}

describe("account menu sign out", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the workspace open and explains a failed sign out", async () => {
    mock.signOut.mockResolvedValue({ error: new Error("offline") });
    renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith({
      title: "Could not sign out",
      description: "offline",
      variant: "destructive",
    }));
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("navigates only after sign out succeeds", async () => {
    mock.signOut.mockResolvedValue({ error: null });
    renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });
});
