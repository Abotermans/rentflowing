import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { splitSupabaseMigration } from "./supabase-migration-statements.mjs";

async function getLocalMigrationFiles() {
  const names = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"));
  const files = names.map((name) => {
    const version = /^(\d{14})_[\w-]+\.sql$/.exec(name)?.[1];
    if (!version) throw new Error(`Invalid local migration filename: ${name}`);
    return { name, version };
  });
  const versions = files.map(file => file.version);
  if (new Set(versions).size !== versions.length) {
    throw new Error("Local migration versions are not unique");
  }
  return files.sort((a, b) => a.version.localeCompare(b.version));
}

export async function getLocalMigrationVersions() {
  return (await getLocalMigrationFiles()).map(file => file.version);
}

export async function checkTargetMigrations(backendUrl, managementToken, fetchImpl = fetch) {
  const backend = new URL(backendUrl);
  const projectRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(backend.hostname)?.[1];
  if (backend.protocol !== "https:" || backend.origin !== backendUrl.replace(/\/$/, "") || !projectRef) {
    throw new Error("Backend URL must be a hosted Supabase HTTPS origin");
  }
  if (!managementToken?.trim()) {
    throw new Error("SUPABASE_MANAGEMENT_READ_TOKEN is required for the read-only target-migrations check");
  }

  const localFiles = await getLocalMigrationFiles();
  const localVersions = localFiles.map(file => file.version);
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
    method: "POST",
    headers: { Authorization: `Bearer ${managementToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "SELECT version, md5(array_to_string(statements, E'\\n')) AS content_md5 FROM supabase_migrations.schema_migrations ORDER BY version" }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  if (response.status !== 201) {
    await response.body?.cancel();
    throw new Error(`Cannot check target migrations: HTTP ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.some((row) => typeof row?.version !== "string" || !/^\d{14}$/.test(row.version)
    || (row.content_md5 !== null && row.content_md5 !== undefined
      && (typeof row.content_md5 !== "string" || !/^[a-f0-9]{32}$/.test(row.content_md5))))) {
    throw new Error("Target migration query returned malformed versions");
  }
  const targetVersions = rows.map((row) => row.version);
  if (new Set(targetVersions).size !== targetVersions.length) {
    throw new Error("Target migration query returned duplicate versions");
  }
  const local = new Set(localVersions);
  const target = new Set(targetVersions);
  const missing = localVersions.filter((version) => !target.has(version));
  const unexpected = targetVersions.filter((version) => !local.has(version));
  if (missing.length || unexpected.length) {
    const details = [
      missing.length && `${missing.length} missing (first: ${missing.slice(0, 3).join(", ")})`,
      unexpected.length && `${unexpected.length} unexpected (first: ${unexpected.slice(0, 3).join(", ")})`,
    ].filter(Boolean).join("; ");
    throw new Error(`Target migration history differs from this release: ${details}`);
  }
  const targetHashes = new Map(rows.map(row => [row.version, row.content_md5]));
  for (const file of localFiles) {
    const bytes = await readFile(new URL(`../supabase/migrations/${file.name}`, import.meta.url));
    const rawHash = createHash("md5").update(bytes).digest("hex");
    const statementsHash = createHash("md5").update(splitSupabaseMigration(bytes.toString("utf8")).join("\n")).digest("hex");
    if (targetHashes.get(file.version) !== rawHash && targetHashes.get(file.version) !== statementsHash) {
      throw new Error(`Target migration ${file.version} has missing or changed SQL content`);
    }
  }
  return localVersions.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backendUrl = process.argv[2];
  if (!backendUrl) {
    console.error("Usage: npm run check:target-migrations -- <supabase-https-origin>");
    process.exit(2);
  }
  try {
    const count = await checkTargetMigrations(backendUrl, process.env.SUPABASE_MANAGEMENT_READ_TOKEN);
    console.log(`${backendUrl}: ${count} migration versions match this release`);
  } catch (error) {
    console.error(`Target migration check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
