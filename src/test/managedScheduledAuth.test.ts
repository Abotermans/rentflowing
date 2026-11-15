// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateScheduledRequest } from "../../supabase/functions/_shared/scheduled-auth";
import { resolveBusinessInstant } from "../../supabase/functions/advance-receivables/business-instant";

// Node tests provide only the Deno environment surface used by the Edge helper.
declare global {
  var Deno: { env: { get(name: string): string | undefined } };
}

const current = "current-" + "a".repeat(40);
const previous = "previous-" + "b".repeat(40);
function configure(values: Record<string, string> = { LOVABLE_CRON_SECRET: current }) {
  vi.stubGlobal("Deno", { env: { get: (name: string) => values[name] } });
}
function request(authorization?: string, legacy?: string) {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  if (legacy) headers.set("X-Cron-Secret", legacy);
  return new Request("https://example.com/job", { method: "POST", headers });
}
afterEach(() => vi.unstubAllGlobals());

describe("managed scheduled authentication", () => {
  it("accepts the managed current credential and its rotation predecessor", () => {
    configure({ LOVABLE_CRON_SECRET: current, LOVABLE_CRON_SECRET_PREVIOUS: previous });
    expect(authenticateScheduledRequest(request(`Bearer ${current}`))).toBeNull();
    expect(authenticateScheduledRequest(request(`Bearer ${previous}`))).toBeNull();
  });
  it.each([undefined, "Bearer wrong", "Bearer sb_publishable_public", "Bearer user.jwt.token", "Basic token", `Bearer ${current},other`])(
    "rejects unauthorized input %s", (header) => {
      configure();
      expect(authenticateScheduledRequest(request(header))?.status).toBe(401);
    },
  );
  it("does not accept the legacy header or a retired credential", () => {
    configure();
    expect(authenticateScheduledRequest(request(undefined, current))?.status).toBe(401);
    expect(authenticateScheduledRequest(request(`Bearer ${previous}`))?.status).toBe(401);
  });
  it.each([{}, { LOVABLE_CRON_SECRET: "short" }, { LOVABLE_CRON_SECRET: current, LOVABLE_CRON_SECRET_PREVIOUS: "short" }])(
    "fails closed on insecure configuration", (values) => {
      configure(values);
      expect(authenticateScheduledRequest(request(`Bearer ${current}`))?.status).toBe(503);
    },
  );
});

describe("managed schedule business instant", () => {
  const now = new Date("2026-11-15T10:00:00.123Z");
  it("uses a captured server clock only when the timestamp is absent", () => {
    const instant = resolveBusinessInstant({}, now);
    expect(instant.toISOString()).toBe(now.toISOString());
    expect(instant).not.toBe(now);
    expect(resolveBusinessInstant({ businessInstant: "2026-11-15T09:59:00Z" }, now).toISOString())
      .toBe("2026-11-15T09:59:00.000Z");
  });
  it.each([null, [], "", 42])("rejects a non-object body", (body) => {
    expect(() => resolveBusinessInstant(body, now)).toThrow("JSON object");
  });
  it.each([null, undefined, "invalid", "2026-11-15T09:00:00Z", "2026-11-15T11:00:00Z"])(
    "does not silently replace an invalid explicit instant", (businessInstant) => {
      expect(() => resolveBusinessInstant({ businessInstant }, now)).toThrow();
    },
  );
});
