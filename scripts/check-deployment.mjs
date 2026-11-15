import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const sha256Pattern = /^[a-f0-9]{64}$/;

function releaseAssets(release, label) {
  const manifest = release?.assetSha256;
  const assets = manifest && typeof manifest === "object" && !Array.isArray(manifest)
    ? Object.entries(manifest) : [];
  if (!assets.length || !assets.some(([path]) => path.startsWith("assets/"))
    || !["security/replay-guard.js", "favicon.ico", "robots.txt", "placeholder.svg"].every(required =>
      assets.some(([path]) => path === required))
    || assets.some(([path, hash]) =>
      !/^(?:(?:assets\/|security\/)[\w./-]+|favicon\.ico|robots\.txt|placeholder\.svg)$/.test(path)
      || path.split("/").includes("..")
      || typeof hash !== "string" || !sha256Pattern.test(hash))) {
    throw new Error(`${label} has an invalid build asset manifest`);
  }
  return assets;
}

async function listBuildFiles(directory, prefix = "") {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(...await listBuildFiles(join(directory, entry.name), `${relative}/`));
    } else if (entry.isFile()) {
      paths.push(relative);
    } else {
      throw new Error(`Unexpected build entry ${relative}`);
    }
  }
  return paths;
}

export async function loadLocalRelease(distUrl = new URL("../dist/", import.meta.url)) {
  const release = JSON.parse(await readFile(new URL("release.json", distUrl), "utf8"));
  if (typeof release?.indexSha256 !== "string" || !sha256Pattern.test(release.indexSha256)) {
    throw new Error("Local release.json is missing a valid index.html digest");
  }
  const assets = releaseAssets(release, "Local release.json");
  const expectedFiles = new Set([
    "index.html", "release.json", "_headers", ".vite/manifest.json",
    ...assets.map(([path]) => path),
  ]);
  const actualFiles = await listBuildFiles(fileURLToPath(distUrl));
  const unexpected = actualFiles.find(path => !expectedFiles.has(path));
  if (unexpected) throw new Error(`Unexpected build file ${unexpected}; publish only files in the release manifest`);
  const missing = [...expectedFiles].find(path => !actualFiles.includes(path));
  if (missing) throw new Error(`Missing build file ${missing}`);
  if (digest(await readFile(new URL("index.html", distUrl))) !== release.indexSha256) {
    throw new Error("Local index.html does not match the reference build");
  }
  for (const [path, hash] of assets) {
    if (digest(await readFile(new URL(path, distUrl))) !== hash) {
      throw new Error(`Local asset ${path} does not match the reference build`);
    }
  }
  return release;
}

