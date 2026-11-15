import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
import { loadLocalRelease } from "./check-deployment.mjs";
import { resolveReleaseRevision } from "./release-provenance.mjs";

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const revision = resolveReleaseRevision(
  git("rev-parse", "HEAD"), process.env.GITHUB_SHA, process.env.CF_PAGES_COMMIT_SHA,
);
const status = git("status", "--porcelain", "--untracked-files=normal");
const index = await readFile(new URL("../dist/index.html", import.meta.url));
const buildEnv = loadEnv("production", process.cwd(), "VITE_");
const backendOrigin = new URL(buildEnv.VITE_SUPABASE_URL).origin;
const publishableKeySha256 = createHash("sha256")
  .update(buildEnv.VITE_SUPABASE_PUBLISHABLE_KEY).digest("hex");
const manifest = JSON.parse(await readFile(new URL("../dist/.vite/manifest.json", import.meta.url), "utf8"));
const assetPaths = new Set(["security/replay-guard.js", "favicon.ico", "robots.txt", "placeholder.svg"]);
for (const entry of Object.values(manifest)) {
  if (entry.file) assetPaths.add(entry.file);
  for (const path of entry.css ?? []) assetPaths.add(path);
  for (const path of entry.assets ?? []) assetPaths.add(path);
}
const assetSha256 = Object.fromEntries(await Promise.all([...assetPaths].sort().map(async (path) => {
  if (!/^(?:(?:assets\/|security\/)[\w./-]+|favicon\.ico|robots\.txt|placeholder\.svg)$/.test(path)
    || path.split("/").includes("..")) {
    throw new Error(`Invalid build asset path: ${path}`);
  }
  const bytes = await readFile(new URL(`../dist/${path}`, import.meta.url));
  return [path, createHash("sha256").update(bytes).digest("hex")];
})));
const release = {
  revision,
  dirty: status === null ? null : status.length > 0,
  indexSha256: createHash("sha256").update(index).digest("hex"),
  assetSha256,
  backendOrigin,
  publishableKeySha256,
  builtAt: new Date().toISOString(),
};

await writeFile(new URL("../dist/release.json", import.meta.url), `${JSON.stringify(release, null, 2)}\n`);
await loadLocalRelease();
