// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { configureHeaderTemplate } from "../../scripts/configure-headers.mjs";

const template = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");

describe("static host headers", () => {
  it("scopes app scripts and Supabase HTTPS/WebSocket access to the configured origins", () => {
    const configured = configureHeaderTemplate(
      template,
      "https://rentflowing-test.pages.dev",
      "https://new-project.supabase.co",
    );

    expect(configured).toContain("script-src https://rentflowing-test.pages.dev/assets/ https://rentflowing-test.pages.dev/security/");
    expect(configured).toContain("connect-src 'self' https://new-project.supabase.co wss://new-project.supabase.co");
    expect(configured).toContain("img-src 'self' data: blob: https://new-project.supabase.co");
    expect(configured).not.toContain("othaxlwgtqpodncnlglv");
    expect(configured).not.toContain("rentflowing.lovable.app");
    expect(configured).not.toContain("*.r2.dev");
  });

  it("rejects a non-HTTPS backend origin", () => {
    expect(() => configureHeaderTemplate(template, "https://rent.example", "http://backend.example"))
      .toThrow("VITE_SUPABASE_URL");
  });

  it("rejects a Cloudflare Pages build without its deployment origin", () => {
    const env = { ...process.env };
    delete env.PUBLIC_APP_ORIGIN;
    const result = spawnSync(process.execPath, ["scripts/check-build-env.mjs"], {
      cwd: new URL("../..", import.meta.url),
      env: {
        ...env,
        CF_PAGES: "1",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cloudflare Pages builds require PUBLIC_APP_ORIGIN");
  });

  it("rejects a Cloudflare Pages build that points its CSP at the Lovable host", () => {
    const result = spawnSync(process.execPath, ["scripts/check-build-env.mjs"], {
      cwd: new URL("../..", import.meta.url),
      env: {
        ...process.env,
        CF_PAGES: "1",
        PUBLIC_APP_ORIGIN: "https://rentflowing.lovable.app/",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot use the Lovable host");
  });

  it("refuses Supabase server-only keys in the browser build", () => {
    const serviceRolePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    for (const key of ["sb_secret_test", `header.${serviceRolePayload}.signature`]) {
      const result = spawnSync(process.execPath, ["scripts/check-build-env.mjs"], {
        cwd: new URL("../..", import.meta.url),
        env: {
          ...process.env,
          VITE_SUPABASE_URL: "https://example.supabase.co",
          VITE_SUPABASE_PUBLISHABLE_KEY: key,
        },
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("refuses a Supabase server-only key");
    }
  });

  it("accepts a publishable browser key", () => {
    const result = spawnSync(process.execPath, ["scripts/check-build-env.mjs"], {
      cwd: new URL("../..", import.meta.url),
      env: {
        ...process.env,
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });
});
