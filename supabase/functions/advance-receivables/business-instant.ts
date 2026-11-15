// @deno-types="../_shared/server-jobs.d.ts"
import { parseScheduledBusinessInstant } from "../_shared/server-jobs.js";

export function resolveBusinessInstant(body: unknown, now: Date): Date {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("A JSON object is required");
  }
  // Managed schedules send a static body; capture the server clock once per run.
  return "businessInstant" in body
    ? parseScheduledBusinessInstant(body.businessInstant, now)
    : new Date(now.getTime());
}
