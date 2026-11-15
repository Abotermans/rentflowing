import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Locale, TranslationKey, getTranslation } from "@/i18n/translations";
import { usePortfolio } from "@/context/PortfolioContext";

interface SettingsState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  /** Portfolio-wide days before a cycle opens. */
  receivableLeadDays: number;
  /** Set of module keys hidden from navigation. See src/config/modules.ts. */
  hiddenModules: ReadonlySet<string>;
  isModuleHidden: (key: string) => boolean;
  setModuleHidden: (key: string, hidden: boolean) => void;
}

const SettingsContext = createContext<SettingsState | null>(null);

function readSetting(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeSetting(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { return; }
}

function getInitialLocale(): Locale {
  const stored = readSetting("app-locale");
  if (stored === "fr" || stored === "en") return stored;
  return "en";
}

const HIDDEN_MODULES_KEY = "app-hidden-modules";
function getInitialHiddenModules(): Set<string> {
  try {
    const stored = readSetting(HIDDEN_MODULES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return new Set(parsed.filter((k): k is string => typeof k === "string"));
    }
  } catch { return new Set(); }
  return new Set();
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { currentPortfolio } = usePortfolio();
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const receivableLeadDays = currentPortfolio?.receivable_lead_days ?? 15;
  const [hiddenModules, setHiddenModulesState] = useState<Set<string>>(getInitialHiddenModules);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    writeSetting("app-locale", l);
  }, []);

  const setModuleHidden = useCallback((key: string, hidden: boolean) => {
    setHiddenModulesState((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(key); else next.delete(key);
      writeSetting(HIDDEN_MODULES_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isModuleHidden = useCallback((key: string) => hiddenModules.has(key), [hiddenModules]);

  const t = useCallback((key: TranslationKey) => getTranslation(locale, key), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t, receivableLeadDays, hiddenModules, isModuleHidden, setModuleHidden }),
    [locale, setLocale, t, receivableLeadDays, hiddenModules, isModuleHidden, setModuleHidden],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
