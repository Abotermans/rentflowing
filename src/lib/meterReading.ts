export function normalizeMeterReading(input: string): string | null | undefined {
  const compact = input.replace(/\s/g, "");
  if (!compact) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(compact)) return undefined;
  return compact.replace(",", ".");
}
