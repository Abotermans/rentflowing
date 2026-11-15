// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkAuthSettings } from "../../scripts/check-auth-settings.mjs";

const backend = "https://othaxlwgtqpodncnlglv.supabase.co";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

describe("read-only Auth settings release gate", () => {
  it("accepts confirmed-email signup and uses only the public Auth settings endpoint", async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) => reply({
      mailer_autoconfirm: false, disable_signup: false, external: { email: true },
    }));
    await expect(checkAuthSettings(backend, "publishable-key", fetchImpl)).resolves.toBe(true);
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${backend}/auth/v1/settings`);
    expect(options.method).toBe("GET");
    expect((options.headers as Record<string, string>).apikey).toBe("publishable-key");
    expect(options.redirect).toBe("manual");
  });

  it("blocks automatic confirmation and ambiguous settings responses", async () => {
    await expect(checkAuthSettings(backend, "key", async () => reply({ mailer_autoconfirm: true })))
      .rejects.toThrow("automatically confirms email");
    await expect(checkAuthSettings(backend, "key", async () => reply({})))
      .rejects.toThrow("omitted mailer_autoconfirm");
    await expect(checkAuthSettings(backend, "key", async () => reply({ mailer_autoconfirm: "false" })))
      .rejects.toThrow("omitted mailer_autoconfirm");
  });

  it("blocks disabled or unavailable email signup", async () => {
    await expect(checkAuthSettings(backend, "key", async () => reply({
      mailer_autoconfirm: false, disable_signup: true, external: { email: true },
    }))).rejects.toThrow("signup is disabled");
    await expect(checkAuthSettings(backend, "key", async () => reply({
      mailer_autoconfirm: false, disable_signup: false, external: { email: false },
    }))).rejects.toThrow("email sign-in is disabled");
    await expect(checkAuthSettings(backend, "key", async () => reply({
      mailer_autoconfirm: false, disable_signup: false,
    }))).rejects.toThrow("email sign-in is disabled");
  });

  it("fails closed when access is denied or inputs are missing", async () => {
    await expect(checkAuthSettings(backend, "key", async () => reply({}, 401)))
      .rejects.toThrow("HTTP 401");
    await expect(checkAuthSettings(backend, "", async () => reply({ mailer_autoconfirm: false })))
      .rejects.toThrow("publishable key is required");
    await expect(checkAuthSettings("http://othaxlwgtqpodncnlglv.supabase.co", "key", async () => reply({})))
      .rejects.toThrow("hosted Supabase HTTPS origin");
  });
});
