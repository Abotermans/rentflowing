import { describe, expect, it } from "vitest";
import { sumMoneyByCurrency, formatMoneyGroups, prorateMoney, roundMoney, distributeMoneyByWeights } from "@/lib/money";

describe("decimal money rounding", () => {
  it("rounds half cents consistently for positive and negative amounts", () => {
    expect(roundMoney(0.145)).toBe(0.15);
    expect(roundMoney(-0.145)).toBe(-0.15);
    expect(prorateMoney(0.29, 50, 100)).toBe(0.15);
    expect(prorateMoney(-0.29, 50, 100)).toBe(-0.15);
    expect(distributeMoneyByWeights(0.145, [1])).toEqual([0.15]);
  });
});

describe("sumMoneyByCurrency", () => {
  it("rounds the currency total once, independent of item boundaries", () => {
    const split = sumMoneyByCurrency([
      { amount: 0.005, currencyCode: "EUR" },
      { amount: 0.005, currencyCode: "EUR" },
    ]);
    const combined = sumMoneyByCurrency([{ amount: 0.01, currencyCode: "EUR" }]);

    expect(split).toEqual(combined);
  });

  it("keeps a half-cent boundary exact after offsetting amounts", () => {
    expect(sumMoneyByCurrency([
      { amount: 0.005, currencyCode: "EUR" },
      { amount: 0.01, currencyCode: "EUR" },
      { amount: -0.01, currencyCode: "EUR" },
    ])).toEqual([{ currencyCode: "EUR", locale: undefined, amount: 0.01 }]);
  });

  it("keeps lease receivable totals separate by currency", () => {
    const groups = sumMoneyByCurrency([
      { amount: 100, currencyCode: "GBP", locale: "en-GB" },
      { amount: 50, currencyCode: "EUR", locale: "en-GB" },
      { amount: 25, currencyCode: "GBP", locale: "en-GB" },
    ]);
    expect(groups.map(({ currencyCode, amount }) => ({ currencyCode, amount }))).toEqual([
      { currencyCode: "EUR", amount: 50 },
      { currencyCode: "GBP", amount: 125 },
    ]);
    expect(formatMoneyGroups(groups)).toContain("+");
  });
});
