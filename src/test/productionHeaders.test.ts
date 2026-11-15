// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkProductionHeaders as verifyHeaders } from "../../scripts/check-production-headers.mjs";
import { configureHeaderTemplate } from "../../scripts/configure-headers.mjs";

const origin = "https://rent.example";
const backend = "https://backend.example";
const checkProductionHeaders = (url: string, fetchImpl: typeof fetch) => verifyHeaders(url, backend, fetchImpl);

function response(overrides: Record<string, string> = {}, url = origin) {
  const headers = new Headers({
    "content-security-policy": `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src ${origin}/assets/ ${origin}/security/; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${backend}; font-src 'self' data:; connect-src 'self' ${backend} wss://backend.example; worker-src 'self' blob:; manifest-src 'self'; media-src 'self' blob: data:; upgrade-insecure-requests`,
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "content-type": "text/html; charset=utf-8",
  });
  for (const [name, value] of Object.entries(overrides)) headers.set(name, value);
  return { ok: true, url, headers, body: null } as unknown as Response;
}

describe("production security headers", () => {
  it("accepts the actual static-host header template", async () => {
    const template = await readFile(new URL("../../public/_headers", import.meta.url), "utf8");
    const headers = Object.fromEntries(template.split("\n")
      .filter((line) => line.startsWith("  "))
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }));
    const url = "https://rentflowing.lovable.app";
    await expect(verifyHeaders(url, "https://othaxlwgtqpodncnlglv.supabase.co", async (request) => response(headers, String(request)))).resolves.toBe(url);
  });

  it("accepts a header template rebound to another app and backend origin", async () => {
    const template = await readFile(new URL("../../public/_headers", import.meta.url), "utf8");
    const appOrigin = "https://rentflowing-test.pages.dev";
    const backendOrigin = "https://new-project.supabase.co";
    const configured = configureHeaderTemplate(template, appOrigin, backendOrigin);
    const headers = Object.fromEntries(configured.split("\n")
      .filter(line => line.startsWith("  "))
      .map(line => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }));
    await expect(verifyHeaders(appOrigin, backendOrigin, async request => response(headers, String(request))))
      .resolves.toBe(appOrigin);
  });

  it("accepts the exact origin-scoped script policy", async () => {
    const checked: string[] = [];
    await expect(checkProductionHeaders(origin, async (request) => {
      checked.push(String(request));
      return response({}, String(request));
    })).resolves.toBe(origin);
    expect(checked).toEqual([`${origin}/`, `${origin}/leases`]);
  });

  it("rejects a path, query, or fragment in the requested production origin", async () => {
    for (const url of [`${origin}/leases`, `${origin}/?preview=1`, `${origin}/#preview`]) {
      await expect(checkProductionHeaders(url, async () => response()))
        .rejects.toThrow("Production URL must be the published site origin");
    }
  });

  it("rejects a non-HTML response even when its security headers are present", async () => {
    await expect(checkProductionHeaders(origin, async request => response(
      String(request).endsWith("/leases") ? { "content-type": "application/json" } : {},
      String(request),
    ))).rejects.toThrow("/leases: expected an HTML application response");
  });

  it("rejects an unprotected lease route even when the home page is protected", async () => {
    await expect(checkProductionHeaders(origin, async (request) => response(
      String(request).endsWith("/leases") ? { "content-security-policy": "" } : {},
      String(request),
    ))).rejects.toThrow("/leases: missing or invalid security headers");
  });

  it("rejects a lease route redirected to the home page", async () => {
    await expect(checkProductionHeaders(origin, async () => response())).rejects.toThrow(
      "redirected to / instead of serving the app route",
    );
  });

  it("rejects a framing-only CSP and permissive scripts", async () => {
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": "frame-ancestors 'none'; script-src 'self' 'unsafe-inline'",
    }))).rejects.toThrow("CSP script-src");
  });

  it("rejects duplicate or overriding script directives", async () => {
    const scripts = `${origin}/assets/ ${origin}/security/`;
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'unsafe-inline'; script-src ${scripts}`,
    }))).rejects.toThrow("duplicate CSP directives");
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; SCRIPT-SRC 'unsafe-inline'; script-src ${scripts}`,
    }))).rejects.toThrow("duplicate CSP directives");
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src ${scripts}; script-src-elem 'unsafe-inline'`,
    }))).rejects.toThrow("CSP script-src-elem");
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src ${scripts}; script-src-attr 'unsafe-inline'`,
    }))).rejects.toThrow("CSP script-src-attr");
  });

  it("requires a bounded backend connection and image policy", async () => {
    const secure = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src ${origin}/assets/ ${origin}/security/; img-src 'self' data: blob: ${backend}; connect-src 'self' ${backend} wss://backend.example; upgrade-insecure-requests`;
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": secure.replace(`connect-src 'self' ${backend} wss://backend.example`, "connect-src *"),
    }))).rejects.toThrow("CSP connect-src");
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": secure.replace(`img-src 'self' data: blob: ${backend}`, "img-src *"),
    }))).rejects.toThrow("CSP img-src");
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": secure.replace("form-action 'self'", "form-action *"),
    }))).rejects.toThrow("CSP form-action");
    await expect(checkProductionHeaders(origin, async () => response({
      "content-security-policy": secure.replace("; upgrade-insecure-requests", ""),
    }))).rejects.toThrow("CSP upgrade-insecure-requests");
    await expect(verifyHeaders(origin, "http://backend.example", async () => response()))
      .rejects.toThrow("Backend URL must be an HTTPS origin");
  });

  it("rejects permissive or missing resource directives", async () => {
    const secure = response().headers.get("content-security-policy")!;
    for (const [directive, replacement] of [
      ["style-src", "style-src *"],
      ["font-src", "font-src *"],
      ["worker-src", "worker-src *"],
      ["manifest-src", "manifest-src *"],
      ["media-src", "media-src *"],
    ]) {
      const current = secure.split("; ").find(part => part.startsWith(`${directive} `))!;
      await expect(checkProductionHeaders(origin, async () => response({
        "content-security-policy": secure.replace(current, replacement),
      }))).rejects.toThrow(`CSP ${directive}`);
      await expect(checkProductionHeaders(origin, async () => response({
        "content-security-policy": secure.replace(`${current}; `, ""),
      }))).rejects.toThrow(`CSP ${directive}`);
    }
  });

  it("rejects headers scoped to the wrong deployment origin", async () => {
    await expect(checkProductionHeaders("https://other.example", async () => response({}, "https://other.example")))
      .rejects.toThrow("CSP script-src");
  });

  it("rejects cross-origin redirects instead of checking another host", async () => {
    await expect(checkProductionHeaders(origin, async () => response({}, "https://other.example")))
      .rejects.toThrow("Redirected to a different origin");
  });

  it("requires HTTPS and all restrictive headers", async () => {
    await expect(checkProductionHeaders("http://rent.example", async () => response()))
      .rejects.toThrow("HTTPS");
    await expect(checkProductionHeaders(origin, async () => response({ "permissions-policy": "camera=*" })))
      .rejects.toThrow("permissions-policy camera");
    await expect(checkProductionHeaders(origin, async () => response({ "x-robots-tag": "index, follow" })))
      .rejects.toThrow("x-robots-tag");
    await expect(checkProductionHeaders(origin, async () => response({ "strict-transport-security": "max-age=0" })))
      .rejects.toThrow("strict-transport-security");
    await expect(checkProductionHeaders(origin, async () => response({ "strict-transport-security": "" })))
      .rejects.toThrow("strict-transport-security");
    await expect(checkProductionHeaders(origin, async () => response({
      "permissions-policy": "camera=*, camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    }))).rejects.toThrow("permissions-policy camera");
  });
});
