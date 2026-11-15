import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const requiredDocumentChecks = [
  "documents_missing_file",
  "unreferenced_stored_files",
  "queued_files_still_referenced",
  "shared_document_file_paths",
];

export async function checkTargetDocuments(backendUrl, managementToken, fetchImpl = fetch) {
  const backend = new URL(backendUrl);
  const projectRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(backend.hostname)?.[1];
  if (backend.protocol !== "https:" || backend.origin !== backendUrl.replace(/\/$/, "") || !projectRef) {
    throw new Error("Backend URL must be a hosted Supabase HTTPS origin");
  }
  if (!managementToken?.trim()) {
    throw new Error("SUPABASE_MANAGEMENT_READ_TOKEN is required for the read-only document check");
  }

  const query = await readFile(new URL("./audit-document-storage-consistency.sql", import.meta.url), "utf8");
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
    method: "POST",
    headers: { Authorization: `Bearer ${managementToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  if (response.status !== 201) {
    await response.body?.cancel();
    throw new Error(`Cannot audit target documents: HTTP ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== requiredDocumentChecks.length) {
    throw new Error("Target document audit returned an incomplete result");
  }
  const required = new Set(requiredDocumentChecks);
  const seen = new Set();
  const failures = [];
  for (const row of rows) {
    if (!required.has(row?.check_name) || seen.has(row.check_name)) {
      throw new Error("Target document audit returned unexpected or repeated checks");
    }
    seen.add(row.check_name);
    if ((typeof row.affected !== "string" && typeof row.affected !== "number")
      || !Number.isSafeInteger(Number(row.affected)) || Number(row.affected) < 0) {
      throw new Error(`Target document audit returned an invalid count for ${row.check_name}`);
    }
    if (Number(row.affected) > 0) failures.push(`${row.check_name}: ${row.affected}`);
  }
  if (failures.length) throw new Error(`Target document audit failed: ${failures.join(", ")}`);
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backendUrl = process.argv[2];
  if (!backendUrl) {
    console.error("Usage: npm run check:target-documents -- <supabase-https-origin>");
    process.exit(2);
  }
  try {
    const count = await checkTargetDocuments(backendUrl, process.env.SUPABASE_MANAGEMENT_READ_TOKEN);
    console.log(`${backendUrl}: ${count} document storage checks passed`);
  } catch (error) {
    console.error(`Target document check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
