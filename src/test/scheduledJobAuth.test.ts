// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { hasScheduledJobSecret, isConfiguredScheduledJobSecret } from "@/lib/scheduledJobAuth";

const request = (secret?: string) => new Request("https://example.com/functions/v1/job", {
  method: "POST",
  headers: secret ? { "X-Cron-Secret": secret } : {},
});

describe("scheduled job secret", () => {
  it("requires the complete configured secret", () => {
    const secret = "a-secure-scheduled-job-secret-value";
    expect(hasScheduledJobSecret(request(secret), secret)).toBe(true);
    expect(hasScheduledJobSecret(request(secret.slice(0, -1)), secret)).toBe(false);
    expect(hasScheduledJobSecret(request(`${secret}x`), secret)).toBe(false);
    expect(hasScheduledJobSecret(request("wrong-secret"), secret)).toBe(false);
  });

  it("rejects missing configured or supplied secrets", () => {
    expect(hasScheduledJobSecret(request(), "configured-secret")).toBe(false);
    expect(hasScheduledJobSecret(request("anything"), undefined)).toBe(false);
    expect(hasScheduledJobSecret(request("anything"), "")).toBe(false);
    expect(hasScheduledJobSecret(request("a".repeat(31)), "a".repeat(31))).toBe(false);
    expect(hasScheduledJobSecret(request("a".repeat(32)), "a".repeat(32))).toBe(true);
    expect(isConfiguredScheduledJobSecret(undefined)).toBe(false);
    expect(isConfiguredScheduledJobSecret("a".repeat(31))).toBe(false);
    expect(isConfiguredScheduledJobSecret("a".repeat(32))).toBe(true);
  });
});

describe("scheduled Edge Function routes", () => {
  it.each(["advance-receivables", "cleanup-lease-document-files"])(
    "%s rejects non-POST requests before privileged access",
    async (name) => {
      const source = await readFile(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), "utf8");
      expect(source).toContain('Deno.serve(async (request) => {\n  if (request.method !== "POST") return json(405');
      expect(source).not.toContain('request.method === "GET"');
      expect(source.indexOf('if (request.method !== "POST")')).toBeLessThan(source.indexOf('createClient(url, serviceKey'));
      expect(source.indexOf("if (!isConfiguredScheduledJobSecret(secret))"))
        .toBeLessThan(source.indexOf('createClient(url, serviceKey'));
      expect(source.indexOf("if (!hasScheduledJobSecret(request, secret))"))
        .toBeLessThan(source.indexOf('createClient(url, serviceKey'));
    },
  );

  it("does not bill on old terms after a scheduled amendment fails", async () => {
    const source = await readFile(new URL("../../supabase/functions/advance-receivables/index.ts", import.meta.url), "utf8");
    const amendmentRun = source.indexOf("const amendments = await runDueAmendmentJob(");
    const incompleteGuard = source.indexOf("if (amendments.incompleteAmendmentIds.length > 0)");
    const stop = source.indexOf("return json(409, { businessInstant: businessInstant.toISOString(), amendments });");
    const lifecycleRun = source.indexOf("const lifecycle: DatabaseRow[] = [];");
    const billingRun = source.indexOf("const result = await runDueReceivableJob(");
    expect(amendmentRun).toBeGreaterThan(-1);
    expect(incompleteGuard).toBeGreaterThan(amendmentRun);
    expect(stop).toBeGreaterThan(incompleteGuard);
    expect(lifecycleRun).toBeGreaterThan(stop);
    expect(billingRun).toBeGreaterThan(lifecycleRun);
  });
});
