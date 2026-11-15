export type SignupAvailability = "enabled" | "disabled" | "unknown";

export async function readSignupAvailability(
  backendUrl: string,
  publishableKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SignupAvailability> {
  if (!backendUrl || !publishableKey) return "unknown";
  try {
    const url = new URL("/auth/v1/settings", backendUrl);
    const response = await fetchImpl(url, {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "unknown";
    const settings: unknown = await response.json();
    if (typeof settings !== "object" || settings === null) return "unknown";
    const state = settings as { disable_signup?: unknown; external?: { email?: unknown } };
    if (state.disable_signup === true || state.external?.email === false) return "disabled";
    if (state.disable_signup === false && state.external?.email === true) return "enabled";
  } catch {
    // Leave the form available when the settings endpoint cannot be reached.
  }
  return "unknown";
}
