export const SUPPORTED_CURRENCIES = ["EUR", "GBP", "CHF", "SEK", "DKK", "NOK", "PLN", "CZK"];

export function receiptCurrencyChoices(properties: readonly { currencyCode: string }[]) {
  const configured = [...new Set(properties.map(property => property.currencyCode).filter(Boolean))];
  return {
    options: [...new Set([...SUPPORTED_CURRENCIES, ...configured])].sort(),
    defaultCurrency: configured.length === 1 ? configured[0] : "",
  };
}
