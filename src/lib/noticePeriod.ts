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