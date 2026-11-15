import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  toast: vi.fn(),
  signupAvailability: "enabled",
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ signIn: mock.signIn, signUp: mock.signUp }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock("@/hooks/useSignupAvailability", () => ({ useSignupAvailability: () => mock.signupAvailability }));

import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";

function renderAuth(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/accept-invite/:token" element={<div>Invitation returned</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("auth invitation return path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.signupAvailability = "enabled";
    mock.signIn.mockResolvedValue({ error: null });
    mock.signUp.mockResolvedValue({ error: null, session: { access_token: "test" } });
  });

  it("returns to the invitation after sign in", async () => {
    renderAuth("/login?next=%2Faccept-invite%2Ftoken-1");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "invitee@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invitation returned")).toBeInTheDocument();
  });

  it("rejects an external next destination", async () => {
    renderAuth("/login?next=https%3A%2F%2Fevil.example");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "invitee@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("returns to the invitation after sign up when a session is created", async () => {
    renderAuth("/signup?invite=token-1");
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "New" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "invitee@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(mock.signUp).toHaveBeenCalledWith(
      "invitee@example.com", "password123", "New", "User", "/accept-invite/token-1",
    ));
    expect(await screen.findByText("Invitation returned")).toBeInTheDocument();
  });

  it("waits for email confirmation when sign up returns no session", async () => {
    mock.signUp.mockResolvedValue({ error: null, session: null });
    renderAuth("/signup?invite=token-1");
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "New" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "invitee@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in after confirmation" })).toHaveAttribute(
      "href", "/login?next=%2Faccept-invite%2Ftoken-1",
    );
  });

  it("explains when new registrations are disabled without hiding sign in", async () => {
    mock.signUp.mockResolvedValue({
      error: Object.assign(new Error("Signups not allowed for this instance"), { code: "signup_disabled" }),
      session: null,
    });
    renderAuth("/signup?invite=token-1");
    expect(screen.getByText("Create an account to accept your invitation")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "New" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "invitee@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Registration is temporarily closed",
      description: "New accounts cannot be created right now. Existing users can still sign in.",
    })));
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href", "/login?next=%2Faccept-invite%2Ftoken-1",
    );
  });

  it("hides unavailable registration before collecting personal details", () => {
    mock.signupAvailability = "disabled";
    renderAuth("/signup?invite=token-1");
    expect(screen.getByText("Registration is temporarily closed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href", "/login?next=%2Faccept-invite%2Ftoken-1",
    );
    expect(mock.signUp).not.toHaveBeenCalled();
  });

  it("does not offer account creation from sign-in when registration is disabled", () => {
    mock.signupAvailability = "disabled";
    renderAuth("/login");
    expect(screen.queryByRole("link", { name: "Create one" })).not.toBeInTheDocument();
  });
});
