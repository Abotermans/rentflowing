import { pathToFileURL } from "node:url";

export async function checkAuthSettings(backendUrl, publishableKey, fetchImpl = fetch) {
  const backend = new URL(backendUrl);
  if (backend.protocol !== "https:" || backend.origin !== backendUrl.replace(/\/$/, "")
    || !/^[a-z0-9]{20}\.supabase\.co$/.test(backend.hostname)) {
    throw new Error("Backend URL must be a hosted Supabase HTTPS origin");
  }
  if (!publishableKey?.trim()) {
    throw new Error("A Supabase publishable key is required for the Auth settings check");
  }

  const response = await fetchImpl(`${backend.origin}/auth/v1/settings`, {
    method: "GET",
    headers: { apikey: publishableKey },
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(`Cannot read Supabase Auth settings: HTTP ${response.status}`);
  }
  const settings = await response.json();
  if (typeof settings !== "object" || settings === null || typeof settings.mailer_autoconfirm !== "boolean") {
    throw new Error("Supabase Auth settings omitted mailer_autoconfirm");
  }
  if (settings.mailer_autoconfirm) {
    throw new Error("Supabase Auth automatically confirms email addresses; disable it before release");
  }
  if (settings.disable_signup !== false) {
    throw new Error("Supabase Auth signup is disabled or its setting is unavailable");
  }
  if (settings.external?.email !== true) {
    throw new Error("Supabase Auth email sign-in is disabled or its setting is unavailable");
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backendUrl = process.argv[2];
  if (!backendUrl) {
    console.error("Usage: npm run check:auth-settings -- <supabase-https-origin>");
    process.exit(2);
  }
  try {
    await checkAuthSettings(backendUrl, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    console.log(`${backendUrl}: email signup is enabled and requires confirmation`);
  } catch (error) {
    console.error(`Auth settings check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
