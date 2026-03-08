import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Locale, TranslationKey, getTranslation } from "@/i18n/translations";

interface SettingsState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const SettingsContext = createContext<SettingsState | null>(null);

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem("app-locale");
    if (stored === "fr" || stored === "en") return stored;
  } catch {}
  return "en";
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem("app-locale", l); } catch {}
  }, []);

  const t = useCallback((key: TranslationKey) => getTranslation(locale, key), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
