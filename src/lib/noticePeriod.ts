export type NoticeUnit = "days" | "weeks" | "months" | "years";

export function parseNoticeText(text: string): { value: string; unit: NoticeUnit } {
  if (!text) return { value: "", unit: "months" };
  const m = text.match(/(\d+)\s*(day|week|month|year|jour|semaine|mois|année|annee|an)s?\b/i);
  if (!m) return { value: "", unit: "months" };
  const n = m[1];
  const u = m[2].toLowerCase();
  let unit: NoticeUnit = "months";
  if (u.startsWith("day") || u.startsWith("jour")) unit = "days";
  else if (u.startsWith("week") || u.startsWith("semaine")) unit = "weeks";
  else if (u.startsWith("year") || u.startsWith("an")) unit = "years";
  else unit = "months";
  return { value: n, unit };
}

export function serializeNotice(value: string, unit: NoticeUnit): string {
  if (!value) return "";
  return `${value} ${unit}`;
}

/**
 * Add a notice period (value + unit) to an ISO date string (YYYY-MM-DD).
 * Returns "" when the inputs are invalid so callers can fall back gracefully.
 */
export function addNoticePeriod(isoDate: string, value: string | number, unit: NoticeUnit): string {
  if (!isoDate) return "";
  const n = typeof value === "number" ? value : parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  if (unit === "days") d.setDate(d.getDate() + n);
  else if (unit === "weeks") d.setDate(d.getDate() + n * 7);
  else if (unit === "months") d.setMonth(d.getMonth() + n);
  else if (unit === "years") d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}