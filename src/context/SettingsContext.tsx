import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Locale, TranslationKey, getTranslation } from "@/i18n/translations";

interface SettingsState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  /** Number of days before a receivable's due date the receivable opens. */
  receivableLeadDays: number;
  setReceivableLeadDays: (days: number) => void;
  /** Set of module keys hidden from navigation. See src/config/modules.ts. */
  hiddenModules: ReadonlySet<string>;
  isModuleHidden: (key: string) => boolean;
  setModuleHidden: (key: string, hidden: boolean) => void;
}

const SettingsContext = createContext<SettingsState | null>(null);

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem("app-locale");
    if (stored === "fr" || stored === "en") return stored;
  } catch {}
  return "en";
}

function getInitialLeadDays(): number {
  try {
    const stored = localStorage.getItem("app-receivable-lead-days");
    if (stored != null) {
      const n = Number(stored);
      if (Number.isFinite(n) && n >= 0 && n <= 120) return Math.floor(n);
    }
  } catch {}
  return 15;
}

const HIDDEN_MODULES_KEY = "app-hidden-modules";
function getInitialHiddenModules(): Set<string> {
  try {
    const stored = localStorage.getItem(HIDDEN_MODULES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return new Set(parsed.filter((k): k is string => typeof k === "string"));
    }
  } catch {}
  return new Set();
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [receivableLeadDays, setReceivableLeadDaysState] = useState<number>(getInitialLeadDays);
  const [hiddenModules, setHiddenModulesState] = useState<Set<string>>(getInitialHiddenModules);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem("app-locale", l); } catch {}
  }, []);

  const setReceivableLeadDays = useCallback((days: number) => {
    const clamped = Math.min(120, Math.max(0, Math.floor(days)));
    setReceivableLeadDaysState(clamped);
    try { localStorage.setItem("app-receivable-lead-days", String(clamped)); } catch {}
  }, []);

  const setModuleHidden = useCallback((key: string, hidden: boolean) => {
    setHiddenModulesState((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(key); else next.delete(key);
      try { localStorage.setItem(HIDDEN_MODULES_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const isModuleHidden = useCallback((key: string) => hiddenModules.has(key), [hiddenModules]);

  const t = useCallback((key: TranslationKey) => getTranslation(locale, key), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t, receivableLeadDays, setReceivableLeadDays, hiddenModules, isModuleHidden, setModuleHidden }),
    [locale, setLocale, t, receivableLeadDays, setReceivableLeadDays, hiddenModules, isModuleHidden, setModuleHidden],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
