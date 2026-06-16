import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Locale, TranslationKey, getTranslation } from "@/i18n/translations";

interface SettingsState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  /** Number of days before a receivable's due date the receivable opens. */
  receivableLeadDays: number;
  setReceivableLeadDays: (days: number) => void;
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

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [receivableLeadDays, setReceivableLeadDaysState] = useState<number>(getInitialLeadDays);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem("app-locale", l); } catch {}
  }, []);

  const setReceivableLeadDays = useCallback((days: number) => {
    const clamped = Math.min(120, Math.max(0, Math.floor(days)));
    setReceivableLeadDaysState(clamped);
    try { localStorage.setItem("app-receivable-lead-days", String(clamped)); } catch {}
  }, []);

  const t = useCallback((key: TranslationKey) => getTranslation(locale, key), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t, receivableLeadDays, setReceivableLeadDays }),
    [locale, setLocale, t, receivableLeadDays, setReceivableLeadDays],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
