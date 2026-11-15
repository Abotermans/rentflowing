import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "supabase/functions/_shared/server-jobs.js");
const entry = `
export { collectRowsById, isValidBusinessDate, runDueReceivableJob } from "./src/lib/serverReceivableJob.ts";
export { runDueAmendmentJob } from "./src/lib/serverAmendmentJob.ts";
export { isCompleteAmendmentActivationResponse } from "./src/lib/serverAmendmentActivation.ts";
export { calendarDateISO } from "./src/lib/calendarToday.ts";
export { DEFAULT_BUSINESS_TIME_ZONE } from "./src/lib/businessTimeZone.ts";
export { parseScheduledBusinessInstant } from "./src/lib/scheduledBusinessInstant.ts";
export { hasScheduledJobSecret, isConfiguredScheduledJobSecret } from "./src/lib/scheduledJobAuth.ts";
export { removeStorageFileIfPresent, runDocumentFileCleanup } from "./src/lib/serverDocumentCleanup.ts";
`;

const result = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "server-jobs-entry.ts", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  metafile: true,
  logLevel: "error",
});
if (result.outputFiles.length !== 1 || Object.keys(result.metafile.outputs).some((path) =>
  result.metafile.outputs[path].imports.length > 0)) {
  throw new Error("The scheduled Edge runtime must be a single self-contained module.");
}
const generated = result.outputFiles[0].text;
if (process.argv.includes("--check")) {
  const committed = await readFile(outputPath, "utf8").catch(() => "");
  if (committed !== generated) throw new Error("Edge shared runtime is stale; run npm run build:edge-shared.");
  console.log("Edge shared runtime matches its source.");
} else {
  await writeFile(outputPath, generated);
  console.log(`Built Edge shared runtime (${generated.length} bytes).`);
}
