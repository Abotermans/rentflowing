-- A deployed handler is not evidence that Cron is dispatching it. Keep a
-- service-only record of completed runs for the release readiness probe.
CREATE TABLE public.scheduled_job_health (
  job_name text PRIMARY KEY CHECK (job_name IN (
    'advance-receivables', 'cleanup-lease-document-files'
  )),
  last_succeeded_at timestamptz NOT NULL
);

ALTER TABLE public.scheduled_job_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_job_health FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scheduled_job_health TO service_role;

NOTIFY pgrst, 'reload schema';
