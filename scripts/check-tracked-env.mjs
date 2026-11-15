import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const allowedKeys = new Set([
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
]);

export function isTrackedRuntimeEnv(path) {
  const name = path.split("/").at(-1);
  return /^\.env(?:\..+)?$/.test(name) && name !== ".env.example";
}

export function checkTrackedEnvContents(files) {
  for (const { path, content } of files) {
    const values = new Map();
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const field = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (!field || !allowedKeys.has(field[1]) || values.has(field[1])) {
        throw new Error(`${path}:${index + 1} contains an unexpected or repeated environment field`);
      }
      const raw = field[2].trim();
      const value = ((raw.startsWith('"') && raw.endsWith('"'))
        || (raw.startsWith("'") && raw.endsWith("'"))) ? raw.slice(1, -1) : raw;
      values.set(field[1], value);
    }

    const endpoint = values.get("VITE_SUPABASE_URL");
    if (endpoint !== undefined) {
      let valid = false;
      try {
        const parsed = new URL(endpoint);
        valid = parsed.protocol === "https:" && parsed.origin === endpoint
          && /^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname);
      } catch { /* Invalid URLs are rejected below. */ }
      if (!valid) throw new Error(`${path} contains an invalid public Supabase URL`);
    }
    const projectId = values.get("VITE_SUPABASE_PROJECT_ID");
    if (projectId !== undefined && (!/^[a-z0-9]{20}$/.test(projectId)
      || (endpoint && new URL(endpoint).hostname !== `${projectId}.supabase.co`))) {
      throw new Error(`${path} contains a mismatched Supabase project ID`);
    }
    const key = values.get("VITE_SUPABASE_PUBLISHABLE_KEY");
    if (key !== undefined && !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) {
      throw new Error(`${path} contains a non-publishable Supabase key`);
    }
  }
  return files.length;
}

export async function checkTrackedEnv() {
  const paths = execFileSync("git", ["ls-files", "--cached", "-z"], { encoding: "utf8" })
    .split("\0").filter(isTrackedRuntimeEnv);
  const files = await Promise.all(paths.map(async path => ({ path, content: await readFile(path, "utf8") })));
  return checkTrackedEnvContents(files);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const count = await checkTrackedEnv();
    console.log(`Checked ${count} tracked runtime environment file(s) for public-only fields`);
  } catch (error) {
    console.error(`Tracked environment check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
