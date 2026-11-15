import { describe, expect, it } from "vitest";
import { receiptCurrencyChoices } from "@/lib/currencies";

describe("receipt currency choices", () => {
  it("defaults to the sole configured property currency", () => {
    const result = receiptCurrencyChoices([{ currencyCode: "GBP" }, { currencyCode: "GBP" }]);
    expect(result.defaultCurrency).toBe("GBP");
    expect(result.options).toContain("EUR");
    expect(result.options).toContain("GBP");
  });

  it("requires a choice for mixed or empty portfolios and preserves legacy currencies", () => {
    expect(receiptCurrencyChoices([{ currencyCode: "EUR" }, { currencyCode: "GBP" }]).defaultCurrency).toBe("");
    expect(receiptCurrencyChoices([]).defaultCurrency).toBe("");
    expect(receiptCurrencyChoices([{ currencyCode: "USD" }]).options).toContain("USD");
  });
});
