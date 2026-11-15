// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { checkDeployment as verifyDeployment, loadLocalRelease } from "../../scripts/check-deployment.mjs";

const revision = "0000000000000000000000000000000000000001";
const backendOrigin = "https://project.supabase.co";
const publishableKey = "sb_publishable_test_key";
const publishableKeySha256 = createHash("sha256").update(publishableKey).digest("hex");
const index = "<!doctype html><html><body><div id=\"root\"></div></body></html>";
const indexSha256 = createHash("sha256").update(index).digest("hex");
const assetBodies: Record<string, string> = {
  "/assets/index.js": "console.log('ready')",
  "/assets/index.css": "body { color: black; }",
  "/security/replay-guard.js": "console.log('guard')",
  "/favicon.ico": "icon-bytes",
  "/robots.txt": "User-agent: *\nAllow: /\n",
  "/placeholder.svg": "<svg/>",
};
const assetSha256 = Object.fromEntries(Object.entries(assetBodies).map(([path, body]) => [
  path.slice(1), createHash("sha256").update(body).digest("hex"),
]));
const validRelease = { revision, dirty: false, indexSha256, backendOrigin, publishableKeySha256, assetSha256 };

function checkDeployment(urlInput: string, expectedRevision: string, expectedBackendOrigin: string,
  fetchImpl: Parameters<typeof verifyDeployment>[5]) {
  return verifyDeployment(urlInput, expectedRevision, expectedBackendOrigin, publishableKey, validRelease, fetchImpl);
}

function mockFetch(body: unknown, status = 200, indexBody = index, indexStatus = 200,
  assets = assetBodies) {
  return vi.fn(async (url: URL) => {
    const marker = url.pathname === "/release.json";
    const page = url.pathname === "/";
    const asset = assets[url.pathname];
    const response = new Response(marker ? JSON.stringify(body) : page ? indexBody : asset ?? "", {
      status: marker ? status : page ? indexStatus : asset === undefined ? 404 : 200,
      headers: {
        "content-type": marker ? "application/json" : page ? "text/html"
          : url.pathname.endsWith(".css") ? "text/css" : "text/javascript",
        ...(marker ? { "cache-control": "no-store" } : {}),
      },
    });
    Object.defineProperty(response, "url", { value: url.toString(), configurable: true });
    return response;
  });
}