export async function checkDeployment(urlInput, expectedRevision, expectedBackendOrigin,
  expectedPublishableKey, localRelease, fetchImpl = fetch) {
  const requested = new URL(urlInput);
  if (requested.protocol !== "https:") throw new Error("Production URL must use HTTPS");
  if (requested.pathname !== "/" || requested.search || requested.hash
    || requested.username || requested.password) {
    throw new Error("Production URL must be the published site origin");
  }
  const base = new URL(requested.origin);
  const backend = new URL(expectedBackendOrigin);
  if (backend.protocol !== "https:" || backend.href !== `${backend.origin}/`) {
    throw new Error("Backend URL must be an HTTPS origin");
  }
  if (!expectedPublishableKey?.trim()) {
    throw new Error("Expected Supabase publishable key is required");
  }
  const expectedKeyDigest = digest(expectedPublishableKey);
  if (!localRelease || localRelease.revision !== expectedRevision || localRelease.dirty !== false
    || localRelease.backendOrigin !== backend.origin
    || localRelease.publishableKeySha256 !== expectedKeyDigest
    || typeof localRelease.indexSha256 !== "string" || !sha256Pattern.test(localRelease.indexSha256)) {
    throw new Error("Local reference build does not match the expected clean revision, backend, and key");
  }
  const localAssets = releaseAssets(localRelease, "Local release.json");
  const url = new URL("release.json", base);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetchImpl(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`release.json returned HTTP ${response.status}`);
    const cacheDirectives = (response.headers.get("cache-control") ?? "")
      .split(",").map(part => part.trim().toLowerCase());
    if (!cacheDirectives.includes("no-store")) {
      throw new Error("release.json must be served with Cache-Control: no-store");
    }
    if (new URL(response.url).origin !== url.origin) {
      throw new Error(`release.json redirected to a different origin: ${new URL(response.url).origin}`);
    }
    const release = await response.json();
    if (release.revision !== expectedRevision) {
      throw new Error(`Expected revision ${expectedRevision}, received ${release.revision ?? "none"}`);
    }
    if (release.dirty !== false) {
      throw new Error(`Release ${expectedRevision} was not built from a clean checkout`);
    }
    if (release.backendOrigin !== backend.origin) {
      throw new Error(`Published app uses backend ${release.backendOrigin ?? "none"}, expected ${backend.origin}`);
    }
    if (release.publishableKeySha256 !== expectedKeyDigest) {
      throw new Error("Published app uses a different Supabase publishable key");
    }
    if (typeof release.indexSha256 !== "string" || !sha256Pattern.test(release.indexSha256)) {
      throw new Error("release.json is missing a valid index.html digest");
    }
    const assets = releaseAssets(release, "release.json");
    if (release.indexSha256 !== localRelease.indexSha256) {
      throw new Error("Published index.html differs from the independently built revision");
    }
    if (assets.length !== localAssets.length
      || assets.some(([path, hash]) => localRelease.assetSha256[path] !== hash)) {
      throw new Error("Published asset manifest differs from the independently built revision");
    }
    const indexResponse = await fetchImpl(base, { signal: controller.signal, cache: "no-store" });
    if (!indexResponse.ok) throw new Error(`Published application returned HTTP ${indexResponse.status}`);
    if (new URL(indexResponse.url).origin !== url.origin) {
      throw new Error(`Published application redirected to a different origin: ${new URL(indexResponse.url).origin}`);
    }
    const indexDigest = digest(Buffer.from(await indexResponse.arrayBuffer()));
    if (indexDigest !== release.indexSha256) {
      throw new Error("Published index.html does not match the release build");
    }
    let nextAsset = 0;
    await Promise.all(Array.from({ length: Math.min(8, assets.length) }, async () => {
      while (nextAsset < assets.length) {
        const [path, expectedDigest] = assets[nextAsset++];
        const assetUrl = new URL(path, new URL("/", base));
        const assetResponse = await fetchImpl(assetUrl, {
          signal: controller.signal, cache: "no-store", redirect: "manual",
        });
        if (!assetResponse.ok || new URL(assetResponse.url).origin !== url.origin) {
          throw new Error(`Published asset ${path} is unavailable (HTTP ${assetResponse.status})`);
        }
        const contentType = (assetResponse.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
        if ((path.endsWith(".js") && !["text/javascript", "application/javascript"].includes(contentType))
          || (path.endsWith(".css") && contentType !== "text/css")) {
          throw new Error(`Published asset ${path} has an invalid content type`);
        }
        const publishedDigest = digest(Buffer.from(await assetResponse.arrayBuffer()));
        if (publishedDigest !== expectedDigest) {
          throw new Error(`Published asset ${path} does not match the release build`);
        }
      }
    }));
    return url.origin;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [urlInput, expectedRevision, expectedBackendOrigin] = process.argv.slice(2);
  if (!urlInput || !expectedRevision || !expectedBackendOrigin) {
    console.error("Usage: VITE_SUPABASE_PUBLISHABLE_KEY=<key> npm run check:deployment -- <published-url> <expected-commit-sha> <supabase-https-origin>");
    process.exit(2);
  }
  try {
    const localRelease = await loadLocalRelease();
    const origin = await checkDeployment(urlInput, expectedRevision, expectedBackendOrigin,
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY, localRelease);
    console.log(`${origin}: verified clean release ${expectedRevision} using ${expectedBackendOrigin}`);
  } catch (error) {
    console.error(`Deployment check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
