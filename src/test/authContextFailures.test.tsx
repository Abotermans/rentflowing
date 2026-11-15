import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/context/AuthContext";

const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: mock },
}));

describe("auth request failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mock.unsubscribe } } });
  });

  it("leaves the loading screen when initial session lookup rejects", async () => {
    mock.getSession.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("does not restore a stale session after a newer auth event", async () => {
    let resolveSession: (value: unknown) => void = () => {};
    let sendAuthEvent: (event: string, session: null) => void = () => {};
    mock.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    mock.onAuthStateChange.mockImplementation((callback) => {
      sendAuthEvent = callback;
      return { data: { subscription: { unsubscribe: mock.unsubscribe } } };
    });
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });

    act(() => sendAuthEvent("SIGNED_OUT", null));
    await act(async () => {
      resolveSession({ data: { session: { user: { id: "stale" } } }, error: null });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("returns rejected auth requests as errors the forms can display", async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mock.signInWithPassword.mockRejectedValue(new Error("offline"));
    mock.signUp.mockRejectedValue("offline");
    mock.resetPasswordForEmail.mockRejectedValue(new Error("mail offline"));
    mock.updateUser.mockRejectedValue(new Error("save offline"));
    mock.signOut.mockRejectedValue(new Error("sign out offline"));

    expect((await result.current.signIn("a@example.com", "password")).error?.message).toBe("offline");
    expect(await result.current.signUp("a@example.com", "password", "A", "B")).toMatchObject({
      error: new Error("Authentication request failed. Please try again."),
      session: null,
    });
    expect((await result.current.resetPasswordForEmail("a@example.com")).error?.message).toBe("mail offline");
    expect((await result.current.updatePassword("password")).error?.message).toBe("save offline");
    expect((await result.current.signOut()).error?.message).toBe("sign out offline");
  });

  it("sends the current password for an in-session change but not for a recovery reset", async () => {
    mock.updateUser.mockResolvedValue({ error: null });
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect((await result.current.updatePassword("new-password", "old-password")).error).toBeNull();
    expect(mock.updateUser).toHaveBeenLastCalledWith({
      password: "new-password", current_password: "old-password",
    });

    await act(async () => {
      expect((await result.current.updatePassword("reset-password")).error).toBeNull();
    });
    expect(mock.updateUser).toHaveBeenLastCalledWith({ password: "reset-password" });
  });

  it("retains only a genuine recovery event across refresh and clears it on sign-in", async () => {
    const recoverySession = { user: { id: "recovering-user" } };
    let sendAuthEvent: (event: string, session: typeof recoverySession) => void = () => {};
    mock.onAuthStateChange.mockImplementation((callback) => {
      sendAuthEvent = callback;
      return { data: { subscription: { unsubscribe: mock.unsubscribe } } };
    });
    const first = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.passwordRecovery).toBe(false);

    act(() => sendAuthEvent("PASSWORD_RECOVERY", recoverySession));
    expect(first.result.current.passwordRecovery).toBe(true);
    first.unmount();

    mock.getSession.mockResolvedValue({ data: { session: recoverySession }, error: null });
    const second = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.passwordRecovery).toBe(true);
    act(() => sendAuthEvent("SIGNED_IN", recoverySession));
    expect(second.result.current.passwordRecovery).toBe(false);
    expect(sessionStorage.getItem("auth-password-recovery")).toBeNull();
  });

  it("clears recovery mode after a successful reset", async () => {
    const recoverySession = { user: { id: "recovering-user" } };
    let sendAuthEvent: (event: string, session: typeof recoverySession) => void = () => {};
    mock.onAuthStateChange.mockImplementation((callback) => {
      sendAuthEvent = callback;
      return { data: { subscription: { unsubscribe: mock.unsubscribe } } };
    });
    mock.updateUser.mockResolvedValue({ error: null });
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    act(() => sendAuthEvent("PASSWORD_RECOVERY", recoverySession));

    await act(async () => {
      expect((await result.current.updatePassword("new-password")).error).toBeNull();
    });
    expect(result.current.passwordRecovery).toBe(false);
    expect(sessionStorage.getItem("auth-password-recovery")).toBeNull();
  });
});
