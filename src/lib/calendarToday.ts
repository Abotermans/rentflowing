/** Calendar dates for business rules must not change at UTC midnight. */
export function calendarDateISO(date: Date, timeZone?: string): string {
  if (!timeZone) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function localTodayISO(): string {
  return calendarDateISO(new Date());
}

export function addCalendarDaysISO(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function calendarDaysBetweenISO(start: string, end: string): number {
  const startParts = start.split("-").map(Number);
  const endParts = end.split("-").map(Number);
  const startTime = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const endTime = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
  return Math.round((endTime - startTime) / 86_400_000);
}
