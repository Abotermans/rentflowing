import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { safeReturnPath } from "@/lib/safeReturnPath";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, firstName: string, lastName: string, returnPath?: string) => Promise<{ error: Error | null; session: Session | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string, currentPassword?: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const RECOVERY_KEY = "auth-password-recovery";
const RECOVERY_LIFETIME_MS = 60 * 60 * 1000;

function recoveryAllowed(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    const value = JSON.parse(sessionStorage.getItem(RECOVERY_KEY) ?? "null") as {
      userId?: string;
      expiresAt?: number;
    } | null;
    return value?.userId === userId && typeof value.expiresAt === "number" && value.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function clearRecovery(): void {
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // The in-memory recovery event remains usable when storage is unavailable.
  }
}

function rememberRecovery(userId: string): void {
  try {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({
      userId,
      expiresAt: Date.now() + RECOVERY_LIFETIME_MS,
    }));
  } catch {
    // The current page can still complete recovery without session storage.
  }
}

function authRequestError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Authentication request failed. Please try again.");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;
    let receivedAuthEvent = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      receivedAuthEvent = true;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (event === "PASSWORD_RECOVERY" && newSession?.user) {
        rememberRecovery(newSession.user.id);
        setPasswordRecovery(true);
      } else if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        clearRecovery();
        setPasswordRecovery(false);
      } else {
        setPasswordRecovery(recoveryAllowed(newSession?.user.id));
      }
      setLoading(false);
    });
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted || receivedAuthEvent) return;
        const currentSession = error ? null : data.session;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setPasswordRecovery(recoveryAllowed(currentSession?.user.id));
        setLoading(false);
      })
      .catch(() => {
        if (mounted && !receivedAuthEvent) setLoading(false);
      });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    } catch (error) {
      return { error: authRequestError(error) };
    }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string, returnPath?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${safeReturnPath(returnPath)}`,
          data: { first_name: firstName, last_name: lastName },
        },
      });
      return { error, session: data.session };
    } catch (error) {
      return { error: authRequestError(error), session: null };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (!error) {
        clearRecovery();
        setPasswordRecovery(false);
      }
      return { error };
    } catch (error) {
      return { error: authRequestError(error) };
    }
  };

  const resetPasswordForEmail = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error };
    } catch (error) {
      return { error: authRequestError(error) };
    }
  };

  const updatePassword = async (password: string, currentPassword?: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password,
        ...(currentPassword ? { current_password: currentPassword } : {}),
      });
      if (!error && !currentPassword) {
        clearRecovery();
        setPasswordRecovery(false);
      }
      return { error };
    } catch (error) {
      return { error: authRequestError(error) };
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, passwordRecovery, signIn, signUp, signOut, resetPasswordForEmail, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
