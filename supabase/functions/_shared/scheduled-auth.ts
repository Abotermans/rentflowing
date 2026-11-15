import { authenticateCronRequest } from "./cron-auth.ts";

export function authenticateScheduledRequest(request: Request): Response | null {
  const current = Deno.env.get("LOVABLE_CRON_SECRET");
  const previous = Deno.env.get("LOVABLE_CRON_SECRET_PREVIOUS");
  if (!current || current.length < 32 || (previous && previous.length < 32)) {
    return new Response("Scheduled authentication is not configured securely", { status: 503 });
  }
  return authenticateCronRequest(request);
}
