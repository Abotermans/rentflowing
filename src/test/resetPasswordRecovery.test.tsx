import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  passwordRecovery: false,
  updatePassword: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    loading: false,
    passwordRecovery: mock.passwordRecovery,
    updatePassword: mock.updatePassword,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));

import ResetPassword from "@/pages/auth/ResetPassword";

describe("password recovery screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.passwordRecovery = false;
    mock.updatePassword.mockResolvedValue({ error: null });
  });

  it("does not accept a password change from a direct route visit", () => {
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    expect(screen.getByText("Recovery link required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(mock.updatePassword).not.toHaveBeenCalled();
  });

  it("accepts the new password after a recovery event", async () => {
    mock.passwordRecovery = true;
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(mock.updatePassword).toHaveBeenCalledWith("a-new-password"));
  });
});
