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

export function nonNegativeNumber(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return true;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export function normalizedCode(value: string): string {
  return value.trim().toLowerCase();
}