describe("deployment release marker", () => {
  it("checks every file in the independent local build before using its manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rentflowing-release-"));
    const distUrl = pathToFileURL(`${directory}/`);
    try {
      await writeFile(join(directory, "release.json"), JSON.stringify(validRelease));
      await writeFile(join(directory, "index.html"), index);
      await writeFile(join(directory, "_headers"), "/*\n  X-Frame-Options: DENY\n");
      await mkdir(join(directory, ".vite"));
      await writeFile(join(directory, ".vite/manifest.json"), "{}");
      for (const [path, body] of Object.entries(assetBodies)) {
        const destination = join(directory, path.slice(1));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, body);
      }
      await expect(loadLocalRelease(distUrl)).resolves.toMatchObject(validRelease);
      await writeFile(join(directory, "index.html"), "tampered");
      await expect(loadLocalRelease(distUrl)).rejects.toThrow("Local index.html does not match");
      await writeFile(join(directory, "index.html"), index);
      await writeFile(join(directory, "assets/index.js"), "tampered");
      await expect(loadLocalRelease(distUrl)).rejects.toThrow("Local asset assets/index.js does not match");
      await writeFile(join(directory, "assets/index.js"), assetBodies["/assets/index.js"]);
      await writeFile(join(directory, "assets/index 2.js"), "stale code");
      await expect(loadLocalRelease(distUrl)).rejects.toThrow("Unexpected build file assets/index 2.js");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts a clean build only when its published page matches", async () => {
    const fetch = mockFetch(validRelease);
    await expect(checkDeployment("https://example.com", revision, backendOrigin, fetch)).resolves.toBe("https://example.com");
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it("rejects an older or dirty build", async () => {
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({ ...validRelease, revision: "older" })))
      .rejects.toThrow("Expected revision");
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({ ...validRelease, dirty: true })))
      .rejects.toThrow("not built from a clean checkout");
  });

  it("rejects a deployment without the marker", async () => {
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({}, 404)))
      .rejects.toThrow("HTTP 404");
  });

  it("rejects a cacheable release marker", async () => {
    const fetch = mockFetch(validRelease);
    await expect(checkDeployment("https://example.com", revision, backendOrigin, async (url: URL) => {
      const response = await fetch(url);
      if (url.pathname === "/release.json") response.headers.set("cache-control", "public, max-age=3600");
      return response;
    })).rejects.toThrow("Cache-Control: no-store");
  });

  it("rejects an insecure URL or a marker redirected to another host", async () => {
    await expect(checkDeployment("http://example.com", revision, backendOrigin, mockFetch(validRelease)))
      .rejects.toThrow("HTTPS");
    const redirected = mockFetch(validRelease);
    await expect(checkDeployment("https://example.com", revision, backendOrigin, async (url: URL) => {
      const response = await redirected(url);
      Object.defineProperty(response, "url", { value: "https://other.example/release.json" });
      return response;
    })).rejects.toThrow("different origin");
  });

  it("requires the published site origin rather than a subpath or query", async () => {
    const fetch = mockFetch(validRelease);
    for (const url of ["https://example.com/staged", "https://example.com/?preview=1", "https://example.com/#preview"]) {
      await expect(checkDeployment(url, revision, backendOrigin, fetch)).rejects.toThrow("site origin");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a marker without a valid page digest", async () => {
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({
      revision, dirty: false, backendOrigin, publishableKeySha256,
    })))
      .rejects.toThrow("missing a valid index.html digest");
  });

  it("rejects a missing or malformed build asset manifest", async () => {
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({
      ...validRelease, assetSha256: undefined,
    }))).rejects.toThrow("invalid build asset manifest");
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({
      ...validRelease, assetSha256: { "../escape.js": assetSha256["assets/index.js"] },
    }))).rejects.toThrow("invalid build asset manifest");
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({
      ...validRelease, assetSha256: Object.fromEntries(Object.entries(assetSha256)
        .filter(([path]) => path !== "robots.txt")),
    }))).rejects.toThrow("invalid build asset manifest");
  });

  it("rejects a missing or altered lazy-loaded asset", async () => {
    await expect(checkDeployment("https://example.com", revision, backendOrigin,
      mockFetch(validRelease, 200, index, 200, { "/security/replay-guard.js": assetBodies["/security/replay-guard.js"] })))
      .rejects.toThrow("Published asset assets/index.js is unavailable");
    await expect(checkDeployment("https://example.com", revision, backendOrigin,
      mockFetch(validRelease, 200, index, 200, { ...assetBodies, "/assets/index.js": "stale" })))
      .rejects.toThrow("Published asset assets/index.js does not match the release build");
    await expect(checkDeployment("https://example.com", revision, backendOrigin,
      mockFetch(validRelease, 200, index, 200, { ...assetBodies, "/robots.txt": "User-agent: *\nDisallow: /\n" })))
      .rejects.toThrow("Published asset robots.txt does not match the release build");
  });

  it("rejects JavaScript and CSS served with unusable MIME types", async () => {
    const fetch = mockFetch(validRelease);
    for (const extension of [".js", ".css"]) {
      await expect(checkDeployment("https://example.com", revision, backendOrigin, async (url: URL) => {
        const response = await fetch(url);
        if (url.pathname.startsWith("/assets/") && url.pathname.endsWith(extension)) {
          response.headers.set("content-type", "text/plain");
        }
        return response;
      })).rejects.toThrow(`Published asset assets/index${extension} has an invalid content type`);
    }
  });

  it("rejects a stale or missing published page", async () => {
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch(validRelease, 200, "old page")))
      .rejects.toThrow("does not match the release build");
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch(validRelease, 200, index, 404)))
      .rejects.toThrow("Published application returned HTTP 404");
  });

  it("rejects a self-consistent published marker and page that differ from the checkout build", async () => {
    const otherIndex = "<!doctype html><html><body>Different application</body></html>";
    await expect(checkDeployment("https://example.com", revision, backendOrigin,
      mockFetch({ ...validRelease, indexSha256: createHash("sha256").update(otherIndex).digest("hex") },
        200, otherIndex)))
      .rejects.toThrow("Published index.html differs from the independently built revision");
    const otherAsset = "console.log('different build')";
    await expect(checkDeployment("https://example.com", revision, backendOrigin,
      mockFetch({ ...validRelease, assetSha256: {
        ...assetSha256,
        "assets/index.js": createHash("sha256").update(otherAsset).digest("hex"),
      } }, 200, index, 200, { ...assetBodies, "/assets/index.js": otherAsset })))
      .rejects.toThrow("Published asset manifest differs from the independently built revision");
  });

  it("rejects an application page redirected to another host", async () => {
    const fetch = mockFetch(validRelease);
    await expect(checkDeployment("https://example.com", revision, backendOrigin, async (url: URL) => {
      const response = await fetch(url);
      if (url.pathname === "/") {
        Object.defineProperty(response, "url", { value: "https://other.example/", configurable: true });
      }
      return response;
    })).rejects.toThrow("Published application redirected to a different origin");
  });

  it("rejects a marker for a different backend or without a backend", async () => {
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({
      ...validRelease, backendOrigin: "https://other.supabase.co",
    }))).rejects.toThrow("Published app uses backend https://other.supabase.co");
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({
      ...validRelease, backendOrigin: undefined,
    }))).rejects.toThrow("Published app uses backend none");
  });

  it("rejects a missing or different published Supabase key fingerprint", async () => {
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({
      ...validRelease, publishableKeySha256: undefined,
    }))).rejects.toThrow("different Supabase publishable key");
    await expect(checkDeployment("https://example.com", revision, backendOrigin, mockFetch({
      ...validRelease, publishableKeySha256: createHash("sha256").update("another-key").digest("hex"),
    }))).rejects.toThrow("different Supabase publishable key");
    await expect(verifyDeployment("https://example.com", revision, backendOrigin, "", validRelease, mockFetch(validRelease)))
      .rejects.toThrow("Expected Supabase publishable key is required");
  });

  it("rejects a missing, dirty, or mismatched local reference build", async () => {
    const fetch = mockFetch(validRelease);
    await expect(verifyDeployment("https://example.com", revision, backendOrigin, publishableKey, null, fetch))
      .rejects.toThrow("Local reference build does not match");
    await expect(verifyDeployment("https://example.com", revision, backendOrigin, publishableKey,
      { ...validRelease, dirty: true }, fetch)).rejects.toThrow("Local reference build does not match");
    await expect(verifyDeployment("https://example.com", revision, backendOrigin, publishableKey,
      { ...validRelease, backendOrigin: "https://other.supabase.co" }, fetch))
      .rejects.toThrow("Local reference build does not match");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires an HTTPS backend origin", async () => {
    await expect(checkDeployment("https://example.com", revision, "http://project.supabase.co", mockFetch(validRelease)))
      .rejects.toThrow("Backend URL must be an HTTPS origin");
    await expect(checkDeployment("https://example.com", revision, `${backendOrigin}/path`, mockFetch(validRelease)))
      .rejects.toThrow("Backend URL must be an HTTPS origin");
  });
});
