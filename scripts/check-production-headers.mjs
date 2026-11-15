import { pathToFileURL } from "node:url";

function parsePolicy(value) {
  const directives = value.split(";").map((part) => {
    const [name, ...sources] = part.trim().split(/\s+/);
    return [name.toLowerCase(), sources];
  }).filter(([name]) => name);
  const policy = new Map();
  const duplicates = new Set();
  for (const [name, sources] of directives) {
    if (policy.has(name)) duplicates.add(name);
    else policy.set(name, sources);
  }
  return { policy, duplicates };
}

export async function checkProductionHeaders(urlInput, expectedBackendOrigin, fetchImpl = fetch) {
  const requested = new URL(urlInput);
  if (requested.protocol !== "https:") throw new Error("Production URL must use HTTPS");
  if (requested.pathname !== "/" || requested.search || requested.hash
    || requested.href !== `${requested.origin}/`) {
    throw new Error("Production URL must be the published site origin");
  }
  if (!expectedBackendOrigin) throw new Error("Expected backend origin is required");
  const backend = new URL(expectedBackendOrigin);
  if (backend.protocol !== "https:" || backend.origin !== expectedBackendOrigin) {
    throw new Error("Backend URL must be an HTTPS origin");
  }

  for (const path of ["/", "/leases"]) {
    const page = new URL(path, requested.origin);
    await checkPageHeaders(page, backend.origin, fetchImpl);
  }
  return requested.origin;
}

async function checkPageHeaders(requested, backendOrigin, fetchImpl) {
  const response = await fetchImpl(requested, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`${response.url}: returned HTTP ${response.status}`);

  const finalUrl = new URL(response.url);
  if (finalUrl.origin !== requested.origin) {
    throw new Error(`Redirected to a different origin: ${finalUrl.origin}`);
  }
  if (finalUrl.pathname !== requested.pathname) {
    throw new Error(`${requested}: redirected to ${finalUrl.pathname} instead of serving the app route`);
  }

  const headers = response.headers;
  if (!/^text\/html(?:\s*;|\s*$)/i.test(headers.get("content-type") ?? "")) {
    throw new Error(`${response.url}: expected an HTML application response`);
  }
  const { policy, duplicates } = parsePolicy(headers.get("content-security-policy") ?? "");
  const scripts = policy.get("script-src") ?? [];
  const expectedScripts = [`${requested.origin}/assets/`, `${requested.origin}/security/`];
  const expectedConnections = ["'self'", backendOrigin, backendOrigin.replace(/^https:/, "wss:")];
  const expectedImages = ["'self'", "data:", "blob:", backendOrigin];
  const exactly = (name, sources) => {
    const actual = policy.get(name) ?? [];
    return actual.length === sources.length && sources.every(source => actual.includes(source));
  };
  const invalid = [];

  if (duplicates.size > 0) invalid.push(`duplicate CSP directives: ${[...duplicates].join(", ")}`);
  if (!exactly("default-src", ["'self'"])) invalid.push("CSP default-src");
  if (policy.get("frame-ancestors")?.join(" ") !== "'none'") invalid.push("CSP frame-ancestors");
  if (policy.get("object-src")?.join(" ") !== "'none'") invalid.push("CSP object-src");
  if (policy.get("base-uri")?.join(" ") !== "'self'") invalid.push("CSP base-uri");
  if (!exactly("form-action", ["'self'"])) invalid.push("CSP form-action");
  if (!exactly("connect-src", expectedConnections)) invalid.push("CSP connect-src");
  if (!exactly("img-src", expectedImages)) invalid.push("CSP img-src");
  if (!exactly("style-src", ["'self'", "'unsafe-inline'"])) invalid.push("CSP style-src");
  if (!exactly("font-src", ["'self'", "data:"])) invalid.push("CSP font-src");
  if (!exactly("worker-src", ["'self'", "blob:"])) invalid.push("CSP worker-src");
  if (!exactly("manifest-src", ["'self'"])) invalid.push("CSP manifest-src");
  if (!exactly("media-src", ["'self'", "blob:", "data:"])) invalid.push("CSP media-src");
  if (!policy.has("upgrade-insecure-requests") || policy.get("upgrade-insecure-requests")?.length !== 0) {
    invalid.push("CSP upgrade-insecure-requests");
  }
  if (scripts.length !== expectedScripts.length || expectedScripts.some((source) => !scripts.includes(source))) {
    invalid.push("CSP script-src");
  }
  const scriptElements = policy.get("script-src-elem");
  if (scriptElements && (scriptElements.length !== expectedScripts.length || expectedScripts.some((source) => !scriptElements.includes(source)))) {
    invalid.push("CSP script-src-elem");
  }
  const scriptAttributes = policy.get("script-src-attr");
  if (scriptAttributes && scriptAttributes.join(" ") !== "'none'") invalid.push("CSP script-src-attr");
  if (headers.get("x-frame-options")?.toUpperCase() !== "DENY") invalid.push("x-frame-options");
  const hstsDirectives = (headers.get("strict-transport-security") ?? "")
    .split(";").map(part => part.trim());
  const maxAge = hstsDirectives.filter(part => /^max-age=\d+$/i.test(part));
  if (maxAge.length !== 1 || !Number.isSafeInteger(Number(maxAge[0].split("=")[1]))
    || Number(maxAge[0].split("=")[1]) < 31_536_000) {
    invalid.push("strict-transport-security");
  }
  if (headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") invalid.push("x-content-type-options");
  if (headers.get("x-robots-tag")?.toLowerCase() !== "noindex, nofollow") invalid.push("x-robots-tag");
  if (headers.get("referrer-policy")?.toLowerCase() !== "strict-origin-when-cross-origin") {
    invalid.push("referrer-policy");
  }
  const permissions = (headers.get("permissions-policy") ?? "").split(",").map((directive) => directive.trim());
  for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
    const matches = permissions.filter((directive) => directive.startsWith(`${feature}=`));
    if (matches.length !== 1 || matches[0] !== `${feature}=()`) {
      invalid.push(`permissions-policy ${feature}`);
    }
  }

  if (invalid.length > 0) throw new Error(`${response.url}: missing or invalid security headers: ${invalid.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.argv[2] ?? "https://rentflowing.lovable.app";
  const backend = process.argv[3] ?? process.env.PRODUCTION_SUPABASE_ORIGIN;
  try {
    const checked = await checkProductionHeaders(url, backend);
    console.log(`${checked}: required security headers are present`);
  } catch (error) {
    console.error(`${url}: could not verify deployed headers: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
