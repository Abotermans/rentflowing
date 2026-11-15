// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { checkBackendFunctions, scheduleQuery } from "../../scripts/check-backend-functions.mjs";

const backend = "https://abcdefghijklmnopqrst.supabase.co";
const token = "read-only-token";
const deployed = [
  { slug: "advance-receivables", status: "ACTIVE", verify_jwt: false },
  { slug: "cleanup-lease-document-files", status: "ACTIVE", verify_jwt: false },
];
const successfulJobs = () => deployed.map(({ slug }) => ({
  job_name: slug, last_succeeded_at: new Date().toISOString(),
}));
const activeCronJobs = () => deployed.map(({ slug }) => ({ job_name: slug, active_jobs: "1", ready_jobs: "1" }));

describe("scheduled backend function deployment check", () => {
  it("counts only hourly jobs with the exact project endpoint in PostgreSQL", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE SCHEMA cron;
        CREATE TABLE cron.job (jobid integer, active boolean, schedule text, command text);
        INSERT INTO cron.job VALUES
          (1, true, '5 * * * *', 'SELECT net.http_post(url := ''https://abcdefghijklmnopqrst.supabase.co/functions/v1/advance-receivables'', headers := jsonb_build_object(''apikey'', (SELECT decrypted_secret FROM vault.decrypted_secrets), ''X-Cron-Secret'', (SELECT decrypted_secret FROM vault.decrypted_secrets)))'),
          (2, true, '5 * * * *', 'SELECT net.http_post(url := ''https://otherprojectabcdef.supabase.co/functions/v1/advance-receivables'')'),
          (3, true, '*/5 * * * *', 'SELECT net.http_post(url := ''https://abcdefghijklmnopqrst.supabase.co/functions/v1/cleanup-lease-document-files'')'),
          (4, true, '5 * * * *', 'SELECT net.http_get(url := ''https://abcdefghijklmnopqrst.supabase.co/functions/v1/cleanup-lease-document-files'')'),
          (5, true, '5 * * * *', 'SELECT net.http_post(url := ''https://abcdefghijklmnopqrst.supabase.co/functions/v1/cleanup-lease-document-files'')'),
          (6, true, '5 * * * *', 'SELECT net.http_post(url := ''https://abcdefghijklmnopqrst.supabase.co/functions/v1/cleanup-lease-document-files'', headers := jsonb_build_object(''apikey'', ''public-key'', ''X-Cron-Secret'', ''literal-secret''))'),
          (7, true, '5 * * * *', 'SELECT net.http_post(url := ''https://abcdefghijklmnopqrst.supabase.co/functions/v1/cleanup-lease-document-files'', headers := jsonb_build_object(''apikey'', (SELECT decrypted_secret FROM vault.decrypted_secrets), ''X-Cron-Secret'', (SELECT decrypted_secret FROM vault.decrypted_secrets)))');
      `);
      const rows = (await db.query<{ job_name: string; active_jobs: string; ready_jobs: string }>(
        scheduleQuery("abcdefghijklmnopqrst"),
      )).rows;
      expect(rows.map((row) => [row.job_name, Number(row.active_jobs), Number(row.ready_jobs)])).toEqual([
        ["advance-receivables", 2, 1],
        ["cleanup-lease-document-files", 5, 1],
      ]);
    } finally {
      await db.close();
    }
  });

  it("accepts active functions with recent success and active Cron jobs without invoking either handler", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(Response.json(successfulJobs(), { status: 201 }))
      .mockResolvedValueOnce(Response.json(activeCronJobs(), { status: 201 }));

    await expect(checkBackendFunctions(backend, token, fetch)).resolves.toEqual([
      "advance-receivables", "cleanup-lease-document-files",
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[0][0]).toBe("https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/functions");
    expect(fetch.mock.calls[0][1].method).toBe("GET");
    expect(fetch.mock.calls[1][0]).toBe("https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/query/read-only");
    expect(fetch.mock.calls[1][1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ query: expect.stringContaining("public.scheduled_job_health") });
    expect(fetch.mock.calls[2][0]).toBe("https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/query/read-only");
    const cronQuery = JSON.parse(fetch.mock.calls[2][1].body).query;
    expect(cronQuery).toContain("cron.job");
    expect(cronQuery).toContain("https://abcdefghijklmnopqrst.supabase.co/functions/v1/");
    expect(cronQuery).toContain("job.schedule ~");
    expect(fetch.mock.calls.every(([url]) => !String(url).includes("/functions/v1/"))).toBe(true);
  });

  it("requires a scoped management token before any network call", async () => {
    const fetch = vi.fn();
    await expect(checkBackendFunctions(backend, "", fetch)).rejects.toThrow("SUPABASE_MANAGEMENT_READ_TOKEN");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports missing and inactive functions", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json([{ slug: "cleanup-lease-document-files", status: "INACTIVE" }]))
      .mockResolvedValueOnce(Response.json(successfulJobs(), { status: 201 }))
      .mockResolvedValueOnce(Response.json(activeCronJobs(), { status: 201 }));

    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow(
      "advance-receivables: not deployed, cleanup-lease-document-files: not active",
    );
  });

  it("rejects an active job whose gateway still requires a JWT", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json([{ ...deployed[0], verify_jwt: true }, deployed[1]]))
      .mockResolvedValueOnce(Response.json(successfulJobs(), { status: 201 }))
      .mockResolvedValueOnce(Response.json(activeCronJobs(), { status: 201 }));
    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow(
      "advance-receivables: JWT verification is enabled",
    );
  });

  it("rejects absent and stale success timestamps", async () => {
    const stale = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(Response.json([{ job_name: "cleanup-lease-document-files", last_succeeded_at: stale }], { status: 201 }))
      .mockResolvedValueOnce(Response.json(activeCronJobs(), { status: 201 }));

    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow(
      "advance-receivables: missing or stale last success, cleanup-lease-document-files: missing or stale last success",
    );
  });

  it("rejects a denied metadata lookup without probing the functions", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow("function metadata: HTTP 403");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing health table or an undocumented response shape", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow("scheduled job health: HTTP 500");

    fetch.mockReset().mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(Response.json({ rows: successfulJobs() }, { status: 201 }));
    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow("Invalid scheduled job health response");
  });

  it("rejects malformed deployed function metadata", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ functions: deployed }));
    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow("Invalid deployed function metadata response");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects absent or inactive Cron jobs even after a recent success", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(Response.json(successfulJobs(), { status: 201 }))
      .mockResolvedValueOnce(Response.json([{ job_name: "advance-receivables", active_jobs: "0", ready_jobs: "0" }], { status: 201 }));
    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow(
      "advance-receivables: no active Cron job, cleanup-lease-document-files: no active Cron job",
    );
  });

  it("rejects a job aimed at another project or running at the wrong frequency", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(Response.json(successfulJobs(), { status: 201 }))
      .mockResolvedValueOnce(Response.json(activeCronJobs().map((row) => ({ ...row, ready_jobs: "0" })), { status: 201 }));

    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow(
      "advance-receivables: expected one active authenticated hourly POST Cron job targeting this project",
    );
  });

  it("rejects duplicate active jobs for a scheduled function", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(Response.json(successfulJobs(), { status: 201 }))
      .mockResolvedValueOnce(Response.json([
        { job_name: "advance-receivables", active_jobs: "2", ready_jobs: "2" },
        activeCronJobs()[1],
      ], { status: 201 }));

    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow(
      "advance-receivables: expected one active authenticated hourly POST Cron job targeting this project",
    );
  });

  it("fails closed if Cron metadata is unavailable or malformed", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(Response.json(successfulJobs(), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow("scheduled Cron jobs: HTTP 500");

    fetch.mockReset().mockResolvedValueOnce(Response.json(deployed))
      .mockResolvedValueOnce(Response.json(successfulJobs(), { status: 201 }))
      .mockResolvedValueOnce(Response.json([{ job_name: "advance-receivables", active_jobs: "not-a-number" }], { status: 201 }));
    await expect(checkBackendFunctions(backend, token, fetch)).rejects.toThrow("Invalid scheduled Cron job response");
  });

  it("rejects an insecure URL, custom host, or backend path", async () => {
    const fetch = vi.fn();

    await expect(checkBackendFunctions("http://abcdefghijklmnopqrst.supabase.co", token, fetch)).rejects.toThrow("HTTPS origin");
    await expect(checkBackendFunctions("https://example.com", token, fetch)).rejects.toThrow("HTTPS origin");
    await expect(checkBackendFunctions(`${backend}/functions`, token, fetch)).rejects.toThrow("HTTPS origin");
    expect(fetch).not.toHaveBeenCalled();
  });
});
