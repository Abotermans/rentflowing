import type { TranslationKey } from "@/i18n/translations";

/**
 * Registry of optional application modules that can be hidden from the
 * navigation via the Settings page. Add new entries here to expose more
 * toggles — no other code changes required besides tagging the matching
 * sidebar item with the same `key`.
 */
export interface AppModule {
  /** Stable identifier persisted in user settings. Never rename. */
  key: string;
  /** Translation key for the module label shown in Settings. */
  labelKey: TranslationKey;
  /** Translation key for the module description shown in Settings. */
  descriptionKey: TranslationKey;
}

export const OPTIONAL_MODULES: AppModule[] = [
  {
    key: "maintenance",
    labelKey: "nav.maintenance",
    descriptionKey: "settings.module.maintenanceDesc",
  },
  {
    key: "vendors",
    labelKey: "nav.vendors",
    descriptionKey: "settings.module.vendorsDesc",
  },
];