const MAX_DISPATCH_SKEW_MS = 15 * 60 * 1000;

export function parseScheduledBusinessInstant(value: unknown, now: Date = new Date()): Date {
  if (typeof value !== "string") throw new Error("UTC businessInstant required");
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) throw new Error("UTC businessInstant required");
  const instant = new Date(value);
  const canonical = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== canonical) {
    throw new Error("Invalid businessInstant");
  }
  if (Math.abs(now.getTime() - instant.getTime()) > MAX_DISPATCH_SKEW_MS) {
    throw new Error("businessInstant must be within 15 minutes of server time");
  }
  return instant;
}
