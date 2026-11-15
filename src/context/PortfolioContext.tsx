import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Portfolio {
  id: string;
  name: string;
  default_currency: string;
  default_locale: string;
  receivable_lead_days: number;
  show_occupancy_operations: boolean;
  role: "owner" | "admin" | "editor" | "viewer";
}

interface PortfolioContextValue {
  portfolios: Portfolio[];
  currentPortfolioId: string | null;
  currentPortfolio: Portfolio | null;
  loading: boolean;
  error: string | null;
  switchPortfolio: (id: string) => void;
  refresh: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | undefined>(undefined);
const LS_KEY = "currentPortfolioId";

function storedPortfolioId(userId: string): string | null {
  try {
    return localStorage.getItem(`${LS_KEY}:${userId}`);
  } catch {
    return null;
  }
}

function rememberPortfolioId(userId: string, portfolioId: string): void {
  try {
    localStorage.setItem(`${LS_KEY}:${userId}`, portfolioId);
  } catch {
    // The current session can still use the selected portfolio.
  }
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadId = useRef(0);
  const activeUserId = useRef(userId);
  activeUserId.current = userId;

  const load = useCallback(async () => {
    if (userId !== activeUserId.current) {
      throw new Error("Portfolio load was superseded by an account change.");
    }
    const requestId = ++loadId.current;
    if (!userId) {
      setPortfolios([]);
      setCurrentPortfolioId(null);
      setLoadedUserId(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let list: Portfolio[];
    try {
      const response = await supabase
        .from("portfolio_members")
        .select("role, portfolios:portfolio_id(*)")
        .eq("user_id", userId);
      if (response.error || !response.data) throw new Error(response.error?.message ?? "Portfolio list unavailable");
      list = response.data
        .map((row) => row.portfolios ? {
          id: row.portfolios.id,
          name: row.portfolios.name,
          default_currency: row.portfolios.default_currency,
          default_locale: row.portfolios.default_locale,
          receivable_lead_days: row.portfolios.receivable_lead_days ?? 15,
          show_occupancy_operations: !!row.portfolios.show_occupancy_operations,
          role: row.role,
        } : null)
        .filter(Boolean) as Portfolio[];
    } catch (loadError) {
      if (requestId !== loadId.current || userId !== activeUserId.current) {
        throw new Error("Portfolio load was superseded by an account change.");
      }
      setPortfolios([]);
      setCurrentPortfolioId(null);
      setLoadedUserId(userId);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
      throw loadError;
    }
    if (requestId !== loadId.current || userId !== activeUserId.current) {
      throw new Error("Portfolio load was superseded by an account change.");
    }
    const stored = storedPortfolioId(userId);
    const recentPortfolioId = stored && list.some((p) => p.id === stored) ? stored : null;
    let preferredPortfolioId: string | null = null;
    if (!recentPortfolioId && list.length > 1) {
      try {
        const { data, error: profileError } = await supabase.from("profiles")
          .select("default_portfolio_id").eq("id", userId).maybeSingle();
        if (!profileError) preferredPortfolioId = data?.default_portfolio_id ?? null;
      } catch {
        // The first accessible portfolio remains usable.
      }
    }
    if (requestId !== loadId.current || userId !== activeUserId.current) {
      throw new Error("Portfolio load was superseded by an account change.");
    }
    setPortfolios(list);

    const valid = recentPortfolioId
      ?? (preferredPortfolioId && list.some((p) => p.id === preferredPortfolioId) ? preferredPortfolioId : null)
      ?? list[0]?.id ?? null;
    setCurrentPortfolioId(valid);
    setLoadedUserId(userId);
    if (valid) rememberPortfolioId(userId, valid);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load().catch(() => {});
    return () => { loadId.current += 1; };
  }, [load]);

  const switchPortfolio = (id: string) => {
    if (!userId || loadedUserId !== userId || activeUserId.current !== userId
      || !portfolios.some((portfolio) => portfolio.id === id)) return;
    setCurrentPortfolioId(id);
    rememberPortfolioId(userId, id);
  };

  const visiblePortfolios = loadedUserId === userId ? portfolios : [];
  const visiblePortfolioId = loadedUserId === userId ? currentPortfolioId : null;
  const currentPortfolio = visiblePortfolios.find((p) => p.id === visiblePortfolioId) ?? null;

  return (
    <PortfolioContext.Provider value={{ portfolios: visiblePortfolios, currentPortfolioId: visiblePortfolioId, currentPortfolio, loading: loading || loadedUserId !== userId, error: loadedUserId === userId ? error : null, switchPortfolio, refresh: load }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
