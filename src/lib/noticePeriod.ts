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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const n = typeof value === "number" ? value : parseInt(value, 10);
  if (!Number.isSafeInteger(n) || n <= 0) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.toISOString().slice(0, 10) !== isoDate) return "";
  if (unit === "days" || unit === "weeks") {
    d.setUTCDate(d.getUTCDate() + n * (unit === "weeks" ? 7 : 1));
  } else if (unit === "months" || unit === "years") {
    const targetMonth = month - 1 + n * (unit === "years" ? 12 : 1);
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(targetMonth);
    d.setUTCDate(Math.min(day, lastDay));
  } else {
    return "";
  }
  return d.toISOString().slice(0, 10);
}
