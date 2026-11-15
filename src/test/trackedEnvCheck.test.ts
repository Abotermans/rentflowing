// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkTrackedEnvContents, isTrackedRuntimeEnv } from "../../scripts/check-tracked-env.mjs";

const projectId = "abcdefghijklmnopqrst";
const publicKey = "sb_publishable_abcdefghijklmnop";
const file = (content: string) => [{ path: ".env", content }];

describe("tracked runtime environment guard", () => {
  it("selects tracked runtime env files but not examples or unrelated files", () => {
    expect(isTrackedRuntimeEnv(".env")).toBe(true);
    expect(isTrackedRuntimeEnv("app/.env.production")).toBe(true);
    expect(isTrackedRuntimeEnv(".env.example")).toBe(false);
    expect(isTrackedRuntimeEnv("app/config.env")).toBe(false);
  });

  it("accepts only the current public Supabase fields", () => {
    expect(checkTrackedEnvContents(file(`# Public client configuration
VITE_SUPABASE_PROJECT_ID=${projectId}
VITE_SUPABASE_URL=https://${projectId}.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}
`))).toBe(1);
  });

  it("rejects an unexpected server field without printing its value", () => {
    const secret = "server-only-value-123456789";
    let message = "";
    try {
      checkTrackedEnvContents(file(`SUPABASE_SERVICE_ROLE_KEY=${secret}`));
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("unexpected or repeated environment field");
    expect(message).not.toContain(secret);
  });

  it("rejects server-only or legacy JWT values in the browser key field", () => {
    for (const key of ["sb_secret_abcdefghijklmnop", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature"]) {
      expect(() => checkTrackedEnvContents(file(`VITE_SUPABASE_PUBLISHABLE_KEY=${key}`)))
        .toThrow("non-publishable Supabase key");
    }
  });

  it("rejects duplicate, malformed, or mismatched public fields", () => {
    expect(() => checkTrackedEnvContents(file(`VITE_SUPABASE_URL=https://${projectId}.supabase.co\nVITE_SUPABASE_URL=https://${projectId}.supabase.co`)))
      .toThrow("unexpected or repeated environment field");
    expect(() => checkTrackedEnvContents(file("VITE_SUPABASE_URL")))
      .toThrow("unexpected or repeated environment field");
    expect(() => checkTrackedEnvContents(file(`VITE_SUPABASE_PROJECT_ID=${projectId}\nVITE_SUPABASE_URL=https://qrstuvwxyzabcdefghij.supabase.co`)))
      .toThrow("mismatched Supabase project ID");
    expect(() => checkTrackedEnvContents(file("VITE_SUPABASE_URL=http://abcdefghijklmnopqrst.supabase.co")))
      .toThrow("invalid public Supabase URL");
  });
});
