import { describe, expect, it, vi } from "vitest";
import { readSignupAvailability } from "@/lib/signupAvailability";

const backend = "https://othaxlwgtqpodncnlglv.supabase.co";
const key = "public-test-key";
const reply = (settings: unknown) => vi.fn(async () => new Response(JSON.stringify(settings), {
  status: 200, headers: { "Content-Type": "application/json" },
})) as unknown as typeof fetch;

describe("signup availability", () => {
  it("hides registration when global signup or email signup is disabled", async () => {
    expect(await readSignupAvailability(backend, key,
      reply({ disable_signup: true, external: { email: true } }))).toBe("disabled");
    expect(await readSignupAvailability(backend, key,
      reply({ disable_signup: false, external: { email: false } }))).toBe("disabled");
  });

  it("allows registration only when both backend settings enable it", async () => {
    const fetchImpl = reply({ disable_signup: false, external: { email: true } });
    expect(await readSignupAvailability(backend, key, fetchImpl)).toBe("enabled");
    expect(fetchImpl).toHaveBeenCalledWith(new URL(`${backend}/auth/v1/settings`),
      expect.objectContaining({ headers: { apikey: key } }));
  });

  it("keeps the backend submission authoritative when settings are unavailable", async () => {
    expect(await readSignupAvailability(backend, key,
      reply({ external: { email: true } }))).toBe("unknown");
    expect(await readSignupAvailability(backend, key,
      vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("unknown");
    expect(await readSignupAvailability("", key, reply({ disable_signup: false }))).toBe("unknown");
  });
});
