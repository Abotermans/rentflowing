import { pathToFileURL } from "node:url";

const requiredFunctions = ["advance-receivables", "cleanup-lease-document-files"];
const maxSuccessAgeMs = 3 * 60 * 60 * 1000;
const healthQuery = `SELECT job_name, last_succeeded_at
  FROM public.scheduled_job_health
  WHERE job_name IN ('advance-receivables', 'cleanup-lease-document-files')`;
export const scheduleQuery = (projectRef) => `SELECT expected.job_name,
    count(job.jobid) FILTER (WHERE job.active) AS active_jobs,
    count(job.jobid) FILTER (
      WHERE job.active
        AND job.schedule ~ '^([0-9]|[1-5][0-9]) [*] [*] [*] [*]$'
        AND job.command LIKE ('%https://${projectRef}.supabase.co/functions/v1/' || expected.job_name || '%')
        AND job.command ILIKE '%net.http_post%'
        AND job.command ILIKE '%apikey%'
        AND job.command ILIKE '%X-Cron-Secret%'
        AND job.command ILIKE '%vault.decrypted_secrets%'
    ) AS ready_jobs
  FROM (VALUES ('advance-receivables'), ('cleanup-lease-document-files')) AS expected(job_name)
  LEFT JOIN cron.job AS job
    ON job.command LIKE ('%/functions/v1/' || expected.job_name || '%')
  GROUP BY expected.job_name`;

const validCount = (value) =>
  (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)))
  && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

export async function checkBackendFunctions(backendUrl, managementToken, fetchImpl = fetch) {
  const backend = new URL(backendUrl);
  const projectRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(backend.hostname)?.[1];
  if (backend.protocol !== "https:" || backend.origin !== backendUrl.replace(/\/$/, "") || !projectRef) {
    throw new Error("Backend URL must be a hosted Supabase HTTPS origin");
  }
  if (!managementToken?.trim()) {
    throw new Error("SUPABASE_MANAGEMENT_READ_TOKEN is required for the non-invoking backend check");
  }

  const base = `https://api.supabase.com/v1/projects/${projectRef}`;
  const headers = { Authorization: `Bearer ${managementToken}` };
  const functionsResponse = await fetchImpl(`${base}/functions`, {
    method: "GET", headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (functionsResponse.status !== 200) {
    await functionsResponse.body?.cancel();
    throw new Error(`Cannot read deployed function metadata: HTTP ${functionsResponse.status}`);
  }
  const deployed = await functionsResponse.json();
  if (!Array.isArray(deployed)) throw new Error("Invalid deployed function metadata response");

  const failures = [];
  for (const name of requiredFunctions) {
    const functionInfo = deployed.find((item) => item?.slug === name);
    if (!functionInfo) failures.push(`${name}: not deployed`);
    else if (functionInfo.status !== "ACTIVE") failures.push(`${name}: not active`);
    else if (functionInfo.verify_jwt !== false) failures.push(`${name}: JWT verification is enabled`);
  }

  const healthResponse = await fetchImpl(`${base}/database/query/read-only`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: healthQuery }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (healthResponse.status !== 201) {
    await healthResponse.body?.cancel();
    throw new Error(`Cannot read scheduled job health: HTTP ${healthResponse.status}`);
  }
  const rows = await healthResponse.json();
  if (!Array.isArray(rows)) throw new Error("Invalid scheduled job health response");

  for (const name of requiredFunctions) {
    const timestamp = rows.find((row) => row?.job_name === name)?.last_succeeded_at;
    const successMs = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    const ageMs = Date.now() - successMs;
    if (!Number.isFinite(ageMs) || ageMs < -5 * 60 * 1000 || ageMs > maxSuccessAgeMs) {
      failures.push(`${name}: missing or stale last success`);
    }
  }
  const scheduleResponse = await fetchImpl(`${base}/database/query/read-only`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: scheduleQuery(projectRef) }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (scheduleResponse.status !== 201) {
    await scheduleResponse.body?.cancel();
    throw new Error(`Cannot read scheduled Cron jobs: HTTP ${scheduleResponse.status}`);
  }
  const schedules = await scheduleResponse.json();
  if (!Array.isArray(schedules)
    || schedules.some((row) => !requiredFunctions.includes(row?.job_name)
      || !validCount(row.active_jobs) || !validCount(row.ready_jobs))
    || new Set(schedules.map((row) => row.job_name)).size !== schedules.length) {
    throw new Error("Invalid scheduled Cron job response");
  }
  for (const name of requiredFunctions) {
    const job = schedules.find((row) => row.job_name === name);
    if (!job || Number(job.active_jobs) === 0) {
      failures.push(`${name}: no active Cron job`);
    } else if (Number(job.active_jobs) !== 1 || Number(job.ready_jobs) !== 1) {
      failures.push(`${name}: expected one active authenticated hourly POST Cron job targeting this project`);
    }
  }
  if (failures.length) throw new Error(`Scheduled functions unavailable: ${failures.join(", ")}`);
  return requiredFunctions;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backendUrl = process.argv[2];
  if (!backendUrl) {
    console.error("Usage: npm run check:backend-functions -- <supabase-https-origin>");
    process.exit(2);
  }
  try {
    const names = await checkBackendFunctions(backendUrl, process.env.SUPABASE_MANAGEMENT_READ_TOKEN);
    console.log(`${backendUrl}: active functions with recent successful jobs: ${names.join(", ")}`);
  } catch (error) {
    console.error(`Backend function check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
