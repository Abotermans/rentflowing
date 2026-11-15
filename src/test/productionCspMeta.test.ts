// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../../vite.config";

describe("HTML CSP fallback", () => {
  it("limits production scripts to deployment assets and excludes development permissions", () => {
    const policy = contentSecurityPolicy("production", "https://rent.example", "https://project.supabase.co");

    expect(policy).toContain("script-src https://rent.example/assets/ https://rent.example/security/");
    expect(policy).toContain("connect-src 'self' https://project.supabase.co wss://project.supabase.co");
    expect(policy).toContain("img-src 'self' data: blob: https://project.supabase.co");
    expect(policy).not.toContain("r2.dev");
    expect(policy).not.toContain("https://*.supabase.co");
    expect(policy).not.toContain("'unsafe-inline' https://rent.example/assets/");
    expect(policy).not.toContain("localhost");
    expect(policy).not.toContain("127.0.0.1");
  });

  it("retains local Vite scripts and hot reload connections in development", () => {
    const policy = contentSecurityPolicy("development");

    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("http://localhost:*");
    expect(policy).toContain("ws://localhost:*");
  });

  it("normalizes a trailing slash on a custom deployment origin", () => {
    const policy = contentSecurityPolicy("production", "https://rent.example/", "https://project.supabase.co");

    expect(policy).toContain("script-src https://rent.example/assets/ https://rent.example/security/");
    expect(policy).not.toContain("https://rent.example//assets/");
  });

  it("requires a configured backend for a production policy", () => {
    expect(() => contentSecurityPolicy("production", "https://rent.example")).toThrow("VITE_SUPABASE_URL");
  });
});
