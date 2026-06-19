import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Portfolio {
  id: string;
  name: string;
  default_currency: string;
  default_locale: string;
  show_occupancy_operations: boolean;
  role: "owner" | "admin" | "editor" | "viewer";
}

interface PortfolioContextValue {
  portfolios: Portfolio[];
  currentPortfolioId: string | null;
  currentPortfolio: Portfolio | null;
  loading: boolean;
  switchPortfolio: (id: string) => void;
  refresh: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | undefined>(undefined);
const LS_KEY = "currentPortfolioId";

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setPortfolios([]);
      setCurrentPortfolioId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("portfolio_members")
      .select("role, portfolios:portfolio_id(id, name, default_currency, default_locale, show_occupancy_operations)")
      .eq("user_id", user.id);

    if (error || !data) {
      setPortfolios([]);
      setLoading(false);
      return;
    }
    const list: Portfolio[] = data
      .map((row: any) => row.portfolios ? {
        id: row.portfolios.id,
        name: row.portfolios.name,
        default_currency: row.portfolios.default_currency,
        default_locale: row.portfolios.default_locale,
        show_occupancy_operations: !!row.portfolios.show_occupancy_operations,
        role: row.role,
      } : null)
      .filter(Boolean) as Portfolio[];
    setPortfolios(list);

    const stored = localStorage.getItem(`${LS_KEY}:${user.id}`);
    const valid = stored && list.some((p) => p.id === stored) ? stored : list[0]?.id ?? null;
    setCurrentPortfolioId(valid);
    if (valid) localStorage.setItem(`${LS_KEY}:${user.id}`, valid);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const switchPortfolio = (id: string) => {
    if (!user) return;
    setCurrentPortfolioId(id);
    localStorage.setItem(`${LS_KEY}:${user.id}`, id);
  };

  const currentPortfolio = portfolios.find((p) => p.id === currentPortfolioId) ?? null;

  return (
    <PortfolioContext.Provider value={{ portfolios, currentPortfolioId, currentPortfolio, loading, switchPortfolio, refresh: load }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}