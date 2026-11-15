import { describe, expect, it } from "vitest";
import { getTranslation, type TranslationKey } from "@/i18n/translations";

const keys: TranslationKey[] = [
  "leaseDetail.rentIndexation",
  "leaseIndexation.leaseHelp",
  "leaseIndexation.amendmentHelp",
  "leaseIndexation.baseDate",
  "leaseIndexation.baseIndex",
  "leaseIndexation.currentIndex",
  "leaseIndexation.cap",
  "leaseIndexation.rounding",
  "leaseIndexation.nearestCent",
  "leaseIndexation.nearestEuro",
  "leaseIndexation.noMonthlyRounding",
  "leaseIndexation.regulatoryNotes",
];

describe("indexation form translations", () => {
  it("provides distinct English and French copy for both form contexts", () => {
    for (const key of keys) {
      const en = getTranslation("en", key);
      const fr = getTranslation("fr", key);
      expect(en).not.toBe(key);
      expect(fr).not.toBe(key);
      expect(fr).not.toBe(en);
    }
  });

  it("explains that local legal requirements need independent verification", () => {
    expect(getTranslation("en", "leaseIndexation.leaseHelp")).toContain("does not verify");
    expect(getTranslation("fr", "leaseIndexation.leaseHelp")).toContain("ne vérifie pas");
    expect(getTranslation("en", "leaseIndexation.amendmentHelp")).toContain("before billing");
    expect(getTranslation("fr", "leaseIndexation.amendmentHelp")).toContain("avant de facturer");
  });
});
