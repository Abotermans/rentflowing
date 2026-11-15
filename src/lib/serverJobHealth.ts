export const MAX_SCHEDULED_JOB_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isRecentScheduledJobSuccess(
  lastSucceededAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastSucceededAt) return false;
  const succeededMs = Date.parse(lastSucceededAt);
  if (!Number.isFinite(succeededMs)) return false;
  const ageMs = nowMs - succeededMs;
  return ageMs >= -MAX_CLOCK_SKEW_MS && ageMs <= MAX_SCHEDULED_JOB_AGE_MS;
}
