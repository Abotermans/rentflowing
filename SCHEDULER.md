# Lease and receivable scheduler deployment

## Managed Lovable authentication (prepared, not deployed)

The platform's `rebind_secrets` capability with `credential: cron_auth` has
provisioned managed scheduler authentication. It supplies `LOVABLE_CRON_SECRET`
and optionally `LOVABLE_CRON_SECRET_PREVIOUS` during rotation. No credential
value needs to pass through a person, application source, or a SQL query.
The generated `_shared/cron-auth.ts` helper is copied unchanged from Lovable.
The local handlers now authenticate its `Authorization: Bearer` credential
before accessing application data. A wrapper also rejects short server-side
credentials. Neither public API keys nor user JWTs authorize these jobs.

Managed callbacks can send `{}`. Billing captures the server clock once when
`businessInstant` is absent; an explicit timestamp is still subject to the
existing strict UTC format and fifteen-minute freshness guard. Null and
malformed bodies/timestamps are rejected, not silently replaced. Each
property's stored time zone still determines its business date.

These changes do not introduce runtime AI. Contract dates, applied amendments,
rent formulas, assignment windows, lead time, and duplicate guards determine
the output. Document deletion queues an exact storage path transactionally;
the cleanup worker retries those queued operations. Cron supplies the known
time event so processing does not depend on an open browser.

**Deployment is blocked:** the Lovable workspace ran out of credits after
provisioning authentication. The deployed functions and two paused jobs still
use the earlier `X-Cron-Secret` configuration described below. No dispatch has
run. Do not enable them before deploying the new handlers and converting
their schedules using Lovable's managed scheduling tools. If those tools
cannot edit paused unmanaged jobs, create replacements with a non-due future
schedule, pause them, then change to the hourly schedule while paused. Never
briefly create active hourly jobs. The read-only backend checker still expects
the old Vault command and intentionally cannot attest managed schedules yet;
update it against the actual managed metadata contract before acceptance.

## Earlier manual deployment procedure

This is a deployment procedure, not evidence that a production job exists.
Follow `RELEASE.md` first: verify a restorable database-and-storage backup,
reconcile migrations, and settle the portfolio/property business time-zone
policy before enabling automatic writes.

On the current Lovable target, the two hourly jobs already exist but are
paused. `SCHEDULED_JOB_SECRET` is configured for Edge Functions only. The
matching `scheduled_job_secret` is not yet in Postgres Vault; the two stores
are independent. Do not enable either job merely because its Edge secret is
present. Lovable's Jobs screen can confirm the paused state and run history;
the jobs were created through SQL. See `RELEASE.md` for the current gate.

The Edge Function `advance-receivables` activates due amendments first, calls
the service-only lease lifecycle routine, then generates rent and charge cycles
with the same TypeScript calculators used by the app. Amendment activation uses
the same planner as the interface and one atomic SQL RPC for its lease,
assignments, tenants, and future receivables. Its SQL insertion RPC skips an existing schedule
slot without modifying a paid or allocated receivable. An incomplete signed or
active lease (for example, no persisted main-unit assignment for the lease's
property, or only a parking/storage assignment) yields HTTP 409 after
processing the other leases. A failed amendment also yields HTTP 409 and blocks
later amendments of that same lease in that run. It now stops the job before
lease lifecycle transitions or receivable generation, so a cycle cannot be
issued on terms that a due amendment failed to apply. Earlier successful
amendments in the same run remain committed; investigate the incomplete IDs
and retry before accepting a successful billing run.
A lease-specific schedule or property-date calculation failure is likewise
reported as an incomplete lease while other valid leases continue. A database
insertion failure is not downgraded to an incomplete lease: the job fails so
the operator can retry after restoring persistence. The job also rejects a
missing or invalid insertion count from the database instead of recording a
successful run; zero inserted rows is valid when all slots already exist.

The separate `cleanup-lease-document-files` function drains a durable queue
created in the same transaction as every document-row deletion. The dialog
also attempts immediate file removal, but the queue makes that best-effort
request recoverable. The worker checks Storage again after a successful
deletion response and retains the queue row if the file is still present or
the verification fails. The database accepts only one file-name segment inside
each new document folder, and the worker quarantines legacy paths with nested,
encoded, or traversal-like segments. Those queue rows require an administrator
to inspect the original document
and storage object before manual cleanup.

## Install

1. Apply every migration in `supabase/migrations` in filename order on a
   restored staging copy, then on the approved target. Do not stop at the
   lifecycle time-zone migration: the later billing-slot and paid-receivable
   guards and `scheduled_job_health` table are required before accepting payments. The atomic
   amendment activation, lifecycle, portfolio lead-time, duplicate guard,
   insertion, and service-role grant migrations must all exist before the
   function is called.
2. Deploy `supabase/functions/advance-receivables` with its
   `verify_jwt = false` function setting. The handler requires a dedicated
   `SCHEDULED_JOB_SECRET` sent in `X-Cron-Secret`; do not use the browser's
   publishable key as this secret. Give the Edge Function and the scheduler
   the same random value of at least 32 ASCII characters through Edge secrets
   and Supabase Vault. A missing or shorter configured secret now returns
   HTTP 503 without running either job; an incorrect request secret returns
   HTTP 401.
3. Enable `pg_cron` and `pg_net` on the target. Put the non-secret project URL
   literally in each Cron command so the read-only release check can verify
   the destination. Store the public API key (gateway routing only) and cron
   secret in Vault. Use one active hourly Cron job per function with an
   explicit five-field expression such as `5 * * * *`. Schedule an
   hourly POST to `/functions/v1/advance-receivables` with a JSON body such
   as `{"businessInstant":"2026-10-17T22:05:00Z"}`. Generate this UTC instant
   at dispatch time. The function rejects a value more than 15 minutes away
   from its server clock, so a stale or future-dated request cannot advance
   lease state. The function derives each property's local calendar date
   from its persisted IANA time zone; do not send a single portfolio date.
