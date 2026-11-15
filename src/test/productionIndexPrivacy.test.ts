// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("private app indexing", () => {
  it("does not advertise application routes to crawlers or inherited Lovable previews", async () => {
    const [html, robots] = await Promise.all([
      readFile(new URL("../../index.html", import.meta.url), "utf8"),
      readFile(new URL("../../public/robots.txt", import.meta.url), "utf8"),
    ]);
    expect(html).toContain('<meta name="robots" content="noindex,nofollow" />');
    expect(html).not.toContain("@Lovable");
    expect(html).not.toContain("pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev");
    expect(robots).toMatch(/User-agent: \*\s+Allow: \//);
  });
});
