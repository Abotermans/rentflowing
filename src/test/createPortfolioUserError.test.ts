import { describe, expect, it } from "vitest";
import { readCreatePortfolioUserError } from "@/lib/createPortfolioUserError";

describe("readCreatePortfolioUserError", () => {
  it("shows the backend reason for an unavailable account", async () => {
    const result = await readCreatePortfolioUserError({
      message: "Edge function returned an error",
      context: { json: async () => ({ error: "No existing account found. Send a portfolio invitation instead." }) },
    });
    expect(result).toBe("No existing account found. Send a portfolio invitation instead.");
  });

  it("shows a role permission error", async () => {
    const result = await readCreatePortfolioUserError({
      message: "Edge function returned an error",
      context: { json: async () => ({ error: "Role not permitted" }) },
    });
    expect(result).toBe("Role not permitted");
  });

  it("falls back when no structured response is available", async () => {
    expect(await readCreatePortfolioUserError({ message: "Connection failed" })).toBe("Connection failed");
    expect(await readCreatePortfolioUserError({
      message: "Invalid response",
      context: { json: async () => { throw new Error("Invalid JSON"); } },
    })).toBe("Invalid response");
  });
});
