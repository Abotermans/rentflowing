function equalSecret(actual: string, expected: string): boolean {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function hasScheduledJobSecret(request: Request, expected: string | undefined): boolean {
  return isConfiguredScheduledJobSecret(expected)
    && equalSecret(request.headers.get("X-Cron-Secret") ?? "", expected);
}

export function isConfiguredScheduledJobSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}
