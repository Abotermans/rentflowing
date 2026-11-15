export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function required(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

export function positiveNumber(value: number | string | null | undefined): boolean {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function positiveMoneyCents(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const rawCents = value * 100;
  const cents = Math.round(rawCents);
  return Number.isSafeInteger(cents) && value === cents / 100 ? cents : null;
}

export function parseNonNegativeMoney(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && amount === cents / 100 ? cents / 100 : null;
}

export function parsePositiveMoney(value: string): number | null {
  const amount = parseNonNegativeMoney(value);
  return amount !== null && amount > 0 ? amount : null;
}

export function positiveMoneyIssue(value: string): "required" | "positive" | "invalid" | null {
  if (!value.trim()) return "required";
  const numeric = Number(value.trim().replace(",", "."));
  if (Number.isFinite(numeric) && numeric <= 0) return "positive";
  return parsePositiveMoney(value) === null ? "invalid" : null;
}

export function nonNegativeNumber(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return true;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export function normalizedCode(value: string): string {
  return value.trim().toLowerCase();
}