4. Send `Content-Type: application/json`, `apikey: <publishable key>`, and
   `X-Cron-Secret: <secret>` headers. Do not put the secret, service-role key,
   or an authenticated user's token in SQL source control or logs.
5. Inspect the HTTP response and Edge logs, not just `cron.job_run_details`:
   a successful Cron execution only proves that `pg_net` queued the request.
   Alert on non-200 responses, missed runs, unexpected row counts, or any
   `incompleteLeaseIds` or `amendments.incompleteAmendmentIds`. Retain the job
   result and a runbook for retry. Retry promptly with the same instant to
   check idempotence; after 15 minutes, dispatch a new current instant instead.
   Investigate every incomplete ID before accepting a run.
   A completed HTTP 200 run records its completion in the service-only
   `scheduled_job_health` table. HTTP 409/500 does not refresh that timestamp.
   The read-only release probe requires a successful run within three hours;
   it will fail before the first successful dispatch or after missed runs.

[Supabase's scheduling guide](https://supabase.com/docs/guides/functions/schedule-functions)
documents the Cron + `pg_net` + Vault pattern. Its
[Cron monitoring guide](https://supabase.com/docs/guides/cron) describes run
history. Confirm Lovable Cloud exposes the required controls before relying
on this design.

## Document file cleanup

1. After the restored-staging rehearsal, apply
   `20261018210000_queue_lease_document_file_deletions.sql` after the
   contractual-document migration. Confirm ordinary browser users cannot
   read or edit `lease_document_file_deletions`. Run
   `scripts/audit-document-storage-paths.sql` and
   `scripts/audit-document-path-collisions.sql` on staging. Resolve every
   shared path, then apply
   `20261107160000_unique_lease_document_storage_paths.sql` before enabling
   deletion. Quarantine unexpected legacy paths until their original file
   ownership is verified.
2. Deploy `cleanup-lease-document-files` with `verify_jwt = false` and the
   same `SCHEDULED_JOB_SECRET` used by the other scheduled function. Schedule
   an hourly POST with `apikey` and `X-Cron-Secret`; no JSON body is needed.
3. Alert on a non-200 response, missing hourly run, or queue rows with a
   growing `attempts` value. HTTP 409 reports failed IDs or a remaining
   backlog; each invocation processes at most 100 paths. Never-tried paths
   are processed before repeatedly failing paths so a malformed legacy row
   cannot indefinitely delay newer deletions. Do not manually
   delete a malformed path until its scope and file owner are verified.
4. On staging, delete a supporting document and a signed initial contract,
   interrupt the browser before its storage request, then run the worker.
   Confirm the correct private files disappear, the queue empties, a second
   run is harmless, and the initial-contract lease transition remains intact.
   Verify a duplicate path and an attempted path change are rejected. A
   malformed legacy path must produce HTTP 409 without deleting any object.
   Reject a missing or wrong secret with HTTP 401.

## Acceptance check

- Run `npm run check:backend-functions -- <supabase-https-origin>` after
  deployment and the first successful dispatch. Set
  `SUPABASE_MANAGEMENT_READ_TOKEN` to a project-scoped token with
  `edge_functions_read` and `database_read`. Store it only in a secret; this
  scope can read more than the health table. The check reads deployment
  metadata (including `verify_jwt = false`) and `public.scheduled_job_health` through the Management API's
  read-only SQL endpoint; it does not invoke either job. Both functions must
  be active, have a success timestamp no older than three hours, and have
  exactly one active hourly `cron.job` entry containing this project's literal
  endpoint URL, `net.http_post`, both required header names, and a Vault
  secret lookup. Missing access, health rows, recent runs, or `pg_cron` fails
  the check. The command check is textual and cannot prove that the correct
  Vault values are used; inspect the actual Cron command, run history, and
  HTTP responses to prove that dispatch succeeds.
- The function endpoints intentionally return HTTP 405 for GET and other
  non-POST requests. Health is read from function metadata and the service-only
  job-health table by the deployment check; no anonymous health endpoint is
  exposed.
- After uploads have been quiet for at least an hour, run
  `npm run check:target-documents -- <supabase-https-origin>` with the same
  project-scoped read-only token. It compares document rows, Storage objects,
  and pending deletions without altering any file.
- With the app closed, run the function for a fixture portfolio at a recorded
  UTC instant. Confirm a scheduled amendment activates first, updates its
  lease and assignments, replaces only unallocated future receivables, and
  leaves paid or allocated rows intact. Confirm lifecycle history and the
  expected rent/charge rows.
- Repeat the same instant. It must insert zero new rows and preserve paid and
  allocated receivables byte-for-byte.
- Verify monthly, six-month advance, all-inclusive, indexation, open-ended,
  ended, and effective-date formula-amendment cases against the UI schedule.
- Schedule two amendments on one lease. Verify effective-date and amendment-number
  order; if the first fails, the second must remain scheduled and both IDs must
  be reported as incomplete. Verify the next run catches up after repair.
- Verify a malformed lease produces HTTP 409 with its ID, but does not create
  an orphan receivable. Resolve the malformed lease before go-live.
- Reject an unauthenticated or wrong-secret request with HTTP 401. Confirm a
  normal authenticated browser user cannot call the service-only RPCs.
- Restore the latest backup in isolation and re-run once to prove recovery.
- At an instant where Paris has crossed midnight and London has not, confirm
  only the Paris property's due amendment, lifecycle change, and receivables
  advance. Repeat after London's midnight and verify its work then advances.
