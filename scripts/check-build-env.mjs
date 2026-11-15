import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "VITE_");
const endpoint = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function isServerOnlyKey(value) {
  if (value?.startsWith("sb_secret_")) return true;
  const parts = value?.split(".");
  if (parts?.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role === "service_role";
  } catch {
    return false;
  }
}

let validEndpoint = false;
try {
  const parsed = new URL(endpoint);
  validEndpoint = parsed.protocol === "https:" && parsed.origin === endpoint;
} catch {
  validEndpoint = false;
}

if (!validEndpoint || !key) {
  const missing = [
    !validEndpoint && "VITE_SUPABASE_URL (HTTPS origin)",
    !key && "VITE_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean);
  console.error(`Production build requires valid ${missing.join(" and ")}.`);
  process.exit(1);
}

if (isServerOnlyKey(key)) {
  console.error("Production build refuses a Supabase server-only key in VITE_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

if (process.env.CF_PAGES === "1") {
  const appOrigin = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (!appOrigin) {
    console.error("Cloudflare Pages builds require PUBLIC_APP_ORIGIN to avoid publishing a CSP for the Lovable host.");
    process.exit(1);
  }
  if (appOrigin.replace(/\/$/, "") === "https://rentflowing.lovable.app") {
    console.error("Cloudflare Pages builds cannot use the Lovable host as PUBLIC_APP_ORIGIN.");
    process.exit(1);
  }
}
