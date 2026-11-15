# Production release gate

## Current release decision (2026-11-15)

**NO-GO.** This file is a chronological audit record; older counts and
instructions below describe the state at their recorded time and do not
supersede this section or the more recent entries immediately following it.

## Release branch and Edge deployment check (2026-11-15)

The clean candidate is PR #1, branch `codex/release-20261115`. Its current CI
run passed 924 tests in 164 files, lint, TypeScript, build, migration checks,
and Deno checks. The owner subsequently published revision `50904f9`; its
`/release.json` now returns HTTP 200 with that revision and `dirty: false`.
The final managed-handler integration below is newer and not deployed.
An initial Lovable deployment found a real packaging bug:
the two scheduled Edge functions imported application modules outside
`supabase/functions`, which Lovable's deploy bundler could not resolve. The
candidate now contains a reproducibly generated, self-contained shared Edge
module and CI checks that it matches its source. The corrected build passed
CI and Lovable deployed both scheduled functions from commit `1cd2410`; the
Lovable function list shows both as Active. Deployment does not prove that a
scheduled invocation succeeds.

The target has `pg_cron` and `pg_net` installed. Two hourly Cron jobs are
registered but paused, and `scheduled_job_health` has no successes. The owner
provisioned Lovable's managed scheduler credential without exposing its value.
The deployed handlers and paused jobs still use the old, incomplete manual
secret configuration. Do not enable scheduled billing until managed handler
deployment, schedule conversion, and the remaining release gates have
been checked. The Lovable agent's separate backend-connection edit commit was
merged into the release branch without overwriting application changes. The
public Lovable host still lacks required security headers, although the
release marker is now present.
The release decision remains **NO-GO**.

| Gate | Current evidence | Release action |
| --- | --- | --- |
| Local source | The release-branch CI passed 924 tests across 164 files, lint, TypeScript, build, migration checks, and Deno checks | Review PR #1 before merge |
| Backend | Lovable has all 126 local migrations with matching SQL hashes; all 56 schema-capability checks pass; managed credential provisioned and two hourly jobs paused | Deploy managed handlers, convert schedules, then test and observe authenticated dispatch |
| Security | The 56-check target attestation passes after revoking explicit client grants on trigger functions | Verify policies through real owner/editor/viewer sessions and retest the published host |
| Data | The full 51-check financial audit and all 22 historical-data preflights have zero nonzero findings | Run end-to-end billing and amendment tests on the release candidate |
| Host | Lovable serves revision `50904f9` and its release marker, but required CSP, frame, robots, and permissions headers still fail verification | Keep Lovable as requested; resolve host header support and verify the final published revision |
| User journeys | Authenticated Demo/QA read-only browsing and the indexation amendment form load locally; automated tests pass | Run creation, amendment activation, payment, document, role, mobile, and deletion smoke tests on the published release candidate |

## Paused Lovable jobs (2026-11-15)

Follow-up: Lovable's managed `cron_auth` credential was provisioned without
revealing its value. The generated helper is now present locally, and local
handlers have been adapted to managed Bearer authentication and a single
server-clock instant for static scheduler callbacks. This does not change
business rules or introduce runtime AI. Lovable then reported the workspace
out of credits: handler redeployment and schedule conversion have NOT happened.
The deployed jobs remain paused on their old authentication configuration.
The backend schedule attestation still needs the actual managed metadata
contract; it must not be weakened to accept an unverified new command.
Local verification after this change passed 945 tests in 165 files,
TypeScript, ESLint, production build, Edge bundle consistency, both scheduled
handlers' Deno checks, and the whitespace check. Read-only target inspection
confirmed both original Cron jobs remain inactive. These are local checks,
not evidence of deployed managed callbacks or a successful scheduled run.

Lovable Cloud now contains `rentflowing-advance-receivables` at five minutes
past each hour and `rentflowing-cleanup-lease-document-files` at fifteen
minutes past each hour. Both were registered and paused in the same database
transaction, so neither has run or changed application data. Lovable's Jobs
screen confirms both as Paused. `cron.job_run_details` and
`scheduled_job_health` still contain no rows for these jobs. Vault contains
the public routing key as `scheduler_publishable_key`, but no
`scheduled_job_secret`; the Edge-only secret cannot be read by Postgres.
The old jobs reference an absent Vault secret by name. They must remain paused
until converted to managed authentication, authenticated dispatch is tested,
and the remaining release gates are met. Manual secret copying is no longer
the proposed setup. A fresh MCP deployment request after the owner's website
publication was again refused because the Lovable workspace is out of credits.

## Target reconciliation (2026-11-15)

After the owner clarified that all application records are disposable test data,
the missing migrations were applied to Lovable in order and recorded with their
SQL bodies. The final `20261115002000_restrict_trigger_function_execute.sql`
migration closes explicit `anon` and `authenticated` grants left by the target's
function defaults. The target now records **126/126** local versions with matching SQL hashes and the
read-only schema attestation passes **56/56** checks. The full financial audit
passes **51/51** checks and the historical-data preflight passes **22/22**.

The five-row `QA-INDEX-001`/`test` cleanup, the `BAIL-LON-001` false move-out
correction, the twelve legacy billing-cycle dates, and four property-cost
currency labels were guarded and retained as private before-images in
`repair_audit`. The scheduled lifecycle function advanced two signed leases
to active and one expired lease to ended; its prior lease/tenant values were
also retained there. Paid receivables and receipt allocations were not removed.

**At this earlier checkpoint, still NO-GO:** `cron.job` was absent and
`scheduled_job_health` had no runs.
The current Lovable host still lacks release provenance and required headers,
and no authenticated release-candidate journey has been observed. These are
independent of the now-clean database schema and test-data audit.
The 2026-11-15 local gate passed 920 tests in 162 files, plus a focused test
for the new trigger-permission migration; ESLint, TypeScript, build, migration
version check, and `git diff --check` passed. The local browser loaded the
dashboard, leases, a lease detail, and settings with no console errors.
The QA lease showed persisted indexation indices and cap in its summary and
amendment form; no amendment was saved during this read-only browser check.
The published site still returns HTTP 404 at `/release.json` and fails
`check:production-headers` on CSP, frame, robots, and permissions directives.

## Earlier target baseline (2026-11-15, before reconciliation)

The migration-history comparison has an important qualification: all 29
Lovable-recorded SQL bodies are byte-identical to the first 29 local migration
files, but their version timestamps differ by a few seconds. The current
read-only, exact-hash history preflight returned zero missing/changed,
unexpected, or already-remapped rows. The first genuinely unapplied local
migration is `20260623120000_partial_property_ownership.sql`; its two new
columns are absent on Lovable. Thus the remaining **96** local migrations
follow a 29-file equivalent baseline. The prepared history reconciliation
must still be separately approved and rehearsed before a migration rollout;
identical SQL bodies do not prove that applying the later 96 versions to live
data is safe. The target schema attestation still fails 47 of 56 capabilities.

The next two migrations intentionally drop legacy `assignment_type` and
`amendment_type` columns. The current target contains 24 non-null assignment
roles and 11 non-null amendment types, so those values would be lost unless
retained in the recovery record. Two assignment labels disagree with the
unit's current type: `BAIL-PAR-003` labels studio `PAR-S01` ancillary, and
`QA-LEASE-001` labels parking `QA-P01` primary. Both leases also have a
non-ancillary apartment assignment covering the relevant billing windows;
no live role or type value was changed. The drop is intentional under the
approved product model, but it belongs in the migration recovery review.

On 2026-11-15, current npm advisory checks returned **zero known
vulnerabilities** for both production-only (`npm audit --omit=dev
--audit-level=low`) and all dependencies (`npm audit --audit-level=low`).
This is an advisory snapshot, not a substitute for live security-policy,
database, or deployment verification.
The tracked-environment check passed for the one tracked runtime environment
file, and the migration-version check validated 125 unique local versions.
These checks do not prove that the target has applied them. The deployment
checker needs a published HTTPS origin, a clean expected revision, and the
backend identity; running it without those arguments only prints its usage
and is not deployment evidence.

A fresh read-only check of `https://rentflowing.lovable.app` on 2026-11-15
returned HTTP 200 for `/` but HTTP 404 for `/release.json`. The repository's
`check:production-headers` failed against `/`: the response lacked the CSP,
`X-Frame-Options`, `X-Robots-Tag`, and restricted `Permissions-Policy`
directives. HSTS, `Referrer-Policy`, and `X-Content-Type-Options` were present.
The published Lovable URL therefore still fails both provenance and security
gates; the local `_headers` template is not evidence that the host serves it.

The owner declined a database export and paid staging environment. That is a
constraint, not evidence that the 96-version migration gap is safe to apply
directly. No full-chain target migration or production deployment is approved
or claimed complete here.

The current read-only historical-data migration preflight has 22 checks; the
only nonzero one is four legacy amendment unit references. All four belong to
the three owner-confirmed test leases awaiting the separately approved linked
cleanup. The ambiguity and wrong-property checks are zero. If that cleanup is
approved and completed, rerun the preflight before migrating rather than
normalizing rows that will be deleted; a zero preflight still does not prove
the full migration chain is safe without a recovery rehearsal.

After the owner authorized correction or deletion of inaccurate fake app data,
the guarded `scripts/delete-demo-linked-test-leases.sql` transaction removed
`BAIL-AMS-001`, `BAIL-BRU-001`, and `BAIL-PAR-001` and their 181 linked rows.
All 184 pre-deletion rows are retained in the private
`repair_audit.demo_linked_test_leases_20261115` table. Postchecks found zero
remaining target leases, receipts, or receivables. The financial audit fell
from 21 to 12 nonzero checks out of 51; all 14 duplicate schedule rows and
the seven property-currency-mismatched receivables and three receipts vanished
with those test leases. The 22-check historical-data migration preflight now
has zero nonzero findings. This is real-data cleanup, not a migration or a
production release. The preceding paragraph is retained as historical context.

The separate read-only schema-capability attestation has 56 checks: 9 pass and
47 fail on Lovable. The missing capabilities include atomic lease, amendment,
payment, and cost writes; receipt and guarantee integrity guards; contractual
document types and file protection; lease billing/assignment guards; scheduled
job health; and tightened portfolio data policies. This is a direct target
finding, not merely an inference from migration version counts. The full
check list comes from `scripts/check-target-schema.sql`; no SQL was applied.

## Seven legacy assignment prices (2026-11-15)

The owner explicitly approved correcting all seven exact assignments. Fresh
read-only preflights found the pinned leases, units, dates, prices, and draft
amendment unchanged; both private audit tables were absent; and the 188 linked
receivables were present. The four historical assignments were corrected in
one guarded transaction, followed by the three active assignments in another
guarded transaction after all six read-only checks returned zero. Each
transaction captured the complete previous assignment rows in private
`repair_audit` tables before updating only `rent_share` and `charges_share`.
The target's only assignment UPDATE trigger touches `updated_at`.

Postchecks confirm all seven assignment shares equal their lease rent and
charges, zero assignments remain with null pricing anywhere in the target,
all seven before-images have null old shares, and the same 188 linked
receivables remain. No receivable, receipt, or allocation was intentionally
changed. The full read-only financial audit now has 21 nonzero checks out
of 51, down from 22; the missing-pricing finding is gone. This correction
does not resolve the 14 remaining duplicate schedule rows or the backend,
security, host, and authenticated-QA release gates.

The paragraphs immediately below record the earlier preparation state and
are superseded by this post-implementation evidence.

Read-only follow-up on the seven `lease_assignment_missing_pricing` findings
confirms that each affected lease has exactly one unit assignment, and both
`rent_share` and `charges_share` are null on that assignment. All 188 existing
receivables for these leases are attached to their sole assigned units (188 =
64 + 7 + 0 + 73 + 44 + 0 + 0). The rows are on `BAIL-AMS-003`,
`BAIL-BRU-003`, `BAIL-BRU-004`, `BAIL-LON-001`, `BAIL-LON-002`,
`BAIL-PAR-002`, and `BAIL-PAR-004`. The first, fourth, and fifth leases have
already passed a detailed, separately documented pricing preflight; their
manual repair remains unapproved and unapplied.

For the other four, the sole-unit lease prices are EUR 2,200 + 350,
EUR 1,100 + 150, GBP 1,600 + 180, and GBP 820 + 80 respectively. The
`BAIL-BRU-003` rent-changing amendment is a draft effective after the lease
ended, so its EUR 2,350 proposal is not the current lease amount. The two
Paris unit catalog rents (GBP 1,650 and 850) differ from the lease contract
rents (GBP 1,600 and 820), so copying unit defaults would be wrong. No live
row was changed. Before any backfill, recheck exact identities and amendment
state, then obtain an explicit decision on these historical rows. Missing
shares remain a release data gate even though the present receivable unit IDs
are correct.

The separate, unexecuted `scripts/repair-demo-historical-assignment-pricing.sql`
now pins those four leases, assignments, units, property currencies, lifecycle
stages, date windows, contract prices, unit defaults, and the one draft
amendment. It captures all four before-images in a private audit table and
updates only the null assignment shares. Four isolated PGlite tests pass,
including contract-price selection instead of Paris unit defaults and full
rollback on a changed rent, activated amendment, or extra assignment.
Focused ESLint and app TypeScript checks pass. This preparation does **not**
authorize a live write; the user was asked separately about all seven missing
assignment prices. A fresh read-only target preflight is required before any
approved execution.

The previously prepared three-active-lease repair now also captures three
private before-images in the same transaction. Its existing rejection tests
still pass, and a new assertion proves that a failed repair leaves no audit
table behind. Together the two isolated repair suites pass 8/8 tests and
focused ESLint. Neither script has been executed against Lovable.

## Complete local gate after targeted repairs (2026-11-15)

A later full local rerun on the current checkout passed 162 test files and
920 tests, `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`,
`npm run build`, and `git diff --check`. The newly built manifest still has
105 assets, the expected backend origin, revision `b30c4095`, and
`dirty: true`. This supersedes the older local test count below, but does
not prove authenticated workflows, deployment provenance, target schema,
or recovery readiness.

After the Berlin and Paris billing repairs and the newly prepared guarded
cleanup and security hotfixes, the full local suite passes: 161 test files and
916 tests. `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`,
`npm run build`, and `git diff --check` also pass. The generated release
manifest contains 105 hashed assets and points at the expected Supabase
backend, but remains `dirty: true` at revision
`b30c4095c3d70e42bca38f0ab21230b790e04a41`. This is verified local
preparation, not a reviewed, clean, published release. The target migration,
backend-function, security-policy, authenticated-QA, and hosting gates remain
open.

## Referenced document-file guard prepared (2026-11-15)

Read-only Lovable schema checks found four lease documents with a
`storage_path` column, but no `can_delete_lease_document_file` function or
path index. The current Storage delete policy does not check whether a file
is still referenced. `scripts/hotfix-referenced-lease-document-files.sql`
prepares a guarded, transactional repair that first requires the separate
five-policy writer hotfix, then adds the reference lookup and denies deleting
referenced files. The existing migration installs the same behavior later.
Four PGlite policy combinations pass, including viewer denial and rejection
of an editor deleting a still-referenced file. Neither hotfix has been applied
to Lovable; separate approval and a fresh target preflight remain required.

## Authorized BAIL-PAR-003 billing repair (2026-11-15)

The owner approved deleting the two unpaid July 2026 parking-anchored duplicate
receivables and reanchoring eight August-November rows to main unit `PAR-A01`,
without changing amounts. Read-only checks immediately before execution found
12 open/overdue rows, no allocations, receipts, reconciliations, or amendments,
and no existing audit table. Two focused PGlite tests passed, including a
rollback when an allocation exists. `scripts/repair-bail-par-003.sql` then
completed in one guarded transaction.

The postcheck found ten receivables (five rent at GBP 2,320 and five charges
at GBP 230), all on `PAR-A01`, zero duplicate slots, no allocated or abnormal
balances, and 12 before-images in `repair_audit.bail_par_003_20261115`.
The full financial audit now has 22 nonzero checks out of 51; duplicate
lease-schedule rows fell from 16 to 14 and `same_bill_schedule_collisions`
fell to zero. The remaining 14 duplicate rows are on the three owner-confirmed
test leases awaiting separately approved linked-data cleanup. This data repair
does not replace the unapplied unit-independent duplicate guard or the
unpublished main-unit generator.

## Live lifecycle and default-portfolio diagnosis (2026-11-15)

Read-only review identified all three leases whose stored stage trails the
calendar: `BAIL-AMS-002` and `BAIL-PAR-003` remain `signed` after their
2026-09-01 and 2026-07-01 starts, while `RAT1` remains `active` after its
2026-08-30 end. These are not among the three owner-confirmed linked test
leases proposed for deletion. The scheduled lifecycle transition is not yet
verified on the live backend: a direct function inventory returned no
`advance_due_lease_lifecycle`, `insert_due_lease_receivables`, or
`prune_future_closed_lease_receivables` function in `public`. Changing these
statuses individually would not fix that missing mechanism. The relevant
migrations and scheduled jobs must be installed and verified before release.

The three tenant-status mismatches are: a stored applicant linked to active
`BAIL-BRU-002` (and signed/terminated leases); a stored active tenant linked
only to draft `test`; and a stored former tenant linked to signed
`BAIL-PAR-003` as well as ended `BAIL-PAR-002`. No tenant status was changed.

The owner's profile has a default portfolio ID with no matching membership,
although it has owner membership in `Demo` and `QA-20261015`. This is a data
integrity issue, but it does not by itself explain an inaccessible application:
the published `PortfolioContext` does not read `default_portfolio_id`, and the
local version falls back to an accessible membership when that preference is
invalid. Eight focused portfolio tests pass, including the stale-default case.
The owner was asked to select the desired default for a later data repair; no
membership or profile row was changed.

## Linked Demo test-lease cleanup prepared (2026-11-15)

The owner classified `BAIL-AMS-001`, `BAIL-BRU-001`, and `BAIL-PAR-001` as
test data. Read-only target checks found 134 receivables, ten receipts,
18 receipt allocations, three guarantees, four amendments with six changes,
three unit assignments, three status changes, and the three leases: 184 rows
in total. None of the receipts is allocated to a claim outside these leases,
and no outside receipt is allocated to their claims. There are no documents,
reconciliations, imported receipts, raw bank links, or delete triggers on the
affected tables. Directly deleting just the leases would leave cash receipts
and receivables orphaned because their foreign keys use `ON DELETE SET NULL`.

`scripts/delete-demo-linked-test-leases.sql` now prepares an exact-count,
transactional cleanup with all 184 before-images retained in the private
`repair_audit` schema. Two PGlite tests pass, including rollback on a shared
receipt. This script has **not** been run against Lovable; separate explicit
approval for deleting the full linked graph is pending. The units, properties,
and other leases are outside its scope.

The seven receivables and three receipts whose EUR currency differs from their
GBP property all belong to `BAIL-PAR-001`. Six of the receivables are paid and
allocated; the seventh is an open EUR 180 repair recharge. The three receipts
are allocated or partially allocated. They must not be converted or removed
individually without resolving the linked test-lease decision. Four active
EUR cost entries on a GBP property are separate and are not covered by the
proposed lease cleanup.

The affected property is `Résidence du Parc` in Paris, configured as GBP with
six leases and seven units. It has six GBP cost entries totaling GBP 50,771.65
and four EUR entries totaling EUR 8,600.07 (insurance, plumbing, property tax,
and a `TEST` entry). The EUR receivables and receipts on this property are all
linked to `BAIL-PAR-001`, while other receivables total GBP 61,950. Changing
the property currency would not be a safe data repair; the current property
form also locks currency after units or financial records exist. Whether the
four EUR costs are test rows is a separate owner decision still pending.

## Berlin duplicate-regeneration risk (2026-11-15)

After the authorized `BAIL-BER-001` data repair, the live receivable trigger
still defines a duplicate using `unit_id`. Its function and trigger definitions
were confirmed by read-only Lovable queries. The published generator can still
attribute a later bill to the storage unit, so a repeated schedule pass may
recreate a cross-unit bill or fail. The repair's postcheck currently remains
at 40 receivables, none on the storage unit, but this is not a durable guard.

`scripts/hotfix-lease-billing-slot-guard.sql` is a separate, guarded,
function-only preventive repair for the observed trigger. It keys billing
identity by lease, item type, month, and cycle end rather than unit, while
allowing distinct amendment segments. Its two PGlite tests pass, and a fresh
read-only target check found exactly one matching legacy function and trigger.
It has **not** been applied; separate write approval is pending. It will
prevent new duplicate rows but can expose an error in the old published
generator until the main-unit anchor and full schedule changes are deployed.
The existing 16 non-Berlin duplicate rows remain untouched.

## Authorized BAIL-BER-001 billing repair (2026-11-15)

The owner separately authorized the targeted Demo correction after confirming
that EUR 190, not EUR 250, is the monthly charge total. Immediately before the
write, all ten read-only preflight checks returned zero and the four focused
transaction tests passed. `scripts/repair-bail-ber-001.sql` then completed in
one transaction. A read-only postcheck found the lease at EUR 190 monthly
charges, 20 charge receivables at EUR 190, 20 rent receivables at EUR 910,
all 40 remaining receivables on the main unit, and 73 before-images in
`repair_audit.bail_ber_001_20261115`. The remaining rows are open or overdue,
unallocated, and have outstanding amounts equal to expected amounts. No cash
receipt or receipt allocation was changed.

The full post-repair financial audit has 51 checks, of which 23 are nonzero
(previously 24). Duplicate lease-schedule rows fell from 48 to 16. The other
nonzero checks, including cross-currency slots, bills after actual move-out,
and missing target schema capabilities, still require separate resolution.
This repair does not make the application production-ready.

## Complete local gate after formula feedback (2026-11-15)

After the mid-cycle amendment message and regression test, the full suite
passes: 158 test files and 908 tests. `npm run build` and `git diff --check`
also pass. The generated manifest contains 105 hashed assets at revision
`b30c4095c3d70e42bca38f0ab21230b790e04a41`, but reports `dirty: true`.
This verifies the current local checkout, not a reviewed commit or deployed
application. The target migrations, live data corrections, authenticated QA,
security headers, and hosting decision remain open.

## Mid-cycle formula-change feedback (2026-11-15)

The amendment activation guard already refused a new rent formula when a
receivable due before its effective date covers that date. Its error text
incorrectly called every such row "advance-billed", even for monthly rent.
The message now says "billed receivable", and a regression test proves a
mid-month monthly amendment is blocked instead of creating a second bill for
the same covered period. All 19 focused activation tests, ESLint, and
`git diff --check` pass. This is a local code change, not a deployed fix.

## Live write-policy scope recheck (2026-11-15)

A fresh read-only inventory of all 80 `public` and `storage` INSERT, UPDATE,
DELETE, and ALL policies found exactly five whose write condition uses the
broad `is_portfolio_member` helper: three on `lease_documents` and two on
`storage.objects` for `lease-documents`. The other 64 routine business-table
write rules use `has_portfolio_role` for owner/editor, while account and
membership rules use their own owner/admin/self conditions. The inventory
also found no anonymously executable `SECURITY DEFINER` function in `public`;
neither `anon` nor `authenticated` can create objects in the `public` schema.
This narrows the known live RLS repair to the five document/file policies but
does not substitute for authenticated role tests or application-level review.
The prepared hotfix remains unapplied pending explicit authorization.

## Cloudflare Pages origin guard (2026-11-15)

The build preflight now rejects `CF_PAGES=1` when `PUBLIC_APP_ORIGIN` is the
old Lovable host, including a trailing-slash spelling. This closes a case
where a Pages build could succeed with CSP script sources pointing to the
wrong site. Six focused tests, ESLint, and a positive preflight with a
distinct example Pages origin pass. This is local release preparation; no
Pages project or deployment has been created.
The subsequent full `CF_PAGES=1` build with the example Pages origin passed;
both generated `dist/index.html` and `dist/_headers` reference that origin
and the expected Supabase backend. The manifest contains 105 hashed assets
but still reports `dirty: true`, so it is not a publishable clean revision.

## Authorized Demo test-lease cleanup (2026-11-15)

The owner explicitly authorized permanent deletion of the three confirmed
Demo test leases `HUB`, `REZ`, and `REZ2` without an export or backup. The
read-only preflight was rerun immediately before execution and all ten checks
returned zero. The guarded transactional script
`scripts/delete-demo-test-leases.sql` completed successfully. A subsequent
read-only query found zero rows by either the three IDs or their references
in the Demo portfolio. No other live-data change was made as part of this
cleanup. Older audit counts below are historical and may still include these
three leases; they are not current post-cleanup counts.

A post-cleanup read-only check for non-draft leases without a non-parking,
non-storage assignment now returns three different leases:
`BAIL-AMS-001` (parking only), `BAIL-BRU-001` (storage only), and
`BAIL-PAR-001` (parking only). Their recorded lease-level rent exceeds the
recorded unit share, so no automatic repair is inferred from the cleanup.

The full post-cleanup financial audit has 51 checks, with 24 nonzero (down
from 27). The remaining counts include 48 duplicate lease-schedule rows,
six cross-currency schedule slots, 29 open schedule rows after actual
move-out, and three non-draft leases without a main-unit assignment. The only
lease without status history is draft `QA-INDEX-001` in the separate
`QA-20261015` portfolio; it has two assignments, no receivables, payments,
guarantees, amendments, or documents. Demo lease `RAT1` has one open,
unallocated GBP 4,650 schedule receivable and cannot be treated as an empty
test lease without a separate business decision. None of these additional
records was changed.

Read-only detail of the 48 repeated billing slots splits them into 32 on
`BAIL-BER-001`, six each on `BAIL-BRU-001` and `BAIL-PAR-001`, and two each
on `BAIL-AMS-001` and `BAIL-PAR-003`. This was the breakdown before the
separately authorized Berlin repair recorded above. The remaining 16 require
separate review: Amsterdam pairs a paid office receivable with a different,
much larger open parking receivable; Brussels pairs paid or partially paid
apartment rows with open storage rows, while the main-unit assignment is
absent; the older Paris lease pairs paid EUR apartment rows with open GBP
parking rows even though the property currency is GBP; and the newer Paris
lease has two full-lease open rows despite three concurrent unit assignments.
A repeated slot is therefore not, by itself, authorization to delete a row.

The post-cleanup read-only `BAIL-LON-001` review confirms the lease is still
`active` although `move_out_actual_date` is `2026-06-30`. After that date it
has 15 open rent rows totaling GBP 27,000 and 14 open charges rows totaling
GBP 1,680, all without receipt allocations. A further GBP 120 charges row
due `2027-09-01` is marked paid with `allocated_amount = 120` but no receipt
allocation link. The lease also has three cash receipts, one amendment, one
guarantee, and three receipt-allocation links elsewhere. No row was changed;
whether billing ended on actual move-out remains a contractual decision, and
the protected paid row needs separate reconciliation.

## Follow-up verification (2026-11-15)

After the artifact-hygiene change, the complete suite passed again: 158 test
files and 906 tests. The local preview server was restarted at
`http://127.0.0.1:8084/`, and the in-app browser loaded the OneRent sign-in
page. Authenticated workflows still require the owner to sign in; this does
not verify the published build. A fresh read-only Demo preflight for test
leases `HUB`, `REZ`, and `REZ2` returned zero for all ten checks, including
assignments, receivables, receipts, guarantees, amendments, documents,
reconciliations, and status history. That check preceded the separately
authorized deletion recorded above.

## Static-host build rehearsal (2026-11-15)

`npm audit --audit-level=high` reported zero vulnerabilities. A local build
with `PUBLIC_APP_ORIGIN=https://rentflowing-preview.pages.dev` completed
without deploying anything. Both `dist/index.html` and `dist/_headers` use
that origin rather than the Lovable origin. The output has 109 files; its
largest file is 498,798 bytes and its longest `_headers` line is 560
characters, below Cloudflare Pages' documented Free-plan file count, 25 MiB
file-size, and 2,000-character header-line limits. The URL was an example,
not an existing Pages project. `dist/release.json` still says `dirty: true`,
so this artifact cannot be treated as a final release. A Pages account,
reviewed commit, backend migrations, authentication redirects, and live
deployment checks are still required.

## Local gate recheck (2026-11-15)

Before the artifact-hygiene change below, the current checkout passed all 906
tests in 158 files, `npm run build`, `git diff --check`, and
`git diff --cached --check`. The generated
`dist/release.json` identifies revision
`b30c4095c3d70e42bca38f0ab21230b790e04a41` and 105 hashed assets,
but correctly reports `dirty: true`. These results do not establish a clean
release candidate or a working published deployment. Browser-based
authenticated QA could not resume because the Mac was locked and the Codex
in-app browser had no tab; the user must unlock the machine before that gate
can be rerun. No live backend or published-site change was made.

An artifact-hygiene follow-up found eight stale numbered JavaScript copies in
`dist` that were absent from the release manifest. The build now checks for
unlisted output files before succeeding and hashes the remaining public
`placeholder.svg` asset. A fresh build removed those old copies and passed;
the focused deployment suite passed 18 tests, along with app TypeScript,
ESLint, and `git diff --check`. The complete 906-test suite has not been
rerun after this narrow follow-up. The release marker remains `dirty: true`
because the checkout is not yet a reviewed commit.

## Live Lovable backend recheck (2026-11-15)

Read-only Lovable queries confirmed the project still has 29 applied migrations,
ending at `20260622145643`. The current project commit remains
`b30c4095c3d70e42bca38f0ab21230b790e04a41`. Five live write
policies still use `is_portfolio_member`: INSERT, UPDATE, and DELETE on
`public.lease_documents`, plus INSERT and DELETE on the `lease-documents`
storage bucket. This permits a portfolio viewer to mutate documents unless
another restriction intervenes. A separate read-only role count found four
owners, one admin, and no current viewer; this is a latent permission defect,
not evidence of an observed viewer write. The role-scoped migration and
guarded manual hotfix are local only; neither was applied in this read-only
check. A fresh authorized read-only network check reached
`https://rentflowing.lovable.app/` and confirmed the published page lacks the
required CSP, anti-framing, noindex, and five permissions restrictions. A
separate HEAD request to `/release.json` returned HTTP 404. The site does
send HSTS, Referrer-Policy, and X-Content-Type-Options, so the failure is
specific to the absent controls rather than a total absence of headers.

## GitHub enforcement not yet active (2026-11-15)

An authorized read-only `git ls-remote --heads origin main` returned
`b30c4095c3d70e42bca38f0ab21230b790e04a41`, matching both local
`HEAD` and the commit Lovable reports as published. Moreover,
`git ls-tree -r HEAD .github` contains no workflow files. The three local
GitHub Actions workflows are currently untracked, so none of these proposed
CI, backend, or deployment checks can be required by that published commit.
The local `gh` authentication is invalid; remote branch-protection and
required-check settings have **not** been verified. A GitHub connection was
suggested for that read-only inspection. Do not claim branch protection is
absent from this evidence alone. Review and commit the workflows with their
dependent source, then verify the remote rules and actual CI runs before
publishing.

## Working-tree review boundary (2026-11-15)

The current checkout is not a reviewable release revision: `git status`
reports 436 entries, including 405 individual untracked files. Nine staged
files concern date/form controls, translations, property ownership, unit and
property screens, and their tests. Untracked content includes 97 Supabase
files, 196 application/source files, 43 scripts, three workflow files, and a
separate 58-file `landing-page` tree. The passing local tests do not identify
which of these changes belong in one publishable commit. No broad staging,
commit, reset, or deletion was performed. A reviewed commit boundary and
clean checkout build are required before the deployment revision check can
pass.

## Tracked environment-file guard (2026-11-15)

The repository still tracks a root `.env` despite ignoring new environment
files. CI now runs `npm run check:tracked-env` before installing dependencies:
tracked runtime `.env*` files may contain only the three public Supabase
client fields, with a hosted HTTPS URL, matching project ID when present,
and an `sb_publishable_` key. Unexpected fields, duplicate/malformed lines,
server keys, and legacy JWT values fail without printing their values.
The current tracked `.env` passes; `.env.local` is untracked and is not read by
this check. Five focused tests, ESLint, and `git diff --check` pass. A local
pattern scan found no obvious server-key or private-key material outside
dependencies/build output, but this is **not** a complete repository-history
secret audit.

## Guarded document-writer hotfix prepared (2026-11-15)

`scripts/hotfix-lease-document-writers.sql` is a standalone, transactional
policy-only repair for the five currently broad Lovable document/file write
policies. It refuses an unexpected policy or missing role helper/RLS before
dropping anything, uses a short lock timeout, and verifies the replacement
policies before commit. The normal `20261017120000` migration can later
replace these same policy names. A live read-only preflight returned true for
the role helper and both RLS settings, with exactly 3/3 expected document
and 2/2 expected storage write policies. Embedded PostgreSQL tests exercise
both the migration and hotfix with admin/editor/viewer access, cross-portfolio
links, and rollback on an unexpected extra policy. The 23 focused tests,
ESLint, and `git diff --check` pass. **The hotfix was not applied.** It does
not supply the later contractual-document model, referenced-file guard,
bucket limits, or other pending migrations; release remains no-go.

The fresh read-only RLS inventory found 25 existing public tables with a
`portfolio_id` column; every one has RLS enabled and a member-scoped SELECT
policy. The failing aggregate `portfolio_data_rls` and
`portfolio_data_read_policies` release checks require the not-yet-created
`lease_document_types` table, so those two failures do **not** show an
unprotected existing table. The separate broad document/file **write**
policies above are still a real authorization gap.

## Local preview smoke (2026-11-15)

The local Vite server started on `http://127.0.0.1:8084/` after ports 8082
and 8083 reported occupied. The Codex in-app browser loaded OneRent and a
request for `/leases` redirected to the Sign in screen at `/login`, showing
the auth boundary is active. No credentials were entered and no data was
changed. Authenticated lease, payment, and settings workflows remain
unverified in this browser session; the owner has been asked to sign in
manually. This local smoke does not validate the published Lovable build.

## Fresh Lovable read-only release audit (2026-11-15)

Lovable still reports published project commit
`b30c4095c3d70e42bca38f0ab21230b790e04a41` (last edited June 23),
with 29 applied migrations ending at `20260622145643`. The full current
read-only schema query returns 56 checks: **9 present, 47 missing**, including
the atomic lease/receipt/amendment/cost operations, contractual document
model and writer restrictions, job health, and financial integrity guards.
The full financial data audit returns 51 checks, with **27 nonzero**. Key
counts include 48 duplicate schedule rows, 6 cross-currency billing slots,
17 allocated rows without a plausible assignment, and 29 open schedule rows
after an actual move-out. These categories can overlap; do not add their
counts as distinct records. No migration, data correction, deployment, or
scheduled function was run. This is direct target evidence that release is
still **no-go**, not merely a stale local checklist.

## Scheduled-job command verification (2026-11-15)

The read-only backend gate previously counted an hourly Cron command as ready
when it merely mentioned the correct function URL. A GET or an unauthenticated
POST could therefore count, especially shortly after a manual successful
run. Its SQL now requires `net.http_post`, `apikey`, `X-Cron-Secret`, and a
Vault lookup in the command as well as the exact project endpoint and hourly
schedule. Embedded PostgreSQL tests reproduced the false pass and now cover
valid jobs for both functions, wrong method, missing headers, a literal
secret, and wrong frequency. All 14 focused tests, ESLint, and
`git diff --check` pass. This remains a textual preflight: Vault values,
actual dispatch, and HTTP response history still require target verification.
No live Cron job was created or changed.

## HTML CSP image-source alignment (2026-11-15)

The HTML fallback CSP still allowed every `*.r2.dev` image host although
the deployable response-header policy excludes that wildcard and the app has
no current R2 image reference. The fallback now allows only local, embedded,
blob, and configured Supabase image sources. A regression test failed before
the change and passes afterward; the compiled `dist/index.html` contains no
`r2.dev`. Ten focused CSP/header/privacy tests, the production build, ESLint,
and `git diff --check` pass. The Lovable host still needs actual response
headers, which an HTML meta policy cannot fully replace.

## Published asset MIME verification (2026-11-15)

A clean local rebuild removed ten stale, unmanifested files that had been
left in `dist/assets`; the build itself did not reproduce the residue.
The deployment verifier previously accepted correctly hashed JavaScript or
CSS served as `text/plain`, which a browser may refuse under `nosniff`.
Regression tests reproduced that false pass. Published `.js` assets now
require a JavaScript media type and `.css` assets require `text/css`, in
addition to the existing digest checks. The 32 focused deployment/header
tests, ESLint, and `git diff --check` pass. No published asset was changed.

## Security-header verifier false-positive guard (2026-11-15)

The standalone production-header verifier previously accepted a URL with a
path, query, or fragment and silently checked the site root instead. It also
accepted a successful non-HTML response with otherwise correct headers as an
application page. It now requires the exact HTTPS site origin and an HTML
response on both `/` and `/leases`. Regression tests reproduced both false
positives before the fix; all 35 focused header/deployment tests now pass,
as do ESLint and `git diff --check`. This improves the release gate but does
not install the missing headers on the published Lovable host.

## Current local verification (2026-11-15)

On the current working tree, `npm run test -- --run` passes 906 tests in
158 files. `npm run check:migrations` validates 125 unique migration versions;
`npm run check:tracked-env`, app TypeScript, ESLint, `npm run build`, and
`git diff --check` also pass.
The resulting `dist/release.json` records 104 asset digests but marks the
working tree `dirty: true` at commit `b30c4095c3d70e42bca38f0ab21230b790e04a41`;
the deployment verifier must reject this as a final clean release.
This is local source evidence only. The Lovable target still lacks the pending
migrations, has overly broad document-write policies, and has not been shown
to serve this working-tree revision. The release decision remains **no-go**.

## Live document-write policy gap (2026-11-15)

Read-only inspection of Lovable's `pg_policies` confirms that the live
`lease_documents` INSERT, UPDATE, and DELETE policies use
`is_portfolio_member`, as do `storage.objects` INSERT and DELETE policies for
the private `lease-documents` bucket. A viewer member could therefore write
document metadata and files under the current rules. No viewer is currently
present (one admin and four owners), so this is a latent authorization flaw,
not evidence of an exploit. The bucket is private but currently has no file
size or MIME allowlist. The local
`20261017120000_restrict_lease_document_writes.sql` migration limits writers
to owner/admin/editor, and `20261107150000_secure_lease_documents_bucket.sql`
adds bucket limits. The focused PGlite test now covers viewer read access and
denied metadata/file insert, update, and delete; it passes. None of these
security changes are applied on the Lovable target. Explicit approval was
requested for a policy-only hotfix; full migrations remain blocked by the
unrehearsed 29-vs-125 migration gap and lack of a current export.
The read-only target-schema gate now explicitly requires exactly one
owner/admin/editor policy for each lease-document INSERT, UPDATE, and DELETE,
with no member-wide writer policy. A targeted live query returns `false` for
this new condition. The policy, target-schema, and full synthetic migration
chain tests pass together (22 tests in three files). No target policy changed.

## Dependency audit and Lovable recovery evidence (2026-11-15)

An authorized read-only `npm audit --audit-level=high --json` query reached
the npm registry and reported zero vulnerabilities of any severity among
548 dependencies (145 production, 404 development; npm's groups overlap).
Lovable's migration table still has 29 applied versions, latest
`20260622145643`, while `npm run check:migrations` validates 125 local
versions. The target is therefore substantially behind the local schema;
no migrations were applied.

The Lovable project's Backups screen visibly lists daily database backups,
including 2026-11-14 05:07:37 UTC and older points through 2026-10-31.
Lovable's official backup documentation says these restore the whole database
to that day's state, discarding later changes, and do not restore storage
files: https://docs.lovable.dev/features/database-backups.md . No backup was
restored and no export was requested. The owner has been asked whether the
three confirmed empty test leases may be deleted with this limited recovery
route. A daily backup is not a substitute for a current, restorable migration
rehearsal; the migration and publication gates remain no-go.

## Browser-key and local environment guard (2026-11-15)

The production build previously accepted any nonempty value as the browser's
Supabase publishable key. It now rejects `sb_secret_` keys and legacy JWTs
whose role is `service_role`, before Vite can embed them. Five focused header/
build-environment tests pass, including public-key acceptance and both secret
formats. The production build, ESLint, and `git diff --check` pass.
Git now ignores new `.env` and `.env.*` files while allowing `.env.example`;
the already tracked `.env` remains tracked and currently contains only public
Supabase variable names. This guard cannot replace a secret scan or a review
of tracked files before committing the large working tree.

## Source-to-published revision gap (2026-11-15)

Lovable's read-only project metadata reports latest commit
`b30c4095c3d70e42bca38f0ab21230b790e04a41`, last edited on
2026-06-23, with a published project status. Local `git rev-parse HEAD`
returns the same commit while the working tree contains hundreds of
uncommitted changes, including the pending CI workflows, migrations, and
release checks. Thus the local fixes are not proved present in Lovable's
published build. A fresh generic web fetch of the public URL and
`/release.json` was unavailable through that fetch tool; this observation
does not replace the earlier direct HTTP checks below. A clean, reviewed
source revision must be published and then independently verified before
the release gate can pass. No source was pushed or deployed in this check.
The deployment verifier also now requires the exact published HTTPS origin,
rejecting a subpath, query, or fragment before fetching the release marker.
A regression test first reproduced the subpath acceptance and now passes with
all 17 deployment-verifier tests; ESLint and `git diff --check` pass. This
hardens the future gate but does not verify the current published site.

## Informational cost recovery consistency (2026-11-15)

A focused regression test reproduced a stale-allocation defect: an active
cost changed to `informational` was excluded from cost totals but its older
recoverable allocation still added 1,200 to unit recovery and lease charges.
Unit and property recovery, lease cost overview, and reconciliation now ignore
informational costs even when allocation rows remain. The new regression test
passes; the complete local suite passes 893 tests in 157 files, and the
production build, app TypeScript, ESLint, and `git diff --check` pass. No
Lovable data was changed.

The owner classified `HUB`, `REZ`, and `REZ2` as test leases to remove. The
guarded cleanup SQL remains prepared but unexecuted pending a live preflight
and explicit approval after review of the limited daily-backup recovery
route. The production release decision is still
no-go for the target migration, host, and authenticated workflow gates below.

A fresh read-only preflight on Lovable confirms all three IDs, references,
stages, and `updated_at` values still match the guarded cleanup script. All
ten preflight checks return zero. The live database lists eight foreign-key
tables referencing `leases`; all eight are covered by the preflight, and no
other public table has a lease ID/reference column. This does not make the
deletion reversible. The owner has been asked whether to proceed without an
export of the current state, relying only on the older daily backup.
The cleanup transaction now refuses to run if any previously unknown table
adds a foreign key to `leases`, preventing a later cascading schema change
from silently deleting new child data. Its four focused PGlite tests pass,
including a new cascading-child rollback test. The cleanup was not run.

## Default portfolio selection and public-host recheck (2026-11-15)

The profile's saved default portfolio was not read by the application loader.
On a fresh browser it previously selected the first membership row instead,
which has no guaranteed order. The loader now uses an accessible saved default
when there is no valid recent local selection; returning users with a valid
recent selection skip the extra profile read. Saving a new default in Profile
also selects it locally only after the database acknowledges the change.
The switch action now ignores IDs outside the loaded memberships.
Tests cover new-browser selection, recent-choice precedence, stale or
inaccessible defaults, invalid switches, and failed/successful profile updates. The 22 focused
tests, app TypeScript, lint, production build, and whitespace check pass.
Authenticated browser verification remains unavailable in the fresh preview.

Follow-up account-switch tests found that email/password drafts could carry
into the next signed-in profile, and a delayed default or password response
could update or notify the next account. Profile now clears those drafts and
the pending leave target when the user ID changes, ignores an old account's
delayed default result, and suppresses stale action notifications. The 25
focused profile/portfolio tests, app TypeScript, lint, production build, and
whitespace check pass after this change. The complete local suite also passes
891 tests in 157 files. An authenticated browser flow on the released build
is still needed before a release commit.

The profile action lock has also been scoped to the account session. A
delayed save from the previous account no longer blocks actions for the new
account or releases a new in-flight save when it completes. A two-request
concurrency test exercises that ordering. The 20 focused profile tests,
app TypeScript, lint, production build, and whitespace check pass. The full
suite result above predates this narrowly scoped follow-up.

A fresh authorized read-only network check still rejects the published
Lovable host's CSP, anti-framing, noindex, and five permissions restrictions.
`/release.json` still returns HTTP 404, and the public Auth settings check
still reports signup disabled or unavailable. No published host, backend,
account, or data was changed. The owner has been asked whether onboarding
should be public or invitation-only; neither choice removes the deployment
and migration blockers.

## Live duplicate-currency and move-out diagnosis (2026-11-15)

The current read-only financial audit still has 27 nonzero checks among 51.
All six `cross_currency_schedule_slots` belong to `BAIL-PAR-001`, for rent
and charges due January through March 2026. Each slot has a paid EUR row
linked to an EUR cash receipt and an open GBP row; the current property
currency is GBP. The six paid rows total EUR 4,500 and must not be deleted
or converted merely to make the duplicate count zero. The six GBP rows are
unallocated, but whether they represent a real GBP debt depends on the
contractual currency for those months. The owner has been asked to verify it.
The paid EUR rows point to unit `PAR-A01`, whereas the only assignment now
recorded for this lease is `PAR-P01` (2024-03-01 through 2026-06-11). Thus
currency and historical unit attribution both require source-document review;
the current assignment alone cannot justify rewriting paid history.
The local duplicate reviewer correctly flags different-currency rows as
ambiguous, and the pending database guards prevent a new schedule row in a
different currency from bypassing the same billing slot. Those guards are
not yet installed on Lovable. The focused database-guard test now explicitly
tries the same lease, period and due date with a different unit and currency;
the insert is rejected. Both tests in `receivableMigration.test.ts` pass, and
`git diff --check` passes.

All 29 `open_schedule_after_actual_move_out` rows belong to
`BAIL-LON-001`, which remains active with a recorded actual move-out on
2026-06-30 and contractual end on 2027-09-30. They are unallocated and total
GBP 28,680, due July 2026 through September 2027. The owner has been asked
whether the move-out date is real or erroneous. The local lease-edit path
reconciles future unpaid receivables when the move-out date changes, but
that cannot retroactively repair the live rows without a reviewed data
operation. No target payments, receivables, or lease statuses were changed.

## Read-only live-data migration preflight (2026-11-15)

`scripts/preflight-lovable-data-migrations.sql` captures 22 targeted checks
against historical rows that selected pending migrations validate. The query
ran successfully against Lovable without modifying data: 21 checks returned
zero; `amendment_legacy_refs_to_normalize` returned four. The amendment
migration's two failure preconditions (missing references and ambiguous or
wrong-scope references) both returned zero, so these four references are
expected to be normalized by that migration. Lease billing inputs, lease
tenant/property links, assignment property links, overlapping charge
reconciliations, shared document storage paths, duplicate guarantees, and
cost allocation/property links also returned zero. The target has four
legacy lease documents but does not yet have `document_type`, `status`, or
`signed_date`; the pending contractual-document migration will initialize
them as supporting documents.

The separate portfolio-reference migration was also checked against its
complete list of 39 child/parent UUID links in the current target schema.
Every link returned zero missing or cross-portfolio parents. The lease
`tenant_ids` JSON shape and linked-tenant scope checks also returned zero.

This is a point-in-time, selected-precondition check, not a full rehearsal or
permission to migrate. Re-run it immediately before any approved migration.
The 29-versus-124 migration history mismatch, absent recovery rehearsal,
missing backend capabilities, and nonzero financial consistency audit remain
release blockers. No production data or schema was changed.

## Guarded Demo tenant status repair prepared (2026-11-15)

Lovable still stores three tenant statuses that disagree with linked leases.
The new read-only `scripts/preflight-demo-tenant-statuses.sql` pins their IDs,
portfolio, old statuses, exact server versions, derived statuses, and absence
of any fourth mismatch. All three checks returned zero on Lovable. The manual
`scripts/repair-demo-tenant-statuses.sql` is prepared but **not executed**:
under a table lock, it repeats those assertions, records three exact
before-images in a non-public audit schema, and changes only those three
statuses in one transaction. Four isolated PostgreSQL tests cover the result
and rollback after a tenant version change, lease-stage change, or new
unreviewed mismatch. A fresh preflight and separate write approval are
required before any live repair; this is not a substitute for the unresolved
backend migration and recovery rehearsal.

## Tenant display version and confirmed test-lease impact (2026-11-15)

The portfolio loader derives tenant status from linked leases so legacy
database drift does not appear in the UI. It previously also replaced the
tenant's `updatedAt` with a local timestamp without saving that version.
Optimistic writes on those tenants could then fail as stale. Loading now keeps
the server version while showing the derived status; a focused AppContext test
confirms that a tenant edit sends the original expected version. The
88-test lease-persistence file and the complete 881-test suite pass, as do the
production build, app TypeScript, lint, and whitespace checks. Lovable still
has three stored tenant status mismatches; this UI fix does not silently
rewrite them.

Read-only Lovable detail checks confirm that deleting the already-classified
test leases `HUB`, `REZ`, and `REZ2` would resolve all three non-draft leases
without any unit, three of six leases without a main unit, three of four
leases without status history, the sole signed-after-end anomaly (`REZ2`),
and the sole active lease without a current unit (`HUB`). These are projected
effects, not a deletion: the target data remains unchanged. `QA-INDEX-001`
and `RAT1` have not been classified by the owner, so neither is included in
the prepared cleanup.

## Retimed lease receivable cycle guard (2026-11-15)

Changing a lease due day could retain an already-paid or already-due bill and
generate a second bill for the same period on the new due date. The lease
schedule reconciliation now matches retained rows by lease, item type, period,
and cycle end as well as exact due date. A missing legacy cycle end matches
conservatively; two amendment segments with different known cycle ends remain
distinct. The new `20261115001000_guard_retimed_receivable_cycles.sql` migration
applies the same check to direct database writes and makes the scheduled writer
skip an already-billed cycle. Its advisory lock serializes candidates for the
same lease/type/period even when due dates differ. Tests cover paid, overdue,
legacy, separate-segment, direct-write, scheduled-write, and the lease edit
path. The production schema and financial-data gates now attest this behavior.

Production build, app TypeScript, lint, `git diff --check`, and the complete
879-test suite passed after the behavioral change; the subsequently added
lease-edit integration test passed in its 87-test file. The current read-only
Lovable audit finds **zero** retimed-cycle collisions, but the new schema check
is false there: **46 of 55** capabilities are missing. The financial audit has
27 nonzero checks among 51. No Lovable schema, data, or published code changed.

## Targeted Demo repair preflights refreshed (2026-11-15)

The read-only Lovable preflight for `BAIL-BER-001` still returns zero for all
ten checks. It verifies the exact lease and two assignments, 72 open schedule
rows, expected monthly slots, and absence of linked receipts, allocations,
reconciliations, or amendments. The target catalog confirms that the only
foreign keys referencing `receivable_items` are from
`charges_reconciliations` (`SET NULL`) and `receipt_allocations` (`CASCADE`),
both covered by the preflight. The four focused local repair tests pass,
including rollback when a receivable has been paid, a new row appears, or an
allocation is linked. The guarded repair has **not** been executed on Lovable.

The owner classified `HUB`, `REZ`, and `REZ2` as test leases to remove. Their
read-only deletion preflight still returns zero for all ten checks, and the
three focused local cleanup tests pass, including rollback after a lease
change or a newly linked receivable. The deletion has **not** been executed
on Lovable. The read-only target scope remains in force; neither result is
permission to run a write. The tracked `.env` contains only a public project
identifier, Supabase URL, and publishable key, not a server secret.

## Published CSP resource-directive gate (2026-11-15)

The production-header verifier now checks the exact `style-src`, `font-src`,
`worker-src`, `manifest-src`, and `media-src` restrictions from the deployable
`_headers` template, in addition to scripts, connections, images, and document
protections. Regression tests reject missing or wildcard versions of each new
directive while accepting the actual template and a rebound Pages origin. A
fresh read-only check of `https://rentflowing.lovable.app/` still fails: CSP,
anti-framing, noindex, and several permissions restrictions are not delivered.
The full local suite passes 874 tests in 156 files, and lint and whitespace
checks pass. The published host was not changed. Security headers remain a
release blocker.

## Local browser smoke and signup mismatch (2026-11-15)

The current checkout serves at `http://127.0.0.1:8083/` (port 8082 was already
occupied). In the in-app browser, unauthenticated navigation loaded the sign-in,
create-account, and password-reset pages without a blank screen. Authenticated
routes redirect to sign-in in this fresh browser, so this is not evidence for
portfolio, lease, payment, or document workflows. The read-only Supabase Auth
settings check still fails because email signup is disabled. The local auth
pages now read that public setting: the sign-up route shows a closed-registration
state without collecting personal details, and sign-in hides its create-account
link. The browser confirmed both behaviors; focused tests cover disabled,
enabled, and unavailable settings. If settings cannot be read, the form remains
available and the backend remains authoritative on submission. No form was
submitted and no account or target data changed. The published UI is unchanged
until deployment. Production onboarding remains blocked until the owner decides
whether signup should be enabled. Final local verification passes 873 tests in
156 files, production build, app TypeScript, lint, and tracked-file whitespace
checks; the edited untracked files also pass a trailing-whitespace scan.

## Lovable migration baseline preflight (2026-11-15)

The target still has 29 recorded migrations versus 124 local versions. Its 29
stored SQL hashes match the verified Lovable-to-local version map exactly, but
all 29 target version identifiers differ from their local counterparts and 95
later local migrations are absent. The new read-only
`scripts/preflight-lovable-migration-history.sql` checks this precise baseline
without requiring a Supabase management token. It returned zero changed or
missing rows, zero unexpected versions, and zero already-remapped versions on
Lovable. A PGlite test confirms it uses the same 29 mappings as the guarded
reconciliation script and detects changed SQL or partial remapping. No history
was rewritten and no migration was applied. The complete local suite passes
868 tests in 155 files, and lint passes. This is only baseline evidence;
real-data migration rehearsal and an approved recovery route remain required.

## Target-schema gate avoids false positives (2026-11-15)

The read-only release check no longer treats the mere existence of
`scheduled_job_health` or `lease_document_types` as proof of readiness. It
requires the job table's columns, key, allowed names, RLS, service write/read
privileges, and absence of client privileges. It also requires custom document
type columns, validated format/uniqueness constraints, and both type-enforcement
triggers. Local tests prove each check turns false when a required right,
column constraint, or trigger is removed; the full local migration chain still
satisfies all 54 checks. The complete local suite passes 867 tests in 155
files, and lint and tracked-file whitespace checks pass. A fresh read-only
Lovable query still reports 45
missing capabilities out of 54, including both hardened checks. No target
schema or data was changed.

## Scheduled receivable pagination under concurrent edits (2026-11-15)

The scheduled receivable job previously paged filtered portfolios and leases
by offset. If an earlier row left either result set while the job ran, the
next page could skip an unprocessed row yet still record success. The job and
Edge Function now use ordered ID cursors (`id > last_id`), including the
secondary property, assignment, amendment, change, and receivable reads.
Fail-closed checks reject missing, repeated, oversized, or out-of-order pages.
Focused tests reproduce the former lease, portfolio, and secondary-row skips;
26 focused tests and the complete 861-test suite pass, as do Deno 2.9.6 type
checking, production build, app TypeScript, lint, and `git diff --check`.
New rows inserted behind the cursor during a run may still wait for the next
scheduled pass; this is not a transactional database snapshot. The target Edge
Function is currently absent, so no Lovable billing behavior changed yet.
The edited files are untracked in this checkout; a separate trailing-whitespace
scan found no issues, while `git diff --check` alone does not inspect them.

## Fresh dependency, backend, and public-host checks (2026-11-15)

`npm audit --audit-level=high` against the current lockfile reports zero
vulnerabilities. Deno 2.9.6 checks all three Edge Functions successfully
using a temporary ARM-compatible executable; the machine's installed
`/usr/local/bin/deno` is the wrong architecture, so do not use it as evidence.
These are local checks on the current dirty checkout, not on a release commit.

Fresh read-only checks of `https://rentflowing.lovable.app` still fail the
production header gate: the required CSP directives, `X-Frame-Options`,
`X-Robots-Tag`, and five `Permissions-Policy` restrictions are missing or
invalid on `/`. `HEAD /release.json` returns HTTP 404, so the published
revision cannot be attested. The existing backend's public Auth settings
still fail the signup gate because email signup is disabled. No production
host, Auth setting, database, or document was changed. An alternative static
Pages deployment could apply `dist/_headers` while retaining the Lovable
backend, but only after the owner chooses that host and the exact released
revision is verified. This does not address the 45 failed backend schema
checks or replace an authenticated workflow rehearsal.

## Lifecycle job lock integrity and current target gate (2026-11-15)

`advance_due_lease_lifecycle_for_zone` previously used `SKIP LOCKED`, so a
concurrent edit could make a due lease disappear from an otherwise successful
scheduled run. Migration
`20261115000000_avoid_silent_lifecycle_skips.sql` replaces that function with
a blocking row lock and a 15-second lock timeout. A timeout fails the job
without advancing its success marker; a later run must retry. The read-only
schema gate now requires this body, timeout, and service-only execution.
All 124 local migration versions, the 32-test migration-chain suite, and the
17-test schema-gate suite pass. The complete local suite passes 856 tests in
154 files; production build, app TypeScript, lint, and tracked-file
`git diff --check` pass. This migration has not been applied to Lovable.

The current read-only Lovable schema check returns **45 failed capabilities
out of 54**, including the missing lifecycle function and scheduled-job health
table. Its stage audit finds six leases behind their dates: two real signed
leases (`BAIL-AMS-002`, `BAIL-PAR-003`), the confirmed test leases `HUB`,
`REZ`, `REZ2`, and `RAT1` (not yet classified). Three tenant records also
disagree with linked lease stages: Luca Bianchi is stored applicant but has
an active lease, Sophie Martin is stored former but has a signed lease, and
Albert Petkovic is stored active with only the draft `test` lease. The target
data and scheduler were not changed. Production remains NO-GO until the
backend is deployed, data discrepancies are resolved, and the scheduled run
is observed successfully in the target environment.

## Legacy billing-period metadata in closure review (2026-11-15)

The current read-only Lovable audit finds 30 rent/charges schedule rows without
`cycle_index` or `cycle_end_date`, all dated January through March 2026 across
five leases. Some are already paid or partially paid. Current formulas on
`BAIL-AMS-001` and `BAIL-BRU-003` are six and twelve months respectively,
so their historical cycle windows cannot safely be inferred from the current
lease settings alone. The lease closure and move-out dialogs now separately
warn about billed rows whose period end is unknown; they do not claim a
proration or alter those rows. A targeted helper regression test and app
TypeScript check pass. Historical contract/amendment evidence is still needed
before any metadata backfill or payment-linked repair. No Lovable data changed.

## Move-out receivable review in the UI (2026-11-15)

The move-out dialog now warns for both scheduled and actual dates when an
existing billed cycle crosses that date or a future receivable is already
paid, allocated, or otherwise protected. It reuses the closure review logic
and has move-out-specific English and French copy. Open future rows are not
shown as protected because the save path can regenerate them. The UI does
not silently delete or reclassify protected rows; the `BAIL-LON-001` decision
remains open. Local production build, app TypeScript, lint, and seven targeted
tests pass. The preview responds at `http://127.0.0.1:8082/`; an authenticated
browser smoke test and backend deployment are still pending.

## Confirmed Demo test-lease cleanup prepared (2026-11-15)

The owner confirmed `HUB`, `REZ`, and `REZ2` are tests to remove. A fresh
read-only Lovable run of `scripts/preflight-demo-test-leases.sql` returned zero
for all ten checks. PostgreSQL catalog inspection found eight tables with
lease foreign keys, all covered by the preflight. The two tenants also have
other active leases, so deleting these three test leases does not by itself
make either tenant former. `scripts/delete-demo-test-leases.sql` is prepared
for a privileged, separately approved manual run: it pins the three IDs,
references, stages, portfolio, and last-update timestamps; locks their rows;
refuses any linked business record; and verifies exactly three deletes in one
transaction. Three local PGlite tests pass for the clean deletion, changed
lease, and newly linked receivable. It has **not** been run on Lovable. The
previous read-only scope remains in force until the owner explicitly approves
this irreversible write, with no export or additional fees as requested.

## Actual move-out billing audit (2026-11-15)

The read-only target financial audit now has 50 checks, 27 nonzero. Three new
checks distinguish open schedule rows after actual move-out, already-paid or
allocated rows after move-out, and active leases whose actual move-out date
has passed. They found 29 open rows, one paid row, and one active lease, all
on `BAIL-LON-001` with actual move-out recorded as 2026-06-30. The open
post-move-out rows total GBP 28,680 outstanding. A GBP 120 charges row due
2027-09-01 is marked paid with GBP 120 allocated on the receivable but has
zero receipt-allocation links; it must not be deleted or reclassified without
a contractual/accounting decision. The local receivable generator already
uses actual move-out as an end boundary, and the edit path regenerates future
unpaid rows, but this historical target data has not been reconciled. Ask the
owner whether the stored move-out date ends billing or whether rent remains
contractually due afterward. No Lovable rows were changed.

## Effective lease windows for unit availability (2026-11-15)

An assignment left open no longer reserves a unit beyond its lease end or
actual move-out date. The frontend overlap helper and the lease creation,
lease editing, and amendment activation RPC checks now use the effective
intersection of assignment and lease windows. Same-day end/start boundary
touching remains allowed. The new, not-yet-deployed
`guard_cross_lease_unit_overlap` migration also checks cross-lease conflicts
after assignment and lease date/status writes, at transaction end, locking
the unit row to serialize concurrent reservations. The schema gate requires
both triggers. Local tests cover creation after a prior lease end despite an
open assignment, editing and amendment activation against that case, boundary
touching, and rollback when a lease extension or status change creates an
overlap. The full migration chain passes locally. A restored-target concurrency
rehearsal and authenticated browser test remain necessary.
Final local verification for this change: 123 unique migration versions,
846 tests across 152 files, app TypeScript, lint, production build, and
tracked-file `git diff --check` pass.

The current read-only Lovable financial audit has 47 checks, 24 nonzero.
`overlapping_cross_lease_unit_assignments` returned zero, while the separate
same-lease overlap check found the one `QA-INDEX-001` pair. No target schema
or data was changed.

## Same-unit overlap guard and pricing preflight (2026-11-15)

The new, not-yet-deployed `guard_same_lease_unit_overlap` migration rejects
overlapping assignment windows for the same lease and unit, including two
identical rows. A same-day end/start boundary remains permitted. The check is
deferred to transaction end, serializes writes on the unit row, and allows a
coordinated handoff in one transaction. The schema gate requires the enabled
trigger. Local PGlite tests cover overlap, boundary touching, and handoff;
the full migration chain and schema gate pass. Concurrent target transactions
still need a restored-data rehearsal. The read-only target audit now has 46
checks, 24 nonzero; its new `overlapping_same_lease_unit_assignments` check
finds exactly one pair, the two `QA-A01` rows in `QA-INDEX-001`. No target
rows were changed.

For `BAIL-AMS-003`, `BAIL-LON-001`, and `BAIL-LON-002`, the read-only
`scripts/preflight-lease-unit-share-backfill.sql` checks exact lease,
assignment, and unit identities; scope; dates; currencies; prices; null
shares; absence of extra assignments; and amendment price/unit changes. All
six checks returned zero against Lovable on 2026-11-15. Repeat the preflight
immediately before any separately approved write. This is not permission to
change the target database.
The manual `scripts/repair-demo-assignment-pricing.sql` is prepared but has
not been run on Lovable. It locks the three exact leases, units, and assignment
rows, rechecks the identity, terms, price basis, null shares, extra assignments,
and amendment changes in one transaction, and updates only those three unit
shares. Four local PGlite scenarios prove the expected values are written and
that a changed lease amount, extra assignment, or pricing amendment aborts
with all three shares still null. It must only be
run after explicit approval, a fresh read-only preflight, and a backend
rehearsal. It does not correct the separate `BAIL-LON-001` lifecycle issue.

## Date-window lease amount guard and Demo cleanup preflight (2026-11-14)

The new, not-yet-deployed `guard_lease_assignment_totals` migration rejects
open lease/assignment edits when the monthly rent or charges differ from the
sum of the unit shares at any current or future assignment boundary. It also
checks a lifecycle-stage change, so a legacy mismatched draft cannot become a
signed lease without being corrected. Checks are deferred to transaction end
so coordinated edits remain possible. The
creation RPC and frontend validator also reject priced unit joins/exits that
would leave a later billing window inconsistent; an amendment is required to
change the lease amount for that window. The target-schema gate checks the
new trigger. Local verification passes: 121 unique migrations, app TypeScript,
lint, production build, and (after this change) 839 tests across 149 files.
None of these guards are deployed to the Lovable database yet.

The owner confirmed `HUB`, `REZ`, and `REZ2` are test leases to remove. A fresh
read-only Lovable check found no assignments, receivables, receipts, guarantees,
amendments, documents, reconciliations, or status changes on any of them.
`scripts/preflight-demo-test-leases.sql` pins their IDs, references, stages,
and dependency counts for a repeat check just before any approved cleanup.
All ten checks returned zero against Lovable on 2026-11-14.
They have **not** been deleted; the previous read-only scope remains in force.

The 45-check read-only financial audit now includes
`open_lease_window_share_total_mismatch`, which compares lease totals with
unit shares at the current/draft date and every future assignment boundary.
It found nine affected Demo leases on 2026-11-14: `HUB`, `REZ`, `REZ2`
(confirmed tests without assignments), `BAIL-BER-001` (EUR 250 lease charges
versus EUR 190 unit shares), `BAIL-AMS-003`, `BAIL-LON-001`, and
`BAIL-LON-002` (null unit rent/charges shares), `test` (draft with no unit),
and `QA-INDEX-001` (two identical priced assignments for `QA-A01`, doubling
the draft's unit totals). These are distinct repair decisions; the test-lease
confirmation does not authorize deletion of `test` or `QA-INDEX-001`. The
full target audit returned 23 nonzero checks; no data was changed.
For the three active leases with null shares, each has one assigned unit and
that unit's base rent/charges exactly match the lease totals: `AMS-O03`
(EUR 2,600 / 320), `LON-F01` (GBP 1,800 / 120), and `LON-F02`
(GBP 2,200 / 140). The first has no amendment; the London leases each have
one amendment, neither changing rent or charges. Filling the missing shares
would align current unit returns, but still needs a guarded target-data change
and explicit approval. `BAIL-LON-001` separately remains marked active despite
a stored actual move-out date of 2026-06-30; correcting shares must not hide
that lifecycle issue.
The read-only `scripts/preflight-lease-unit-share-backfill.sql` pins the three
lease/assignment/unit IDs, portfolio, status, currency, dates, null shares,
unit base prices, and lack of amendment price/unit changes. All six checks
returned zero on Lovable on 2026-11-14. Repeat them immediately before any
approved write; a changed result invalidates the proposed correction.

## Main-unit lifecycle guard verified locally (2026-11-14)

The new, not-yet-deployed `guard_lease_stage_main_unit` migration rejects a
transition to pending-signature, signed, or active unless the lease has a main
residential/commercial assignment covering the relevant property-local date.
It also rejects assignment edits or deletions that would leave a retained
pending-signature, signed, or active lease without that main unit. Both checks
run at transaction end, so an atomic edit may replace the main assignment;
deleting the entire lease is still permitted. The frontend uses the same
main-unit requirement for signing and activation, and the schema gate checks
that both database triggers remain enabled. Creation RPC validation separately
rejects ancillary-only new leases and mismatched lease/unit monthly totals.

PGlite migration-chain and targeted tests pass, including a replacement in
one transaction and removal of the last main unit. Final local verification:
120 unique migrations, app TypeScript and production build pass, and 833 tests
pass across 148 files. These are local results, not evidence that Lovable has
the migration. The target still has six non-draft leases without main-unit
coverage, including payment-linked history requiring contractual reconstruction
and three leases with no assignment. No target schema or data was changed.

## Non-draft leases without main units (2026-11-14)

The six target leases counted by `non_draft_lease_without_main_assignment`
fall into two groups. `BAIL-AMS-001`, `BAIL-BRU-001`, and `BAIL-PAR-001`
retain only parking/storage assignments despite paid schedule rows on main
units; see the payment-linked assignment gap below. `HUB` (`active`), `REZ`
(`signed`), and `REZ2` (`signed`) have no assignment at all and no linked
receivable, receipt, guarantee, amendment, or document. The owner confirmed
that these three are test artifacts to delete, not leases requiring unit
reconstruction. Their deletion remains pending and must pass
`scripts/preflight-demo-test-leases.sql` again before any write. No target row
was changed.

## BAIL-PAR-001 mixed-currency billing requires contract decision (2026-11-14)

The six `cross_currency_schedule_slots` all belong to `BAIL-PAR-001` for
rent/charges due January through March 2026. Each slot has a paid EUR row
on the apartment and an overdue GBP row on the parking unit. The six paid
EUR rows total EUR 4,500 allocated; the property is currently configured as
GBP. A seventh non-cancelled EUR receivable is an open EUR 180 repair recharge.
All seven are counted by `receivable_property_currency_mismatch`. The property
also has three EUR cash receipts totalling EUR 4,700 and four active EUR costs
totalling EUR 8,600.07, alongside 69 GBP receivables and four active GBP costs.
This is not a safe duplicate cleanup: deleting the GBP rows alone would leave
paid EUR receivables in a GBP property, while changing paid EUR rows to GBP
would misrepresent recorded payments. Changing the property's currency to EUR
would create mismatches for its substantial GBP ledger. Ask the owner to
confirm the contractual and invoice currencies before designing a repair or
revisiting the single-currency-per-property rule. No target row was changed.
The local property-currency and main-unit guards prevent new records of this
shape only after their deployment.

## Paid schedule rows with missing unit history (2026-11-14)

The read-only Lovable audit now has 44 checks. It separates 18 scheduled
receivables without a plausible assignment on their stored unit from the 17
among them already linked to receipt allocations. The paid/partially paid
rows belong to `BAIL-AMS-001` (six), `BAIL-BRU-001` (five), and
`BAIL-PAR-001` (six); one further `BAIL-BRU-001` row is still open. The only
stored assignments for those three leases are ancillary parking/storage
units, while their schedule rows reference main units. Their amendment
history refers to main-unit changes, but does not by itself prove the full
missing assignment windows or pricing. Do not delete or automatically
re-anchor these payment-linked rows. Reconstruct the missing unit history
from contractual source records on a restorable copy and verify returns,
payment links, and the financial audit before approving a targeted repair.
The new `allocated_schedule_without_plausible_assignment` gate is tested
against multiple allocations on one row and returns 17 on the target; the
local migration-chain and target-audit tests pass (50 tests across two files).
No target rows changed.

## Atomic new-lease amount guard (2026-11-14)

The not-yet-deployed `create_lease_with_schedule` migration now rejects a
new lease unless its monthly rent and charges equal the sum of the explicit
per-unit shares, rounded to cents. Missing or negative shares are rejected
before any lease, assignment, or receivable row is inserted. The focused
PGlite test covers the BAIL-BER-001 pattern (EUR 250 lease charges versus
EUR 190 unit charges), a rent mismatch, a missing share, and transaction
rollback. The local migration chain also passes. This guard is creation-only:
historical lease edits and amendments have different assignment windows and
still require a separate, date-aware backend invariant. It has not been
deployed to Lovable and does not correct BAIL-BER-001 by itself.

## Read-only target audit and BAIL-BER-001 preflight (2026-11-14)

The 44-check financial audit now runs against the current Lovable database even
though `properties.time_zone` and `properties.is_partially_owned` are absent.
It reports those two missing columns explicitly, instead of failing the SQL
before any financial checks run. Time-sensitive checks use UTC provisionally on
that old schema; this is not a substitute for migrating the property time zone.
Legacy amendment unit IDs are resolved for the mismatch check but separately
counted as four references still awaiting normalization. The live audit has
22 nonzero checks, including 48 surplus lease-schedule rows, 18 rows without a
plausible unit assignment, seven assignments missing prices, and one active
lease with unit-share totals different from the lease totals. The release gate
still fails. The local migration-chain test and target-audit tests pass (49
tests in two files). The complete local suite passes 830 tests in 147 files;
app TypeScript, `npm run build`, and tracked-file `git diff --check` pass.

`scripts/preflight-bail-ber-001.sql` is a **read-only** ten-check guard for
the specifically authorized correction preparation. All ten checks returned
zero against Lovable on 2026-11-14: one exact lease, two expected assignments,
72 schedule rows across 40 slots, the expected 32 cross-unit duplicates, no
changed balances, and no linked allocations, receipts, charge reconciliations,
or amendments. Rerun it immediately before any repair; any nonzero result
invalidates the plan below. This preflight does not authorize a write. The
production generator and duplicate guard must first be deployed and verified,
and exact before-images plus rollback must be prepared before a targeted data
transaction can be approved. No Lovable data or schema changed in this audit.

## Fail-closed receivable unit selection (2026-11-14)

When a billing caller supplies lease assignments without unit types, the
schedule generator now leaves the cycle unassigned instead of choosing the
first assignment. This prevents a future caller from silently attaching a
whole-lease bill to an ancillary unit. All production callers already pass
unit types; test fixtures were updated to state that requirement, and a
regression test covers a parking-first assignment list with missing types.
The current checkout passes 830 tests in 147 files, app TypeScript, the
production build, and `git diff --check`. This is local-only evidence; the
published Lovable code still has the first-assignment behavior.

## BAIL-BER-001 targeted billing repair preparation (2026-11-14)

On 2026-11-15 the ten read-only preflight checks were rerun against Lovable and
still returned zero. `scripts/repair-bail-ber-001.sql` now encodes the proposed
single-transaction correction with exact lease, assignment, schedule, payment,
and slot guards; four local PGlite tests cover the expected result and aborts
for paid rows, new schedule rows, and receipt allocations. The transaction now
stores one lease and 72 receivable before-images in a non-public repair schema;
the tests verify that this record commits with the correction and disappears
if the transaction aborts. The full local suite passes 865 tests across 155
files. It has **not** been run on Lovable. Exact restoration after commit would
recreate 32 double bills and conflict with the planned unit-independent
duplicate guard, so the before-images are an audit/recovery source, not a
promise of an automatic rollback. Deployment of the corrected generator and
guard, a forward-recovery decision, and separate explicit write approval remain
prerequisites to a live repair.

The user confirmed that the contractual monthly charges total is **EUR 190**,
not the stored EUR 250. The two current assignments already sum to EUR 190:
BER-W02 (main apartment) has EUR 850 rent and EUR 190 charges; BER-K01
(storage) has EUR 60 rent and EUR 0 charges. There is no amendment for this
lease. This is a data correction decision, not authorization to execute the
repair yet.

Read-only live preflight found 20 monthly billing slots from 2025-04-01 through
2026-11-01. Each type has 36 open/overdue rows: rent at EUR 910 and charges at
EUR 250. In each of the first 16 slots, one row points to BER-W02 and a second
to BER-K01. The last four slots have only the BER-K01 row. There are no receipt
allocations, cash receipts linked to the lease, or charges reconciliations
linked to these rows. Current scheduled claims total EUR 41,760; the intended
20 rent rows at EUR 910 and 20 charges rows at EUR 190 total EUR 22,000. The
EUR 19,760 difference comprises EUR 18,560 of duplicate rent/charges rows and
EUR 1,200 of excess charges on the 20 genuine cycles.

Do not repair the rows while the published generator still picks the first
assignment (BER-K01) and the installed duplicate guard still keys on unit ID:
it can recreate the same cross-unit collision. First publish and verify the
main-unit anchor and unit-independent billing-slot guard, with an approved
reversible backend deployment. Then, in a single guarded transaction:

1. Lock this lease and its schedule rows; assert the lease, assignments, 20
   slots per type, exact amounts, 16 paired slots per type, and no payment or
   reconciliation references. Abort on any drift.
2. Preserve exact before-images in a restricted in-database repair record.
   Agree on forward recovery without recreating duplicate claims: the new
   duplicate guard intentionally prevents exact restoration of the old bad
   state. A daily in-place Lovable restore is not adequate for this one lease.
3. Retain the BER-W02 row in each paired slot and remove its 32 unallocated
   BER-K01 copies (16 rent, 16 charges). Re-anchor the eight remaining BER-K01
   rows (four of each type) to BER-W02.
4. Set lease monthly charges to EUR 190 and each of the 20 remaining charges
   rows' expected/outstanding amounts to EUR 190. Keep rent at EUR 910 and
   allocated amounts at zero. Reconcile stored open/overdue status with due
   dates as a separate, explicit check.
5. Assert 40 schedule rows, one rent and one charges row per slot, all anchored
   to BER-W02, EUR 22,000 expected/outstanding in total, zero allocations,
   and coherent unit/property returns. Abort the transaction if any check fails.

No live data has been changed. The other 16 excess billing rows outside this
lease remain a separate review, and this repair does not clear the release gate.

## Full local and published-gate recheck (2026-11-14)

After the amendment date-validation changes, the complete local suite passed
827 tests across 147 files. The migration inventory validates 119 unique
versions, ESLint passes, and a fresh npm registry audit reports zero known
vulnerabilities for the current lockfile. Build and app TypeScript passed in
the preceding date-validation run. The published site remains a **no-go**:
the security-header checker rejects its missing CSP, framing, robot and
permissions protections; `/release.json` returns HTTP 404; and the backend
Auth settings check still reports signup disabled. These were read-only
network probes. They do not prove the uninstalled backend migrations,
scheduled workers, or authenticated workflows. No remote state was changed.

## Amendment calendar-date validation (2026-11-14)

Amendment validation previously relied on lexical comparisons and could let
impossible effective, signed, lease-end, or unit-end dates reach persistence.
The strict calendar-date check already used by the billing worker is now a
shared helper used by both the worker and amendment validation. An added
unit's end date is also checked. Clearing a lease end date with JSON `null`
now produces an open end instead of the literal string `"null"`. Tests cover
invalid calendar dates, an added unit's invalid end, and an intentionally
open lease. The focused amendment and billing-worker run passed 39 tests in
two files; build and app TypeScript passed. Backend migration and target
workflow verification remain outstanding.

## Added-unit amendment input guards (2026-11-14)

An amendment adding a unit could coerce missing, negative, or nonnumeric rent
or charges amounts to zero, masking a bad financial input. Validation now
requires both finite non-negative amounts; an intentional zero remains valid.
It also rejects an added unit end date before the amendment effective date,
before the activation plan can prepare an invalid assignment. Tests exercise
client validation and activation-plan refusal. A three-period historical
test confirms charges remain 20 before an earlier amendment, 30 between
amendments, and 0 after a later unit removal. The complete local run passed
825 tests in 147 files, build, and `git diff --check`. Target backend and
authenticated workflow verification remain outstanding.

## Successive amendment pricing order (2026-11-14)

The effective-terms calculation treated any earlier explicit rent or charges
total as permanently authoritative, even when a later amendment changed unit
shares, removed a unit, or ended its assignment. A reproduced sequence kept
charges at 30 after the sole charge-bearing unit was removed, instead of 0.
The calculation now resolves the latest relevant amendment for rent and
charges separately. An explicit total still wins over unit changes within the
same amendment; a later unit change supersedes that earlier total. Tests cover
later unit removal, later zero rent, and an end-date change that removes the
sole charged unit. The complete local run passed 823 Vitest tests in 147
files, build, and `git diff --check`. This has not been activated against the
Lovable backend; migration and target workflow checks remain release blockers.

## Lease unit validation recheck (2026-11-14)

`validateLeaseUnits` accepted the lease's monthly totals but did not compare
them with the selected units' rent and charges shares. It also allowed a stale
unit ID when another valid main unit remained selected. The client validation
now blocks both discrepancies, compares money at cent precision, and names the
missing unit. Eight focused tests pass, including rent mismatch, charges
mismatch, floating-point totals, and stale selection; app TypeScript and build
pass. The preceding full local run passed 817 tests in 147 files, before this
additional validation. This is client-side protection only: existing target
data, backend RPC validation, and the release's live-data audit still require
separate verification.

## Amendment zero-share recalculation (2026-11-14)

The effective-terms projection previously retained a lease's old monthly
charges or rent after a structural unit amendment when the remaining live
assignment shares summed to zero. Removing the only charge-bearing unit could
therefore leave future charges receivables in the activation plan. Structural
unit changes now recompute both totals even when either sum is zero, unless
the amendment explicitly sets that total. A regression test activates the
removal and verifies zero lease charges and no new charges receivables.
The complete local run passed 147 Vitest files and 817 tests, `npm run build`,
and `git diff --check`. No Lovable migration, receivable, or deployment changed;
target reconciliation and live workflow verification remain required.

## Lovable migration-history recheck (2026-11-14)

The connected Property Hub project still records 29 migration rows. A fresh
read-only query compared the stored SQL MD5 values with the first 29 local
migration files: all 29 contents match exactly, while none of their version
identifiers match. The existing reconciliation SQL maps this verified snapshot
to local versions; it now locks the history table for the transaction so a
concurrent migration cannot change the checked row set before the update.
Focused PGlite tests passed (11 tests across the reconciliation and target
migration checks), including rejection of changed SQL, an unexpected target
migration, and a partially remapped history. No reconciliation ran on Lovable.
Read-only spot checks still found 48 excess lease-schedule rows and 7
non-draft lease assignments without explicit rent or charges shares. The
target still lacks custom document types, partial-property ownership, and
cost-amortization fields, although the lease indexation column exists.
These checks strengthen the release evidence but do not replace a restored-data
rehearsal, later migrations, or published-app verification. Decision: **no-go**.

## Lovable recovery options (2026-11-14)

Read-only inspection of the matching Lovable project's Database → Manage →
Backups view confirmed daily restore points from 2026-10-31 through
2026-11-14; the latest was taken at 05:07:37 UTC on 2026-11-14. No restore
or export was started. [Lovable's backup documentation](https://docs.lovable.dev/features/database-backups.md)
says the daily backup restores the **same** database, cannot be undone, and
loses every data/schema change made after that restore point. It does not
include Storage files or reliably restore scheduled jobs. Lovable offers no
on-demand restore point from that screen. These backups provide a limited
recovery path, not an isolated rehearsal of the 90-version local/target
migration-history gap or an exact pre-deployment rollback. The user declined an export and
extra charges; do not treat backup availability alone as permission to migrate
or clean the live database. The release decision remains **no-go**.

## Lovable read-only recheck (2026-11-13)

Latest complete local verification on 2026-11-13: 147 Vitest files and 814 tests
pass; ESLint, app TypeScript, `npm run build`, and tracked-file
`git diff --check` pass. The generated release marker still reports
`dirty: true`, so these checks do not constitute a publishable release
revision. The build regenerates local `dist/` only; it does not publish.
All three Edge Functions pass `deno check` under Deno 2.9.6, matching the
CI version. The machine's installed Deno binary is for an unsupported CPU,
so this check used a temporary compatible runtime without adding a project
dependency.
The first `npm audit --audit-level=high` attempt could not resolve
`registry.npmjs.org`, so it supplied no security result. A second read-only
run with network access on 2026-11-13 succeeded and reported zero
vulnerabilities for the current lockfile. Repeat this on the exact release
lockfile if it changes before merge.
Fresh public HTTPS checks on 2026-11-13 confirmed that the published
`https://rentflowing.lovable.app/release.json` returns HTTP 404 and
`check-production-headers` rejects the home page for missing required CSP,
`X-Frame-Options`, `X-Robots-Tag`, and Permissions-Policy protections.
`check-auth-settings` again fails because Supabase Auth signup is disabled.
These are live deployment/backend-setting failures; local build success does
not clear them.

The connected Lovable workspace now exposes the matching **Property Hub**
project (`34e2867a-488c-4539-a6be-1aa7433b0cae`). Its committed SHA is
`b30c4095c3d70e42bca38f0ab21230b790e04a41`, matching local `HEAD`,
but this checkout has uncommitted work and is not a release revision. The
project's `.env` names the expected Supabase project. Only Lovable read and
`SELECT` operations were used; no live rows, schema, or deployment changed.

- The target still records 29 migrations, ending at `20260622145643`, while
  this checkout contains 119 migration files. The eight lease indexation
  columns and three validated constraints are present, so migration history
  alone does not describe the live schema.
- The target lacks `lease_document_types`, the document deletion outbox,
  scheduled-job health table, and `cron` schema. It also lacks the property
  `time_zone` and `is_partially_owned` columns, lease-document contractual
  fields, and cost amortization recognition fields. The required
  `create_lease_with_schedule`, `save_lease_with_tenant_statuses`,
  `close_lease_atomically`, and `insert_due_lease_receivables` functions are
  also absent. The missing property
  columns are a direct explanation for why client features depending on them
  cannot be accepted against this backend.
- The financial audit still finds 48 excess lease-schedule rows across 48
  colliding slots: 34 same-bill and 14 different-bill slots. By lease, the
  collisions are `BAIL-BER-001` 32, `BAIL-BRU-001` 6, `BAIL-PAR-001` 6,
  `BAIL-AMS-001` 2, and `BAIL-PAR-003` 2. The six Paris slots mix currencies.
  No duplicate was removed by this audit.
- Other nonzero findings: 30 lease-schedule rows lack cycle metadata, 18
  rent/charges receivables have no plausible matching assignment window,
  7 receivables,
  3 receipts, and 4 active costs disagree with their property's currency,
  3 non-draft leases have no unit assignment, 6 have no non-parking/storage
  assignment, 4 leases lack status history, 1 signed date follows the lease
  end, 4 amendment changes reference a mismatched/missing unit, 1 profile's
  default portfolio has no matching membership, and 3 tenant statuses
  disagree with their linked leases. The three tenant mismatches
  are one each: active stored/applicant expected, applicant stored/active
  expected, and former stored/applicant expected.
- The 41-check financial audit now also detects assignments without explicit
  unit rent or charges. A read-only Lovable query found seven such assignments
  on non-draft leases. All seven leases have one unit; three are active
  (`BAIL-AMS-003`, `BAIL-LON-001`, `BAIL-LON-002`) with 64, 72, and 44
  existing rent/charges schedule rows respectively. Their saved lease totals
  and existing bills are nonzero, but their assignment shares are NULL.
  `BAIL-LON-001` has only an end-date amendment, not a recorded pricing
  change. The local scheduler now refuses to reconstruct historical pricing
  from missing shares if an applied pricing/unit amendment lacks an explicit
  old base amount. New assignments must provide finite nonnegative shares;
  the local trigger permits incremental repair of old NULL rows. No target
  shares were inferred or changed.
- The new active-lease share check compares current unit rent and charges
  shares with stored lease totals on the property's business date. Because
  the target lacks `properties.time_zone`, it cannot yet run there as part of
  the full audit. A read-only target query using the current database date
  found one fully priced mismatch: `BAIL-BER-001` records 250 monthly charges,
  while its two unit shares sum to 190. The lease has no pricing amendment.
  Its existing schedule also contains the already-counted duplicate full
  rent and charges bills on both units. No amount or assignment was changed.
- A read-only recheck separated non-rent legacy payment rows from the unit
  assignment audit. The previous 21 findings included two advance-payment
  rows and one deposit row due before lease start; those are not rent/charges
  billing cycles. The corrected audit and detail query report 18 rent/charges
  rows: six each on `BAIL-AMS-001`, `BAIL-BRU-001`, and `BAIL-PAR-001`.
  Seventeen have receipt allocations and one is open. A PGlite regression
  test verifies that pre-lease advance/deposit rows do not inflate this
  metric, while a genuinely orphaned rent row remains flagged. The 18 rows
  still require document-backed investigation; none was changed or deleted.
  After this audit-query correction, 45 focused financial-audit and migration
  tests passed in two files. The later 806-test full run includes this
  correction.
- A further read-only Lovable detail check confirmed that all four legacy
  amendment unit references (`u1`, `u6`, `u8`, `u10`) each resolve to exactly
  one unit in the correct lease property. Normalizing those references is
  possible with the existing local migration, but it is not installed on
  the target. It would not by itself restore missing historical assignments.
  `BAIL-AMS-001` has six orphaned rent/charges rows for `AMS-O01` (10,350
  expected and allocated), `BAIL-BRU-001` has six for `BRU-A01` (3,750
  expected, 3,300 allocated), and `BAIL-PAR-001` has six for `PAR-A01`
  (4,500 expected and allocated), all due January-March 2026. The 18 rows
  total 18,600 expected and 18,150 allocated. These are not safe to delete
  as duplicate receivables: 17 carry payments. No target data was changed.
- The arithmetic, positive-receipt balance/status, allocation currency,
  receipt scope, and receipt-allocation property checks returned zero. Four
  audit queries could not run against this older schema: property cost
  overallocation needs `is_partially_owned`, while active-unit,
  active-lease-share, and date-derived lease-stage checks need `time_zone`.
  These are unverified, not passing checks.
- All 25 existing public tables with `portfolio_id` have RLS enabled. The
  10 existing core-table read policies checked use `is_portfolio_member`;
  this does not prove every RPC or Storage path is isolated. The private
  `lease-documents` bucket still has no server-side file-size or MIME limit.
  Its authenticated upload/delete policies check membership, not writer
  permission, and the delete policy does not protect referenced files.
- The then-complete 46-check read-only target-schema attestation was executed
  through Lovable in seven small `SELECT` batches: **9 pass, 37 fail**.
  Indexation, portfolio-wide RLS activation, existing read-policy membership
  checks, Storage object RLS/read, and the older duplicate-schedule trigger
  are among the passes. The contractual-document model, cost amortization,
  atomic lease/receipt/amendment/cost RPCs, payment and guarantee guards,
  lease-wide duplicate protection, writer-only document upload, protected
  document deletion, and scheduled-job health are among the failures. This
  checks capabilities directly, not only migration version numbers.
  The lease-billing-input, retained-receivable-assignment, and new-assignment
  pricing checks expand the required set to 49. All three were checked
  separately and failed: none of the four new lease constraints nor either
  assignment trigger is installed. The 49-check bundle has not been rerun on
  the target.
- Authenticated clients still have table privileges to insert/update leases
  and insert/update/delete lease-unit assignments. RLS remains active, but
  these direct writes can bypass the transactional business workflows. The
  two lease-document INSERT/UPDATE policies check portfolio membership only;
  neither checks that the referenced lease belongs to the same portfolio.
  These observations explain the failed write-scope and restricted-write
  gates; they are not a claim that anonymous users have those privileges.
- The local due-receivable scheduler now loads all applied amendment changes.
  Each generated cycle uses the rent, charges, billing tenant, and indexation
  terms effective at its start. Missing pre-amendment base rent/charges
  values, missing historical indexation snapshots, or missing index values
  when an indexed positive rent becomes due mark the lease incomplete rather
  than silently inserting an incorrect bill. Tests
  cover successive indexation changes, historical rent/charges/tenant changes,
  incomplete indexed billing, and a zero-rent charges-only exception. The
  shared decimal import is type-safe in both Vite and Deno. The complete
  local gate passed 806 tests in 146 files, build, lint, app TypeScript,
  tracked-file `git diff --check`, and Deno checks of all three Edge
  Functions. This is local code evidence only: Lovable still has no deployed
  receivable scheduler or required backend RPCs.
- The server scheduler now rejects invalid persisted due days, rent-formula
  periods, monthly amounts, and lease date windows rather than substituting
  defaults or silently omitting bills. Local migration
  `20261113230000_guard_lease_billing_inputs.sql` adds four validated lease
  constraints; the target-schema release gate checks their presence. A
  PGlite regression test rejects negative, NaN, and infinite amounts as well
  as invalid due days, periods, and date windows. The complete local gate
  passed 806 tests in 146 files, build, lint, app TypeScript, Deno check of
  the scheduled billing function, and `git diff --check`. Read-only Lovable
  queries found zero existing leases violating these rules, but zero of the
  four new constraints installed. No target migration or data change occurred.
- Amendment validation now rejects missing or stale unit references, unknown
  unit-assignment actions, invalid rent/charges values, and malformed
  indexation settings before activation. A scheduled-activation regression
  test confirms that a stale-unit amendment is marked incomplete and does
  not invoke the activation RPC. The 806-test local gate includes these
  cases; the backend target does not yet have this revision or a restored-data
  rehearsal.
- Local migration `20261113231000_guard_retained_lease_receivable_assignments.sql`
  adds a deferred database trigger: shortening, moving, or deleting a unit
  assignment cannot orphan an already-issued rent/charges receivable. It
  permits a replacement assignment or removal of an unpaid future bill in
  the same transaction, and does not block unrelated edits merely because
  legacy orphan rows exist. The complete migration-chain and focused PGlite
  tests pass. A lease closure with a protected paid future bill is now
  refused until that bill is reconciled; the end/terminate dialogs show this
  reason before submit. This prevents creating another historical anomaly,
  but does not repair the 18 existing target rows. A read-only Lovable query
  confirmed the trigger is absent there. Local gate: 806 tests in 146 files,
  build, lint, app TypeScript, and `git diff --check` pass.
- Local migration `20261113232000_guard_new_assignment_pricing.sql` prevents
  new NULL, negative, NaN, or infinite assignment shares. The migration chain
  and schema-attestation tests cover it, including a disabled or
  client-executable guard. Existing legacy NULL shares can be repaired one
  field at a time. The current local gate passes 814 tests in 147 files,
  build, lint, app TypeScript, `git diff --check`, and Deno 2.9.6 checks of all
  three Edge Functions. A direct read-only Lovable check confirmed that the
  guard is absent on the target. The generated release marker is still dirty.

This fresh backend and public-host evidence keeps the decision **no-go**.
Do not apply migrations or clean data without a reversible rehearsal and
explicit review of paid/cross-currency billing history.

## Current decision (2026-11-07)

**No-go for real customer data.** The latest complete local run passed 784
Vitest tests in 142 files after hardening money rounding, atomic mutation
acknowledgements, lease-document loading across navigation, account-scoped
portfolio loading and creation, and profile read/write failure handling.
Lint, app TypeScript, and the production build pass on this checkout.
Fresh read-only public checks on 2026-11-07 confirm `/release.json` still
returns HTTP 404 for GET and HEAD, and `check-production-headers` still fails on the published
Lovable home page: the required CSP directives, `X-Frame-Options`,
`X-Robots-Tag`, and five Permissions-Policy restrictions are absent or invalid.
HSTS is present, but it does not compensate for the missing protections. The
Supabase Auth settings return `disable_signup: true`,
`mailer_autoconfirm: false`, and `external.email: true`, so the signup gate
fails specifically because registration is disabled. `npm audit
--audit-level=high` against the current lockfile found zero vulnerabilities.
These checks read public endpoints only; no deployment, account or data was
changed. Target schema/data checks still need project-scoped management read
access, and backend migrations still need a reversible rehearsal.
The production build, ESLint, app TypeScript, and tracked-file
`git diff --check` pass; rerun them on the exact release revision.
The local migration chain now contains 116 versions. Rerun the full suite
on the release revision.
The read-only target migration gate now compares stored SQL MD5 with all 116
local SQL files, not just their version numbers. Seven focused tests reject
missing or altered content in both legacy and recent migrations. A matching
history record still does not prove the target schema or data is correct; the
separate schema and data gates remain mandatory.
Its generated `dist/release.json` correctly reports
`dirty: true`, so this is not a release artifact. The last successful public
check of the Lovable host found missing required security headers and HTTP 404
for `/release.json`. A fresh read-only HEAD request on 2026-11-07 again
returned HTTP 404 for the marker. Target migrations
are incomplete and scheduled processing is
absent. Restored-data rehearsal, authenticated workflows, and legal/privacy
review are not yet verified. The user declined an export or added cost; do not apply the pending
migrations to the live database without a reversible rehearsal. The online
dependency audit ran against the npm registry on 2026-11-07:
`npm audit --audit-level=high` reported zero vulnerabilities. Repeat it on
the exact release lockfile before merge.
Fresh read-only public checks on 2026-11-07 confirm the published home page
fails `check:production-headers`: CSP frame/object/base/script protections,
`X-Frame-Options`, `X-Robots-Tag`, and the five required Permissions-Policy
restrictions are missing or invalid. `/release.json` returns HTTP 404, and
the published `robots.txt` is still the older multi-bot allowlist. These are
deployment failures, not evidence that the local build is broken; the local
changes have not been verified on the published host.
The optional no-extra-fee Cloudflare Pages staging path is documented in
`SECURITY.md`: it can serve this Vite frontend and its `_headers` while keeping
the existing Lovable backend. A Pages build now fails if `PUBLIC_APP_ORIGIN` is
missing, preventing publication of a CSP bound to the Lovable URL. No Pages
account/project was created and no site was deployed. Backend migrations,
recovery rehearsal, authentication redirects, and live workflow checks still
block launch.
On 2026-11-07, the focused header tests (3/3), a simulated Pages production
build with an example `PUBLIC_APP_ORIGIN`, the full 672-test suite, ESLint,
app TypeScript, and `git diff --check` passed. The
generated `dist/_headers` used that example origin in `script-src`; this is
build evidence only, not evidence that Pages serves the headers or that a
deployed site passes its checks.
The release stamp now rejects a CI or Cloudflare commit SHA that differs from
the checked-out Git commit. A deliberately wrong SHA failed before writing a
marker; a normal local build succeeded. Four focused provenance tests and
the full suite pass. This prevents a misconfigured build from claiming a
different revision, but it does not make the current dirty checkout releasable.
Many release-related files are currently untracked; `git diff --check` alone
does not inspect them. A clean, reviewed commit and CI run remain required.
The local build now hashes the favicon and robots file alongside generated
assets, and the deployment gate rejects a missing or changed copy. The app's
HTML and static-host header template request `noindex, nofollow`; the header
checker requires that directive on the home and lease routes. The robots file
allows crawling so crawlers can observe `noindex`, as Google documents at
https://developers.google.com/search/docs/crawling-indexing/block-indexing.
Legacy Lovable social preview metadata was removed. This is indexing hygiene,
not an access-control mechanism. The published host has not been verified to
serve the new HTML, assets, or header; it remains no-go.
The release marker now records the SHA-256 fingerprint of the frontend
Supabase publishable key, and the deployment verifier compares it with the
key used for the Auth-settings check. The build and a local read-back confirm
the fingerprint matches the configured key without placing that key in the
marker. A missing or mismatched fingerprint fails the verifier. This closes
the gap where the correct backend URL but a wrong frontend key could pass
the release check; it does not prove live login works.

Do not accept real tenant, lease, document, or payment data until every blocking
item below has dated evidence against the exact revision and backend to deploy.

The local `20261107190000_restrict_lease_metadata_writes.sql` migration removes
authenticated direct lease UPDATE and direct access to the unrestricted
`save_lease_with_tenant_statuses` RPC. The app now uses a restricted metadata
RPC for notes, status and occupancy follow-up; financial terms, tenant links,
notice/assignment boundaries and closure must use their dedicated workflows.
Local tests confirm an owner cannot bypass receivable regeneration by changing
rent or end date through metadata, and cannot reopen a closed lease through it.
The same wrapper now derives each linked tenant's expected status from all of
that tenant's leases. It rejects a forged tenant status, requires the matching
tenant update when a stage change affects status, and rejects unknown or
invalid backward lifecycle transitions. A migration-chain test covers those
denials and a valid activation that updates lease, tenant, and history together.
This migration and its client change are a single deployment unit: publishing
the client without the migration would make metadata edits fail. Neither has
been deployed or tested on the Lovable backend; the live project remains no-go.
The following `20261107200000_restrict_direct_lease_assignment_writes.sql`
migration removes authenticated direct lease INSERT and direct assignment
INSERT/UPDATE/DELETE. The atomic lease creation wrapper still succeeds in the
local migration-chain test; owner attempts to bypass it by writing a lease or
assignment directly are denied. The migration also removes direct access to
the invoker closure RPC, leaving its role-checked client wrapper. This change
is also undeployed and must be rehearsed with the rest of the backend chain.
The local `20261107210000_restrict_lease_status_history_writes.sql` migration
also prevents authenticated clients from inserting audit rows directly. The
deferred status-history trigger now runs with its owner's rights and a fixed
search path, so genuine lifecycle and contractual-document transitions retain
their audit trail. The unused browser-side history insert helper and its
obsolete tests were removed. The migration-chain test confirms a forged row
is denied while normal transitions still record history. This change has not
been applied to Lovable Cloud.
The status-history dialog no longer treats a failed read as an empty audit
trail. It shows a retryable error, and an in-flight response for a previously
selected lease cannot overwrite the current lease's history. Two focused UI
state tests cover failed-read retry and out-of-order responses; the full local
suite and production build pass. Authenticated Lovable browser behavior remains
unverified.
The local `20261107220000_guard_tenant_lease_status.sql` migration rejects
direct tenant status changes that contradict any linked lease, while allowing
manual onboarding status changes before a lease exists. The tenant form now
defaults to applicant and displays the derived status as read-only for linked
tenants; a legacy drifted status is corrected when that tenant is saved.
Local migration and integrity tests cover active, pre-active, closed, and
unlinked cases. The Impeccable mechanical detector reported no findings for
the changed form. This guard does not by itself prove that every independent
lease scheduler updates affected tenant rows when it changes a lease stage;
target scheduler and populated-data verification remain release gates.
The read-only target financial audit now includes a 32nd check for linked
tenants whose stored status disagrees with their leases. It gives active
leases priority, then draft/pending-signature/signed leases, then closed
leases; tenants without any lease are intentionally excluded. A focused
PGlite test and the complete local migration chain pass, but this new check
has not run against the Lovable target. A read-only detail query in
`scripts/audit-tenant-status-mismatches.sql` lists the affected tenant IDs,
stored/expected statuses, and linked lease stages for manual review. The
previously confirmed 120 GBP
`test2` receipt already has status `unmatched`, 120 GBP unapplied, and no
allocations, so the owner's request to leave it unallocated requires no
database change.
The 33rd audit check flags any receivable whose linked
cash-receipt allocations exceed its recorded paid amount. It deliberately
permits historical paid receivables with no synthetic cash receipt or
allocation. A focused PGlite test covers both sides, and the full local
migration-chain audit executes the query. It has not run against Lovable Cloud;
do not infer that the target's payment balances are clean.
The 34th read-only audit check flags receipts linked to a lease, tenant, or
unit outside their recorded property and portfolio scope. The matching local
`20261107230000_guard_cash_receipt_scope.sql` trigger prevents new mismatches,
including direct calls that bypass browser validation. It accepts former
tenants recorded in an applied amendment, so historical payments remain
valid. The read-only target schema gate now requires that enabled, restricted
trigger; focused PGlite tests cover missing, client-accessible, and disabled
states, and the local migration chain passes. Neither the
audit nor the trigger has run on Lovable Cloud; inspect any existing mismatches
before applying this migration on a recoverable target copy.
The 35th audit check detects receipt allocations applied to a different
property from the one explicitly recorded on the receipt. The matching local
`20261107240000_guard_receipt_allocation_property.sql` migration rejects new
cross-property allocation rows, while leaving property-less tenant receipts
usable across properties. The client candidate filter uses the same rule.
Focused SQL, client, schema-gate and migration-chain tests pass. Existing
allocations are not rewritten; review nonzero target audit results before
deploying this guard on a recoverable target copy.
Quick-pay surplus now also uses the shared receipt candidate filter. Its
previous tenant-only search could prepare another property's debt for the
same tenant and cause the entire payment RPC to fail under the new guard.
A focused regression and all 83 AppContext persistence tests pass; the
authenticated target workflow still needs browser verification.
Receipt and quick-pay forms now accept comma decimals, show invalid amounts
below the input, and refuse sub-cent values. The context enforces exact cents
before any save, while quick-pay and automatic allocation distribute balances
using integer cents. The local
`20261107250000_reject_subcent_receipt_payloads.sql` migration adds the same
precision gate before the database casts JSON amounts to `numeric(14,2)`;
the target schema gate requires that gate. Focused form, arithmetic and
PGlite RPC tests pass. This migration is not deployed, and target payment
behavior has not been verified.
The cash-receipt dialog also holds its save button disabled during an
in-flight write; a focused UI test confirms two clicks trigger one save.
Manual payment allocation now rejects the entire request if any selected
receivable is stale, ineligible, in another currency/scope, duplicated, or
would exceed the available receipt or receivable balance. Amounts are applied
in cents, and sub-cent requests fail validation rather than being rounded by
the database. Seven focused allocation tests and all 82 tests in the
persistence module pass, as do ESLint and app TypeScript.
The authenticated target workflow still needs a browser check after the
matching backend migrations are installed.
The Payments dialog now parses every entered allocation amount strictly,
including comma decimals. It shows a red reason below invalid or over-balance
fields and cannot submit a partially parsed selection. A UI test verifies an
incomplete value, an excessive value, and a corrected comma-decimal amount.
The then-current 680-test suite and production build passed locally; these results do
not attest the published Lovable interface or database.
The local scheduled-lifecycle test now covers two leases for the same tenant
in Brussels and London. Activation keeps the tenant active; ending the first
lease keeps them active while the second remains active; ending the second
sets them to former. Repeated scheduler calls leave one transition-history
entry per lease. The deployed scheduler and property-local date boundaries
still require authenticated target verification.

## Lovable target audit (2026-11-07, read-only)

The authenticated Lovable project is named **Property Hub** at
`https://lovable.dev/projects/34e2867a-488c-4539-a6be-1aa7433b0cae`.
Its published site is `https://rentflowing.lovable.app/`. The project is
accessible in Chrome, but the published revision has unpublished changes and
does not expose `/release.json`; the header check still fails. This corrects
the earlier assumption that no matching Lovable project was accessible.

The Lovable SQL editor reports 29 recorded migrations (latest
`20260622145643`), with none dated October or later. All eight lease
`indexation_*` columns and three indexation constraints are present despite
the missing migration-history entry. The custom lease document type table,
contractual document type column, and cost amortization recognition column
are absent. Schema presence must therefore be reconciled independently of
the version table; do not treat an unrecorded migration as unapplied SQL.
The new read-only target-schema gate checks required capabilities directly.
The complete 106-migration PGlite chain satisfies that gate locally; this is
fresh-schema evidence, not a restored-target-data rehearsal.
The gate also requires row-level security on 13 portfolio data tables. On the
Lovable target, all 12 tables that exist have RLS enabled; the thirteenth,
`lease_document_types`, is absent. RLS activation does not by itself prove
that every policy enforces portfolio isolation; policy and cross-portfolio
checks remain necessary before accepting customer data.
It also discovers every public table with a `portfolio_id` column and fails
if any lacks RLS. The Lovable target currently has 25 such tables, all with
RLS enabled. A local negative test confirms that introducing an unprotected
portfolio table fails the gate.
The gate now also checks that every authenticated/public read policy on 11
core portfolio data tables calls the portfolio-membership helper. A read-only
query on Lovable found 10 such policies on 10 existing tables; all 10 call
`is_portfolio_member`. The missing document-type table prevents target
attestation. A PGlite test with two authenticated users in separate
portfolios confirms each can read only their own properties and receipts,
cannot update the other's property, and cannot insert into the other's
portfolio. This is local migration-chain evidence, not a live two-account
penetration test or a full audit of every RPC and storage policy.
On this target, the document-type table, scheduled-job health table, and
atomic lease-creation RPC are absent. A duplicate-receivable trigger exists,
but its function still compares `unit_id`, allowing a second bill for the
same lease and due date through another unit. The gate checks this behavior,
not just the trigger name.

The target contains 425 receivables and 21 leases. A read-only audit found
zero receivable arithmetic errors and zero positive receipt status mismatches,
but 48 colliding lease-schedule billing slots. Every collision has two
different `unit_id` attribution anchors; none is an exact duplicate when
`unit_id` is included. Thirty-four slots repeat the same bill, including
cycle metadata. Six more slots on `BAIL-BRU-001` pair older monthly rows
without cycle metadata (some paid or partially paid) with new open/overdue
rows that have a monthly cycle end. These require payment and cycle review;
the guarded cleanup refuses them. Six `BAIL-PAR-001` slots use different
currencies: six EUR rows totaling 4,500
are paid and linked to allocations, while six matching GBP rows totaling
4,500 are overdue; the property currency is GBP. Do not delete the GBP bills
or rewrite the EUR payment history until the receipt currency is confirmed.
The two rent/charges slots of `BAIL-AMS-001` due `2026-01-01` pair already
paid monthly bills without cycle metadata with unpaid six-month advance
bills ending `2026-06-30`. Those two require advance-cycle reconciliation,
not automatic deletion. The strict financial audit reports 34 same-bill and
14 different-bill collisions. In 46 slots both rows match the lease's current monthly rent or
charges. Thirteen slots have an allocated/paid counterpart. Although one
open, unallocated row is potentially removable in each slot, no rows were
deleted during this audit. The automated financial gate now reports the
same-bill and different-bill collision counts separately.
The 2026-06-17 GBP 120 receipt with reference `test2` was rechecked after the
user requested that it remain unallocated: it already has status `unmatched`,
`unmatched_amount = 120.00`, and zero allocation rows. No write was needed.
The locally prepared guarded cleanup RPC now accepts different unit
attribution only when all other bill details match and still refuses paid,
allocated, stale, or last-copy deletion. It is not deployed to Lovable.

Lovable's Jobs page reports no scheduled jobs. Its Edge Functions page lists
only `create-portfolio-user`; neither receivable nor amendment scheduler is
deployed. A read-only SQL query also confirms `cron.job` is unavailable
because the `cron` schema/relation does not exist. Automated lifecycle and
receivable processing are therefore not operational on this target.
Lovable lists daily backups through `2026-11-07`, but this UI offers only
restoring the live project, not an isolated copy for a reversible migration
rehearsal. No backup was restored.
The public Supabase Auth settings endpoint returned HTTP 200 with
`mailer_autoconfirm=false`, `external.email=true`, and `disable_signup=true`.
Email confirmation is required, but new account registration is disabled;
the app's Signup and new-member invitation flows cannot complete as shown.
Do not broaden signup access without an explicit product/security decision.
Four target `SECURITY DEFINER` functions still use `search_path=public`:
`add_portfolio_creator_as_owner`, `handle_new_user`, `has_portfolio_role`, and
`is_portfolio_member`. The local hardening migration explicitly appends
`pg_temp` after `public`; the target has not received it. Neither `anon` nor
`authenticated` has `CREATE` on `public`, and neither can execute a public
definer trigger directly. The schema gate now checks all three conditions,
with a local negative test for an unsafe definer path. The current function
bodies use qualified table names, but the old path remains a release blocker.
The local preview at `127.0.0.1:8082` loaded the dashboard, lease list,
payments, maintenance, reports, and settings in a read-only browser smoke
without observed console errors. Settings correctly disables custom document
types and explains the missing migration. This does not verify authenticated
writes or production behavior.
The `lease-documents` Storage bucket is private on Lovable, but has no
server-side file-size limit or MIME allowlist. The `storage.objects` table has
RLS enabled. Its existing read/upload/delete policies use
portfolio membership; this still lets viewers upload or delete files, and the
delete policy does not yet call the referenced-file guard. There are no other
`storage.objects` policies on the target. The local
`20261107150000_secure_lease_documents_bucket.sql` migration
creates or corrects the private bucket with a 20 MiB limit and the UI's five
allowed MIME types. The schema gate now checks that bucket configuration,
Storage object RLS, its portfolio-scoped read policy, writer-only upload
policy, and attachment of the referenced-file guard to the delete policy.
It also rejects extra client-accessible Storage read, upload, or delete
policies and any client-accessible Storage update policy: a second permissive
policy could otherwise bypass the expected guard. This intentionally assumes
`lease-documents` is the only client-managed bucket; adding another bucket
requires revisiting the gate and proving its policies cannot match lease
document objects. A PGlite negative test covers public read, anonymous
upload, extra delete, and update-policy bypasses.
The target fails the new bucket,
upload-policy, and delete-policy checks; the relevant migrations have not been
applied there. The upload dialog now supplies a canonical MIME type for an
allowed extension when the browser leaves the type blank, avoiding a mismatch
with the new server-side MIME allowlist. An upload component test verifies the
inferred MIME is sent to Storage and saved on the document row. A local
migration-chain test verifies that an existing public/unlimited bucket becomes
private and limited without
replacement, and a negative test rejects a broad upload policy.
The four target lease documents have zero shared `storage_path` values, but
there is no target index on that column. The local
`20261107160000_unique_lease_document_storage_paths.sql` migration refuses
legacy collisions, enforces one document per Storage path, locks concurrent
creation/deletion of the same path, and prevents changing a document's file
path or ownership after creation. The read-only preflight is
`scripts/audit-document-path-collisions.sql`; the schema gate requires the
unique index. Local tests cover collision refusal, uniqueness, immutable
identity, and the existing deletion queue. They do not reproduce a concurrent
target Storage request; that still needs restored-data verification.
An additional read-only target query compared the four document rows with
the four `lease-documents` Storage objects: zero document files are missing
and zero stored files lack a document. The target does not yet have the
deletion-outbox table, so the complete four-part
`check:target-documents` release gate cannot run there until that migration is
applied. The gate then also checks shared paths and files queued for deletion
while still referenced. It excludes unreferenced files created within the
last hour to avoid treating an in-progress upload as an orphan; repeat the
audit after a quiet hour before accepting real documents.

## Automated checks

The CI workflow runs `npm ci`, a high-severity audit of all dependencies,
unique migration-version validation, lint, TypeScript, Edge Function syntax
type-checking, unit tests, and the production
build. Run `git diff --check`
on the proposed change before merging. A local
pass does not verify the deployed application or database.
After publishing, run the manual **Verify deployed release** GitHub Actions
workflow on the exact release commit with the published site URL and Supabase
public key. Set the `PRODUCTION_SUPABASE_ORIGIN` repository variable to the
approved HTTPS Supabase origin before running the workflow; the operator cannot
replace this target with a dispatch input. It checks the published revision, security
headers, email-confirmation setting, migration history, required live schema
capabilities, scheduled-function readiness, and the target financial-data audit. It does not
apply migrations or repair data. It also compares document records with
Storage objects and the deletion queue, failing on missing files, old
unreferenced files, queued-but-referenced files, or shared paths. A green CI build alone is not a release
approval.
The CI build uses dummy public Supabase settings; the deployment must set its
own valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, which the
production build now checks before bundling.
The release marker also records SHA-256 digests of the built `index.html`,
every Vite-manifest runtime asset (including lazy-loaded pages), the replay
guard script, and the Supabase origin embedded at build time. The deployment
check downloads and compares those files and matches the origin to the backend
being probed. A current marker alongside stale, missing, or altered runtime
files, or a check against the wrong backend, cannot pass. It does not replace
an authenticated browser smoke test of behavior and backend workflows.
Before backend acceptance, run
`npm run check:backend-functions -- <supabase-https-origin>` to confirm both
scheduled Edge Functions are active and recorded a successful run within the
last three hours, with an active Cron job for each function. Set
`SUPABASE_MANAGEMENT_READ_TOKEN` to a project-scoped
Management API token with `edge_functions_read` and `database_read`; configure
the same name as a secret for the manual deployment workflow. This token can
read project data beyond the health table, so scope it to this project, keep
it out of the frontend, and give it a short expiry. The check reads function
metadata, requires the scheduler's `verify_jwt = false` configuration and
exactly one active hourly Cron entry containing this project's literal
function URL, and uses Supabase's read-only SQL endpoint. It never invokes
a deployed handler. A missing token, health table, function, recent success,
or correctly targeted Cron job fails closed. The command match is textual;
inspect Cron run history and HTTP responses separately to prove actual dispatch.
After a recoverable database rehearsal and backend rollout, run the manual
`Verify production backend before publish` workflow from `main` before making
the matching frontend public. It uses only read-only probes for Auth settings,
exact migration SQL content, schema capabilities, scheduled functions, financial
data and document files. It fails if the scoped Management API token, approved
backend origin or planned publishable key is missing. Record the workflow run
and commit SHA; rerun it if backend state changes before publication. This
preflight does not replace the post-publication deployment workflow or an
authenticated browser smoke test.

## Blocking checks

- [ ] Review and merge a defined release revision; keep the deployed revision
      traceable to that commit. The working tree is not a release artifact.
      After publish, rebuild that exact clean commit with the deployed backend,
      publishable key, and `PUBLIC_APP_ORIGIN`; then run
      `npm run check:deployment -- <published-url> <sha> <supabase-https-origin>`
      with `VITE_SUPABASE_PUBLISHABLE_KEY` set to the deployed key. The verifier
      reads and hashes local `dist/` before comparing it with every published
      file. Both builds must match the commit, backend and key fingerprint and
      report `dirty: false`.
- [ ] Run the read-only `Verify production backend before publish` workflow on
      the exact `main` commit after restored-data rehearsal and backend rollout,
      but before publishing the frontend. Record its run and resolve every
      failed gate. Then run `Verify deployed release` after publication against
      the same commit and backend.
- [ ] Reconcile every `supabase/migrations` file against the target Lovable Cloud
      database. Confirm table constraints, functions, triggers, and storage
      policies are present, including contractual documents, amortization,
      indexation, custom-document-type guards, duplicate-receivable
      prevention, and configurable partial cost recovery. Include the admin operational-data role alignment migration;
      older policies omit admins despite the Settings role description. Apply
      the token-scoped invitation acceptance RPC before
      deploying the matching frontend.
      Do not run `supabase db push` directly against the current target: its
      first 29 recorded versions differ from the 29 SQL-identical local files.
      After a restored-backup rehearsal, use
      `scripts/reconcile-lovable-migration-history.sql` to repair the version
      identifiers transactionally, then re-list migration history before
      applying the remaining local files in order. The local reconciliation
      rehearsal checks that all 29 stored MD5 values still match their local
      SQL files byte for byte. It also proves that altered target statements
      abort without changing version rows. After reconciliation, the read-only
      target migration gate rejects changed or missing SQL content for every
      local file, including those 29 rows and all subsequently applied files.
      Apply later migrations through a process that records their full SQL
      content in `supabase_migrations.schema_migrations.statements`; a version
      marker without matching content is not release evidence. Separate schema
      and data checks are still needed.
      This does not verify the live
      schema or replace a restored-target rehearsal.
      A separate synthetic chain applies the already-present indexation
      columns and constraints after those 29 migrations, inserts a lease with
      indexation terms, then replays every remaining local migration. It passes
      and preserves the terms. This covers that known unrecorded schema drift,
      not other target-data or schema differences.
- [ ] Apply `20261018235600_guard_referenced_lease_document_files.sql` before
      accepting document uploads. It prevents a portfolio writer from deleting
      a Storage object while a lease document still references its path, but
      permits cleanup after the document row is removed. Verify both cases
      against the target Storage API as well as a viewer's denial.
- [ ] Apply `20261107150000_secure_lease_documents_bucket.sql` after a
      reversible rehearsal, then verify the `lease-documents` bucket remains
      private and enforces a 20 MiB limit and the five allowed file types at
      the Storage API, not just in the browser.
- [ ] Run `scripts/audit-document-path-collisions.sql` on restored data, then
      apply `20261107160000_unique_lease_document_storage_paths.sql` after the
      deletion-outbox migration. The current live read-only audit found zero
      collisions among four documents, but the required unique index is absent.
      Verify that a duplicate path and any change to an existing document's
      path or identity are rejected. Race an insert against a deletion of the
      same path on staging: the new row must not reference a file already
      queued for cleanup, and the queue must not lose a deletion.
- [ ] Apply `20261017200000_atomic_cost_entry_allocations.sql` before deploying
      the matching frontend. Cost creation and editing deliberately fail with a
      migration-required error until its transaction RPC is available; verify
      editor success, viewer denial, stale-version rejection, and rollback on a
      rejected allocation in the target backend.
- [ ] Apply `20261017210000_atomic_receipt_allocations.sql` before deploying
      the matching frontend. Auto-allocation, manual allocation, and quick-pay
      now require its transaction RPC. Verify editor success, viewer denial,
      cross-currency rejection, stale receipt/receivable rejection, and full
      rollback when a child allocation fails. Recheck existing matched receipts
      with no allocation rows separately; the migration does not rewrite them.
- [ ] Apply `20261018234000_guard_receipt_amounts.sql` after the atomic receipt
      RPC migration. Standalone unmatched receipts now use that same RPC.
      The new `NOT VALID` checks reject new nonterminal nonpositive receipts,
      positive receipts with out-of-range unmatched balances, and nonpositive
      allocations without silently changing old bank imports. Investigate the
      corresponding rows in `scripts/audit-financial-consistency.sql` on a
      restored copy, resolve each old exception, then `VALIDATE CONSTRAINT`
      for all three named checks before accepting real payments.
- [ ] Apply `20261018235000_guard_receipt_allocation_balance.sql` on a restored
      target after the amount guards. Its deferred trigger verifies that each
      positive receipt's allocated rows match the saved unmatched balance at
      transaction commit. It also prevents new allocations on terminal or
      exceptional receipts. Its portfolio-scoped client RPC replaces direct
      authenticated receipt/allocation writes; the frontend now requires this
      RPC and must not be published before the migration. Verify editor and
      viewer behavior, atomic payment and unmatched receipt creation, old-RPC
      and direct-write denial, portfolio deletion, and concurrent allocation
      attempts against restored target data. Run the
      financial audit first: existing drift is not silently rewritten, and
      an old inconsistent receipt may fail when next touched.
- [ ] Apply `20261018235500_guard_receivable_arithmetic.sql` after the payment
      guards. It rejects new receivables whose expected amount differs from
      allocated plus outstanding by more than one cent. The constraint starts
      `NOT VALID` to preserve old rows for explicit reconciliation. Resolve
      the `receivable_arithmetic` audit findings and validate the named
      constraint on restored staging, then on the target before go-live.
- [ ] Apply `20261017220000_atomic_lease_creation.sql` before deploying
      the matching frontend. New leases now require its transaction RPC for
      the parent row, unit assignments, generated receivables, and affected
      tenant statuses. Verify two concurrent attempts to reserve the same unit,
      boundary-touching assignment dates, a rejected child row, stale tenant
      status, writer success, and viewer denial on the target backend.
- [ ] Apply `20261017230000_atomic_allocation_rule_shares.sql` before deploying
      the matching frontend. Rule creation/editing and manual-share replacement
      now require the transaction RPC. Verify new manual rules, edits from and
      to manual mode, invalid percentage rollback, stale versions, property
      mismatches, and viewer denial on the target backend.
- [ ] Apply `20261018020000_atomic_amendment_activation.sql` before deploying
      the matching frontend. Activation now requires one transaction for the
      lease, assignment windows, amendment statuses, receivable replacement,
      and changed tenant statuses. Verify a successful activation, stale lease
      and assignment rejection, protected paid/allocated receivables, rejected
      child-row rollback, and viewer denial on the target backend.
- [ ] Apply `20261018030000_atomic_lease_tenant_update.sql` before deploying
      the matching frontend. Lease editing now writes the lease and changed
      tenant statuses together. Verify an ordinary edit, a lifecycle change,
      stale lease/tenant rejection, and viewer denial on the target backend.
- [ ] Audit existing charge-reconciliation periods, resolve any overlaps,
      then apply `20261018232000_guard_charges_reconciliation_periods.sql`.
      The windows are inclusive: consecutive periods must begin the day after
      the prior end. Verify the preflight on restored data, overlapping direct
      inserts/updates and concurrent attempts, and a valid next-day period.
- [ ] Apply `20261018070000_prune_future_closed_lease_receivables.sql` before
      deploying the matching frontend. Close an active lease with an open
      future schedule row and a paid future row; confirm only the open row due
      after the new end is removed and the UI reloads the persisted result.
      The End/Terminate dialogs now warn about billed cycles crossing the
      closure date and protected future rent/charges rows. Review credit or
      proration against the contract; the warning does not alter those rows.
      Verify this behavior in an authenticated browser on restored staging.
- [ ] Apply `20261018080000_atomic_lease_closure.sql` before deploying the
      matching frontend. End and terminate representative leases on the target;
      verify assignment windows, active amendments, vacant units, tenant status,
      future unpaid receivables, status history, stale-version rejection, and
      viewer denial.
- [ ] Apply `20261019030000_close_lease_in_property_time_zone.sql` after the
      property time-zone migration. Verify that closing a lease at local midnight
      uses the property's day for the end-date and other-occupancy checks, not
      the API server's day; confirm the caller's session time zone is restored.
      The lease detail page now uses that same property date for its status,
      receivable and closure displays. The same migration makes signed
      initial-contract rollback decisions use the property's day, and the
      document dialog receives that day explicitly. Local SQL tests cover
      both directions of a one-day difference, but the target backend and
      authenticated browser still need verification.
- [ ] Apply `20261018090000_atomic_lease_deletion.sql` before deploying the
      matching frontend. Verify an unencumbered lease deletes with tenant
      lifecycle reconciliation; financial records, uploaded documents, notice,
      and completed occupancy block deletion. Verify stale-version, viewer,
      and direct-table DELETE denial on the target backend.
- [ ] Apply `20261018100000_atomic_lease_status_history.sql` before deploying
      the matching frontend. Verify creation records its first status, each
      later lifecycle edit writes one matching history row, a non-status edit
      writes none, and a failed history insert rolls back the entire edit.
- [ ] Apply `20261018110000_guard_direct_lease_status_updates.sql` before
      deploying the matching frontend. Verify a direct authorized status update
      records history or rolls back, and RPC/scheduled transitions keep exactly
      one history row rather than two.
- [ ] Apply `20261018130000_atomic_property_owner_links.sql` before deploying
      the matching frontend. Verify an owner-link replacement is all-or-nothing,
      stale forms and cross-portfolio owners are rejected, viewers and direct
      table writes are denied, and the returned owner set matches exactly.
- [ ] Apply `20261018140000_atomic_property_with_owners.sql` after the owner-link
      migration. Property add/edit now saves fields and selected owners in one
      transaction and reports success only after both are acknowledged. Verify
      create, edit, concurrent stale edit, rejected owner rollback, viewer
      denial, and property millieme-base changes on the restored target.
- [ ] Apply `20261018150000_guard_unit_millieme_capacity.sql` after the atomic
      property migration. Audit existing share totals first, then verify that
      concurrent unit writes cannot exceed any configured key's property base,
      that a valid boundary value saves, and cross-portfolio units are refused.
- [ ] Apply `20261018160000_atomic_lease_assignment_edit.sql` before deploying
      the matching frontend. Lease edit and notice registration/cancellation
      now save the lease, affected tenant statuses, complete assignment
      history, and recalculated unpaid schedule in one transaction. Verify
      date overlap messages, a boundary-touching window, stale lease,
      assignment and receivable versions, rejected child-row rollback,
      viewer denial, past-dated notice cancellation, immutable property, and
      preservation of paid or allocated future rows on the target backend.
- [ ] Run the lease-assignment property mismatch audit, repair any historical
      rows, then apply `20261018170000_guard_lease_property_links.sql` on
      restored staging. It intentionally aborts when an existing assignment
      crosses properties or portfolios. Verify direct lease-property updates,
      assigned-unit transfers, and cross-property assignment inserts/updates
      are rejected under authenticated roles, including simultaneous writes.
- [ ] Apply `20261018180000_guard_amendment_deletion.sql` before deploying the
      matching frontend. Verify draft deletion with a current version, stale
      draft rejection, direct-table DELETE and downgrade denial, protection of applied
      amendment changes, lease-delete rollback when applied history exists,
      and whole-portfolio deletion on restored staging.
- [ ] Apply `20261018190000_amendment_rpc_only_writes.sql` after the amendment
      deletion guard. It removes direct authenticated amendment and change-row
      writes, routes editor saves/activation/draft scheduling through scoped
      transactions, and keeps lease closure working. Verify direct table and
      old-RPC denial, editor success, viewer denial, version conflicts,
      scheduler service-role activation, and rollback on the target backend.
- [ ] Apply `20261018200000_atomic_contract_documents.sql` before using the
      matching document dialog. Signed initial-contract creation, status
      downgrade, and deletion now change the document and lease in one scoped
      transaction; direct contractual row writes are refused. Verify file
      upload, one-initial-contract uniqueness, signed-date propagation,
      future-lease keep/revert decisions, active-lease no-rollback, stale-tab
      rejection, viewer denial, and failed history rollback on restored
      staging. Upload errors now read the new document ID back before any
      file cleanup, so an uncertain network response cannot remove a file
      already referenced by a committed row. Storage deletion still follows
      the committed database delete;
      monitor and clean up orphaned files if that separate step fails.
- [ ] Apply `20261018210000_queue_lease_document_file_deletions.sql` after
      the contractual-document migration, then deploy and schedule the
      secret-protected `cleanup-lease-document-files` Edge Function. The
      database queues file cleanup with every document deletion. Verify
      interrupted browser deletes recover, authenticated users cannot alter
      the queue, path-scope violations are quarantined, and a full queue
      drains under monitoring. A Storage success response that leaves a file
      present must retain its queue item for retry. Follow `SCHEDULER.md`; the local code and
      migration do not prove the worker is running in Lovable Cloud.
- [ ] After the deletion outbox is deployed and document uploads have been
      quiet for at least an hour, run
      `npm run check:target-documents -- <supabase-https-origin>` with a
      project-scoped read-only Management API token. Investigate missing,
      unreferenced, still-referenced queued, or shared files before accepting
      customer documents. The 2026-11-07 manual target comparison found no
      missing or unreferenced files among four document rows and four objects;
      it did not verify the absent deletion outbox or a restored target.
- [ ] Apply `20261018220000_harden_legacy_definer_helpers.sql` after the
      document queue migration. Verify anonymous and authenticated roles
      cannot directly execute elevated trigger helpers, ordinary document and
      unit writes still fire their guards, and all elevated functions retain
      explicit trusted search paths on the target backend.
- [ ] Apply `20261018233000_normalize_amendment_unit_refs.sql` after the
      applied-amendment history guard. Its preflight requires every nested
      amendment unit ID to resolve uniquely within the lease property. On
      restored staging, verify legacy-ID normalization of active changes,
      preservation of the applied-history edit guard, and rejection of new
      legacy or cross-property references. The metadata repair does not itself
      reconstruct missing or misdated lease assignments.
- [ ] Run `scripts/audit-amendment-assignment-consistency.sql` before and
      after the amendment-reference migration on restored staging and the
      target. Resolve every applied add/remove row that disagrees with the
      recorded assignment window, then review affected occupancy and
      receivables; do not infer which historical record is authoritative.
- [ ] Apply the open-ended lease migration before exercising blank end dates.
      Verify the lease saves, reloads without an end date, and continues to
      create complete monthly or advance receivable cycles as time advances.
- [ ] Verify an administrator can access the backend, export its data, and
      restore a backup in an isolated environment. Include uploaded files in
      the recovery exercise; database backups alone may not include storage.
- [ ] Test read/write denial across two portfolios and a non-member account for
      properties, leases, receivables, receipts, documents, and storage files.
      Apply and integration-test the same-portfolio reference trigger before
      this test; RLS on a child row does not validate its referenced parent.
- [ ] Apply `20261018235700_require_verified_email_for_invitations.sql` and
      verify that an unconfirmed account cannot accept a portfolio invitation
      even when it has the correct token and email. Confirm the email and
      retry the same invitation successfully. Verify Auth email confirmation
      and redirect settings on the actual backend. Deploy the matching
      `create-portfolio-user` Edge Function before accepting real users:
      the older deployed function can still create auto-confirmed accounts,
      while the local version adds only existing, verified accounts. The
      2026-11-07 Lovable Users > Settings > Auth > Email screen shows
      `Auto-confirm email` disabled, and the public Auth settings endpoint
      reports `mailer_autoconfirm: false`. Lovable's minimum password length
      was raised from 6 to 8. Verify confirmation-mail delivery and redirects,
      then retest signup and invitation acceptance before release; the
      invitation guard alone does not prove control of a mailbox.
- [ ] Apply `20261107130000_defer_new_user_portfolio_until_verified.sql` and
      `20261107140000_set_first_portfolio_as_default.sql` together on a
      recoverable target copy before enabling live signup. Verify a new
      unconfirmed account has a profile but no portfolio; a confirmed
      ordinary signup gains one owner portfolio; a confirmed signup with a
      valid pending invitation gains no starter portfolio and receives the
      invited portfolio as its default on acceptance. An expired or
      unauthorized invitation must not suppress ordinary portfolio creation.
      Verify a second membership does not overwrite an established default.
      The local migration-chain test covers these cases, not email delivery or
      the actual Lovable backend. Public sign-up is temporarily disabled on
      the Lovable target; re-enable it only after these migrations, the
      matching frontend, and real confirmation/invitation tests pass. Then
      rerun `npm run check:auth-settings` against the deployed backend.
- [ ] Publish the Profile password form with a required current-password field,
      then enable Lovable Auth's `Require current password for password changes`
      setting. Verify a signed-in change succeeds with the correct current
      password and fails with an incorrect one. Verify separately that an
      emailed recovery link still permits a reset without the current
      password. The setting remains **off** on the current Lovable target:
      enabling it before the new frontend is published would break the old
      Profile form. The local recovery screen now requires Supabase's
      `PASSWORD_RECOVERY` event and preserves that intent for a same-tab
      refresh; a direct visit must offer a new link instead of a password
      form. This client-side guard is not a substitute for the Auth setting.
      No credential was changed during this check.
- [ ] Apply `20261018235800_list_manageable_portfolio_members.sql` before
      deploying the matching Settings screen. Verify owner/admin member emails
      within one portfolio, viewer and cross-portfolio denial, and that a
      late response from another portfolio never appears after switching.
      The older Settings screen labels every other user "Portfolio member",
      making role changes hard to target safely.
- [ ] Verify viewer mode against the target backend. Operational pages now
      gate write actions by portfolio role, but owner, admin, editor, and viewer
      workflows still need authenticated browser and RLS checks.
- [ ] Test the last-owner guard with concurrent owner removals and a deliberate
      portfolio delete. Apply `20261017160000_harden_last_portfolio_owner.sql`
      only after backup and testing against a restored database.
- [ ] Run `scripts/audit-financial-consistency.sql` against the target database
      after migrations, using `npm run check:target-data -- <supabase-origin>`
      with a scoped `SUPABASE_MANAGEMENT_READ_TOKEN`, and resolve every
      unexplained nonzero result. The deployment workflow also runs this
      read-only gate. If
      `duplicate_lease_schedule_rows` is nonzero, run the read-only
      `scripts/audit-duplicate-lease-billing-slots.sql` and review every
      row's status, currency, balance, and receipt links before repair. The
      billing slot is lease-wide; different `unit_id` values do not make two
      full-lease receivables distinct. The 2026-11-07 guard migration blocks
      new duplicates but does not delete existing rows.
      If `tenant_status_lease_mismatch` is nonzero, inspect
      `scripts/audit-tenant-status-mismatches.sql` before changing any tenant;
      its rows identify the stored/expected status and the linked leases.
- [ ] Rehearse `20261107230000_guard_cash_receipt_scope.sql` on a recoverable
      target copy before deployment. Review `cash_receipt_scope_mismatch`
      results first, then verify ordinary, historical-amendment, and standalone
      receipts still save while cross-lease tenant/property/unit links fail.
- [ ] Rehearse `20261107240000_guard_receipt_allocation_property.sql` on a
      recoverable target copy. Review `receipt_allocation_property_mismatch`
      rows first. Verify property-scoped tenant receipts cannot settle another
      property's debt, while property-less receipts can settle both when all
      other scope, currency, and balance rules are met.
- [ ] Rehearse `20261107250000_reject_subcent_receipt_payloads.sql` before
      publishing the matching payment forms. Verify comma-decimal client input,
      direct API rejection of sub-cent receipt/allocation/balance values, and
      exact 0.10 + 0.20 allocation on a recoverable target copy.
- [ ] Apply `20261107010000_safe_duplicate_receivable_cleanup.sql` before
      enabling the Payments duplicate-removal action. On a recoverable target
      copy, verify owner/admin-only execution, stale-version rejection,
      payment-linked and paid-row protection, cross-unit/currency review,
      last-copy preservation, and all-or-nothing batch rollback. The UI now
      requires this RPC; a missing migration must produce an error without
      deleting any row. This does not repair the existing ambiguous slots.
- [ ] Apply `20261107020000_guard_paid_receivable_deletion.sql` before
      accepting real payments. Verify a direct deletion of a paid, partially
      paid, or receipt-linked receivable is rejected, while an unallocated
      future bill can still be removed by lease/amendment workflows and a
      deliberate portfolio delete still cascades. The guard preserves those
      existing invoker-rights workflows but does not prohibit every direct
      deletion of an unpaid row; restrict privileged API access and monitor
      unexpected receivable deletions separately.
- [ ] Apply `20261107030000_restrict_direct_receivable_updates.sql` before
      accepting real payments. Verify an authenticated direct update of a
      receivable is denied, while the scoped payment-allocation RPC still
      updates balances atomically. Direct authenticated inserts remain a
      separate write-surface review; do not treat this permission change as
      complete receivable write isolation.
- [ ] Apply `20261107040000_restrict_direct_receivable_deletes.sql` after the
      paid-row deletion guard and atomic lease/reconciliation migrations, and
      before deploying the matching frontend. Verify authenticated direct
      DELETE denial on receivables and charges reconciliations, editor success
      through the scoped lease-edit and reconciliation-delete RPCs, viewer and
      cross-portfolio denial, and that closing a lease still prunes only
      unpaid future schedule rows. The local tests cover these paths on a
      fresh schema; repeat them on restored target data. Direct authenticated
      INSERT of receivables remains open for a separate transaction-safe
      migration.
- [ ] Deploy and schedule `advance-receivables` with its service-role secret,
      then apply `20261107050000_restrict_direct_receivable_inserts.sql` with
      the matching frontend. The browser no longer generates due receivables
      on page load; without the job, open-ended leases will miss later cycles.
      Verify direct INSERT denial, viewer/cross-portfolio denial, authorized
      lease and reconciliation creation, and exactly-once job generation.
      Rehearse on restored target data before production rollout.
- [ ] Apply `20261107060000_scheduled_job_health.sql` before deploying the
      scheduled Edge Functions. Confirm `authenticated` cannot read or edit
      the health table, each hourly worker records a successful run, and the
      read-only backend check fails when either worker has not succeeded in
      the last three hours. Also inspect Cron configuration and run history:
      a recent manually triggered run alone does not prove future dispatch.
- [ ] Apply `20261107070000_restrict_direct_reconciliation_writes.sql` with
      the guarded reconciliation-creation RPC. Verify an authenticated writer
      cannot insert or alter reconciliation rows directly, but can create one
      together with its adjustment receivable and delete an eligible one
      through the scoped transaction. Repeat on restored target data.
- [ ] Apply `20261107080000_restrict_direct_cost_allocation_writes.sql` with
      the matching frontend. Verify direct cost-entry insert/update and direct
      allocation-result writes are denied; owner/editor creation and editing
      replace the parent and all unit allocations together; viewer and
      cross-portfolio calls fail; deleting a cost still cascades its results.
- [ ] Apply `20261107090000_restrict_direct_allocation_rule_writes.sql` with
      the matching frontend. Verify direct rule insert/update and manual-share
      writes are denied, while an authorized editor can create and edit a
      manual rule atomically. Confirm viewer denial and that deleting an unused
      rule still cascades its shares.
- [ ] Run `npm run check:production-headers -- <published-url> <backend-origin>` after deploy.
      Verify authenticated pages do not inject session replay; follow
      `SECURITY.md`. The default Lovable URL failed the header check on
      2026-11-04 (CSP, X-Frame-Options, Permissions-Policy). The checker now
      also rejects duplicate CSP directives, permissive `script-src-elem` or
      `script-src-attr` overrides, duplicate permission directives, and missing
      one-year HSTS. The revision gate also requires `release.json` to be
      served with `Cache-Control: no-store`.
- [ ] Choose a custom-domain frontend deployment path in `SECURITY.md`, obtain
      domain/DNS/provider access, and verify the final URL. The repo's `_headers`
      file is automatically applied only by a compatible static host, not by
      Lovable's default host. Cloudflare proxy rules require proxied DNS.
- [ ] If deploying to a custom domain, build with `PUBLIC_APP_ORIGIN` set to
      that exact HTTPS origin, then verify the emitted CSP permits the site's
      own assets and the deployed host actually serves `dist/_headers`.
- [ ] Complete and record every remaining real-user scenario in
      `QA_SCENARIOS.md`, including amendment scheduling, documents, payment
      corrections, guarantee return, move-out, indexation boundaries,
      multi-currency reports, and deletion constraints.
- [ ] Deploy and verify due-amendment activation in the monitored backend
      scheduler. The local `advance-receivables` Edge Function now runs the
      shared amendment planner before lease lifecycle and receivable generation,
      but this is not yet deployed or tested with the app closed. Apply
      `20261018120000_allow_scheduled_amendment_activation.sql` and follow
      `SCHEDULER.md`; confirm dispatch timestamps outside the 15-minute
      server-clock window are rejected before any write, then confirm ordering,
      retries, partial failure reporting,
      paid-row preservation, and property-local business dates on the target.
- [ ] Generate new rent and charges receivables from a monitored backend job
      or equivalent server process. The `advance-receivables` Edge Function
      and service-only `insert_due_lease_receivables` RPC are prepared locally,
      but neither is deployed or scheduled. Follow `SCHEDULER.md` after
      applying the lifecycle, portfolio lead-time, and insertion migrations.
      Verify the portfolio-wide setting with two operators, retries, paid-row
      preservation, monitoring, and business-date behavior on the target.
- [ ] Persist date-driven lease lifecycle transitions with a backend scheduler
      or equivalent server process. The client currently derives `active` and
      `ended` at load time, but the stored row can remain stale while no one
      has the portfolio open. Apply
      `20261018040000_advance_due_lease_lifecycle.sql`, then configure a
      monitored backend job to call the zone-scoped service-only function for
      each property zone. Verify catch-up, idempotence, history, tenant and
      amendment effects, and failure recovery on the target. Reconcile
      existing stale rows after backup.
- [ ] Apply and verify the property time-zone migration and the zone-scoped
      lifecycle routine before deploying the matching frontend and scheduler.
      The scheduled amendment, lifecycle, and receivable jobs now derive
      dates from each property's persisted IANA zone. Test both sides of a
      cross-border midnight and a daylight-saving transition on restored
      staging. Audit remaining read-only UI date defaults and report cutoffs
      for managers working outside the property's zone.
- [ ] Test failed and interrupted writes for every consequential mutation.
      No dialog may report success before persistence is acknowledged.
- [ ] Make remaining multi-record lease/amendment lifecycle and reconciliation
      writes atomic at the backend, or prove compensating
      rollback and recovery against the target backend. Context writes are
      awaited, but several workflows still span multiple requests.
- [ ] Re-run the production dependency audit on the exact release lockfile in
      CI and record any accepted residual risk. The local audit on 2026-11-04
      returned zero known vulnerabilities; the release commit is not defined.
- [ ] Review jurisdiction-specific indexation and financial calculations with
      a qualified domain reviewer. Product behavior is not a legal assertion.
- [ ] Review privacy notices, retention, processor access, and support
      procedures before entering real personal data.

## Release decision

Record the tested commit, deployment ID, database migration state, QA evidence,
backup restore result, and security-header output. Release only when the
blocking checks pass; otherwise use a synthetic-data preview or private beta.

### Current assessment: no-go (2026-11-05)

On 2026-11-05, the current uncommitted worktree passed `npm run build`,
`npm run test -- --run` (419 tests in 83 files), `npm run lint`,
`npx tsc --noEmit -p tsconfig.app.json`, `npm run check:migrations`
(83 unique versions), and `git diff --check`. The production dependency
audit reached the npm advisory service on 2026-11-05 and reported zero known
vulnerabilities. The last local commit is `b30c409` from 2026-06-23;
the verified worktree is not a reviewed or deployed release revision.
Lovable's project history labels the GitHub-pushed builds unsuccessful and
its selected preview was blank on this date. The Lovable UI did not expose
a build log in the inspected history details, so no cause is asserted from
that display. Resolve the target build/deployment path and repeat the gate
on the exact release commit; a local pass cannot validate the stale preview.
The public `https://rentflowing.lovable.app/login` did render its sign-in form
without a browser-console error, so the blank Lovable editor preview is not
proof that the public app is down. The public `/release.json` returned the
app's 404 screen, and the public page title was still `Rent Flow` while this
worktree builds `OneRent`. The published revision is therefore not identified
by the new release-stamp mechanism and cannot be claimed as this worktree.

The repository had two migrations with version `20260623120000`. The
lease-assignment cleanup now uses `20260623120500`, and CI rejects duplicate
migration versions. The target Cloud migration history was read as ending on
2026-06-22, before either version, but this rename still requires migration
history reconciliation before deployment.
Amendment-change, cost-allocation, and manual-rule-share replacements now use
the later transactional RPC migrations. Their isolated rollback tests pass,
but the RPCs are absent from the target backend; the corresponding published
workflows cannot be treated as verified until migration and authenticated
staging checks pass.

Local lint, TypeScript, tests, build, and whitespace checks pass. This does not
clear the release gate: the published Lovable host is missing required response
headers; target database migrations, policy behavior, and backup recovery are unverified;
several real-user QA scenarios remain open; and the prepared transaction RPCs
have not been exercised on restored target data. Do not enter real production
data yet.

On the 2026-11-05 locally verified working tree, 380 tests across 77 files pass; lint,
`npx tsc --noEmit -p tsconfig.app.json`, build, `npm run check:migrations`,
and `git diff --check` also pass. The plain `npx tsc --noEmit` command does
not check this referenced app project; use the explicit project command above.
The property and unit return period controls now follow each property's
business date. A local regression covers overdue rent in Paris versus London
at the same UTC instant, and the property's theoretical rent now excludes
months before a unit is available. These checks are not a substitute for an
authenticated browser comparison on restored staging.
Unit-status validation and amendment terms now also use the property's
business date. A stale active lease outside its start/end window no longer
blocks a unit-status change, and the legacy lease-unit pointer is used only
when that lease has no assignment rows. The charges-reconciliation default
end date and renewal/amendment validation follow the same property calendar.
Local tests cover a Paris/London midnight for unit status and retroactive
amendment warnings; authenticated browser and target-backend checks remain open.
The shared server amendment modules also pass a standalone TypeScript check,
and the Edge Function bundles with esbuild. Local `deno check` is unavailable:
the installed Deno binary is x86_64 on an arm64 host without Rosetta; CI must
run its configured Deno check before a release candidate can pass.
The automated chain test applies all 82 migrations in filename order to a
fresh embedded PostgreSQL schema with Supabase auth/storage stubs and checks
the resulting critical functions and columns. A second test seeds a June-era
schema with representative lease, document and partially recoverable cost rows,
then applies the remaining migrations and checks preservation and the 50% cost
backfill. Neither test exercises the populated Lovable Cloud database or
replaces a restorable backup. `npm audit --omit=dev --audit-level=high` with
registry access on 2026-10-18 found zero vulnerabilities for the current
lockfile; repeat it in CI on the exact release commit.
The published `https://rentflowing.lovable.app/` was checked again on
2026-10-18 with `npm run check:production-headers`. It still lacks CSP,
`X-Frame-Options`, and `Permissions-Policy`. The same-day
`npm run check:deployment -- https://rentflowing.lovable.app/ b30c4095c3d70e42bca38f0ab21230b790e04a41`
check failed because `/release.json` returned HTTP 404; the current
published revision cannot be tied to the local commit.
The 2026-10-18 recheck still reports missing CSP directives,
`X-Frame-Options`, and `Permissions-Policy` directives, and `/release.json`
still returns HTTP 404. The production dependency audit on the same date
found zero vulnerabilities. These checks do not clear the deployment gate.
The 2026-11-04 public-host recheck produced the same missing-header result
and `/release.json` HTTP 404. No published revision was verified.
Local `dist/_headers` does not prove that this hosting path serves them.
Direct tenant creation/editing, manual receipt creation, amendment status
changes, and successful lease closure now keep the database-returned
`updated_at` value in the local store for every affected record.
Status changes also require the previously loaded version, preventing a stale
tab from silently overwriting a newer amendment. This fixes the false stale
version rejection when scheduling an amendment and later activating it, or
when creating a tenant and immediately assigning a lease. Repository and
AppContext regression tests cover the returned version and conditional
update. Lease closure now uses a role-checked client wrapper around its
invoker-rights database transaction, but its
target-backend behavior and deployment order remain release gates.
Lovable Cloud's Backups page was rechecked on 2026-10-18 and shows daily
recovery points, most recently 2026-10-17 05:05 UTC. The live database listing
now shows 425 receivable rows, so the target has changed since the earlier
read-only audit. There is no verified post-change snapshot or restore
rehearsal, so the target migrations have not been applied.
The same-day read-only Cloud database listing shows zero
`charges_reconciliations` rows, and a direct overlap query returned zero.
The new overlap guard still requires a target-backend concurrency test after
a restorable backup; no database migration was run. Read-only preflight
queries also found zero property millieme keys above their configured base
and zero invalid unit millieme-share shapes or values. Re-run these checks immediately
before the capacity-guard migration because target data can change.
Advanced settings offers a downloadable database export, but storage files
must be downloaded separately. The export was not created: the browser safety
review rejected a full sensitive-data download without explicit user approval.
Approval has been requested; an export by itself would still not prove an
isolated database-and-storage restore.
The Codex in-app preview on port 8083 stopped at `/login`; no password was
requested or stored by this release process. The existing local preview on
port 8082 did load an authenticated Demo session for read-only smoke checks.
On 2026-10-18 the 8082 process answered `HTTP 200` for `/properties`, but
the Mac session was locked and browser automation could not attach to verify
the new property time-zone form. A live authenticated smoke test remains open.
Its rent-roll report exposed three legacy lease references (`HUB`, `REZ`,
`REZ2`) with no unit shown. A read-only Lovable Cloud query confirmed that
all three have no persisted unit assignment; `HUB` is stored as active and the
other two as signed. The release audit now includes
`non_draft_lease_without_unit` so this cannot be mistaken for a display-only
issue. Whether these are disposable test leases or need reconstruction awaits
the portfolio owner's decision.
The rent-roll initially counted 13 active leases, including `REZ2`, which
ended on 2026-04-30. After fixing signed-to-ended catch-up in the client,
the authenticated report counted 12 and removed `REZ2`'s 1,100 EUR rent and
150 EUR charges from its active totals. A read-only Cloud query found five
lease rows whose *stored* lifecycle stage remains behind the Brussels date:
four signed leases already started (`BAIL-AMS-002`, `BAIL-PAR-003`, `REZ`,
`REZ2`) and one active lease already ended (`RAT1`). The client correction
does not update those stored rows; automated server-side transitions and a
reviewed historical repair are still required before release.
Lovable Cloud's Jobs view reports no scheduled jobs for this project. A
read-only extension check found `pg_cron` and `pg_net` available but not
installed. Scheduler installation, privileges, execution history, and
backup/restore behavior remain unverified; no job was created on the target.
The new `advance_due_lease_lifecycle` migration provides a service-only,
transactional catch-up routine for signed-to-active/ended and active-to-ended
transitions. Isolated PostgreSQL tests cover tenant and amendment status,
history, idempotence, client-role denial, and rollback when history insertion
fails. The status-history dialog now translates known reason codes, including
this scheduler transition, while retaining custom free-text reasons. It is
not installed on Lovable Cloud; there is still no scheduled job. The new
property time-zone column and zone-scoped lifecycle routine are also local-only
until migration and deployment verification.
The shared receivable generator now classifies each newly generated row using
its requested business date rather than the browser clock. A regression test
covers open versus overdue on either side of the due date. This fixes
deterministic replay but does not install a server-side receivable job.
The lead-window setting is now a portfolio column with a 0-120 range check,
read by every operator and persisted before Settings reports success. A
legacy browser-only value is intentionally not migrated because different
operators could have conflicting values; existing portfolios start at the
former default of 15 days. Target backend deployment is still required.
The prepared scheduler reuses the shared TypeScript billing calculator, restarts
advance cycles at an active rent-formula amendment's effective date, and writes
through a service-only, idempotent SQL RPC. Isolated tests cover replay after
a receivable is paid and rollback of a mixed valid/invalid batch. Deno 2.9.6
type-checks the Edge Function on an arm64 runtime. No function or Cron job has
been installed on Lovable Cloud, and the target's known missing-assignment
leases would currently produce a monitored HTTP 409; this remains no-go.
Lease edit now computes replacement receivables from changed lease and unit
windows. The database rejects a stale schedule and commits the lease,
assignments, unpaid schedule replacement, and tenant statuses together. A
locally executed SQL test proves paid future rows are preserved and an
injected new-receivable failure rolls back both the lease and schedule.
Past-dated notice cancellation uses the changed prior window to restore
missing cycles. These behaviors have not been tested on the target backend.
The new lease-property guard rejects direct table writes that could move a
lease or assigned unit to another property, or attach a unit from a different
property. A preflight deliberately stops the migration if historical links
already violate that rule. Isolated SQL tests cover the guards and preflight;
the target audit and concurrent authenticated staging test remain open.
Draft amendment deletion now requires a version-checked server transaction.
Direct deletion of applied amendments, or their structured change rows, is
blocked at the database. Applied amendments also cannot be downgraded to
draft or have their terms rewritten. Isolated tests cover stale versions, direct DELETE,
lease-delete rollback, and portfolio deletion; target-backend verification
remains open.
The shared generator now skips a cycle when the supplied dated assignments
do not cover that cycle, instead of falling back to a stale lease-level unit.
The server job also reports an active lease with no current assignment or a
property linked to another portfolio as incomplete. Unit and job tests cover
these cases; target-backend behavior is still unverified.
The portfolio lead window now compares to each cycle's actual due date (and
sizes an open-ended schedule through that cycle), rather than comparing to the
cycle start. A boundary test covers an end-of-month due day.
A read-only feature inventory on the target found `leases.indexation_enabled`
present, but `lease_document_types`, `cost_entries.recognition_mode`, and
`properties.is_partially_owned` absent. None of the nine checked transactional
functions is installed: `create_lease_with_schedule`,
`save_receipt_allocations`, `save_cost_entry_with_allocations`,
`save_allocation_rule_with_shares`, `activate_amendment_with_schedule`,
`save_lease_with_tenant_statuses`, `save_amendment_with_changes`,
`create_charges_reconciliation`, or `accept_portfolio_invitation`.
This is a direct schema mismatch, not merely an unrecorded migration-history
version; publishing the current frontend against this backend would break
consequential writes.
The same read-only financial audit on Lovable Cloud on 2026-10-17 returned
zero receivable-arithmetic errors, currency mismatches, nonpositive
allocations, or positive-receipt unmatched-range errors. It did return two
negative bank-transfer receipts (-100 and -50 EUR) marked `matched` in
`Aurelien Botermans's Portfolio`, and one 120 GBP receipt in Demo marked
`matched` with no allocation rows and zero unmatched balance. These three
rows require business interpretation before any status, balance, or deletion
change. No financial data was changed during the audit.
On 2026-10-18, the target contained four legacy unit IDs in amendment change
metadata (`unitAssignments`: two, `unitChargesShare`: one, `unitRentShare`:
one), all uniquely resolvable by `units.legacy_id`. The new migration and
read-only audit check normalize or flag these references. Two applied unit
assignment changes still need business-data repair after normalization:
`BAIL-AMS-001` records an added parking unit effective 2025-11-01 but has no
corresponding assignment row, while `BAIL-BRU-001` records a removal effective
2026-03-01 whose assignment still ends 2026-06-11. No live rows were changed.
The 2026-11-05 read-only recheck found both discrepancies unchanged.
`BAIL-AMS-001` has no scheduled receivable on the added unit `AMS-O02`; that
unit is assigned to the later `BAIL-AMS-002` from 2026-09-01. The first lease
is marked ended but still has a nominal end date of 2027-12-31, so neither an
open-ended nor a nominal-end-date assignment should be inserted blindly.
`BAIL-BRU-001` still assigns removed unit `BRU-ST1` through 2026-06-11. Eight
March-June 2026 rent/charges receivables on that unit total 5,000 EUR
outstanding (4,400 rent and 600 charges); none has an allocated payment.
The lease is marked ended and has a 2026-06-11 actual move-out, but its
nominal end date is 2027-05-31. The audit script now reports assignment
windows, the next other-lease assignment and post-amendment receivable
counts/amounts. Review the signed amendments and actual occupancy before
repairing assignment dates or cancelling any receivables; no target data was
changed by this investigation.
The expanded amendment audit passed the 2026-11-05 local gate: 443 tests in
88 files, build, lint, app TypeScript, 86 unique migration versions, and
`git diff --check`.

The locally installed Deno executable could not run on this ARM Mac. A
temporary official Deno 2.9.8 ARM archive was checked against its published
SHA-256 (`9f0bf660393da2eaff044cdc7444cb08c73f235849b61d224d825a194ce7c98e`)
before use. `deno check` then found a nullable `periodMonth` comparison in
amendment validation; the corrected warning now includes open manual items
without a period month and advance-payment cycles crossing the amendment
effective date, while excluding cancelled and written-off items. Focused
tests and all three Edge Function type checks pass locally. Deployment,
hourly dispatch, and closed-browser behavior remain unverified on Lovable.
The full post-fix gate passed 445 tests in 89 files, `npm run build`,
`npm run lint`, app TypeScript, `npm run check:migrations` (86 unique versions),
and `git diff --check` on 2026-11-05.
Amendment formula activation now refuses an existing rent or charges cycle
billed before the effective date whose stored cycle end still covers that
date. Such a row would otherwise be retained while the new formula starts a
second billing cycle, risking duplicate charges. The dialog explains how to
defer the effective date or reconcile the existing receivable; the same
validation blocks the browser and scheduled server plans. Paid, unpaid, and
cancelled boundary cases have focused tests. This is a deliberate manual
reconciliation gate, not an automatic credit or adjustment; validate the
contractual treatment on restored target data before release.
The lease closure dialogs now also identify billed rent/charges periods that
cross the chosen end date and future scheduled rows that the database preserves
because they are paid, allocated, or otherwise protected. They do not create
credits or prorate an invoice. Four local tests cover crossing and boundary
dates, protected future rows, and rows the closure trigger prunes. The
2026-11-05 local gate passed 452 tests in 90 files, build, lint, app
TypeScript, 86 unique migration versions, and `git diff --check`. Authenticated
browser and backed-up target-backend verification remain open.
The property-day closure and initial-contract correction then passed the
2026-11-05 local gate: 455 tests in 90 files, build, lint, app TypeScript,
87 unique migration versions, and `git diff --check`. The SQL test uses
Honolulu and Kiritimati to prove both directions of a one-day difference.
An earlier wrapper attempt created a subtransaction and duplicated a lease
status-history row; the final function has no exception block, and the
existing atomic-closure test again confirms one history row. This migration
has not been applied to Lovable Cloud.
The Payments receivables table and overdue-only filter now derive each row's
effective status from its property's business day, like the dashboard and
reports. A UI test covers Brussels and London on opposite sides of local
midnight. Authenticated preview verification is still needed; the Mac was
locked when the browser-control session was checked.
The 2026-11-05 local gate after this correction passed 457 tests in 91 files,
`npm run build`, `npm run lint`, app TypeScript, 87 unique migration versions,
and `git diff --check`. This does not clear target database, browser, or
published-host checks.
On 2026-10-18, the live schedule-key audit returned zero duplicate groups
and zero surplus receivables. Checks for lease/receivable property mismatches
and open schedule rows after closed-lease end dates also returned zero; the
positive-receipt allocation-drift count was one, matching the known GBP
receipt above. Repeat the audit immediately before installing the duplicate
prevention trigger or declaring the target financial data clean.
The lease-list ending-soon filter and lease-expiry report now exclude past
end dates, use calendar-day boundaries across DST, and refresh with other
date-sensitive views at local midnight or when the browser regains focus.
These changes have unit tests but still need authenticated browser QA in the
target business time zone. Amendment activation now preserves explicit zero
unit rent/charges shares in the lease record; the original-contract tab
reconstructs original rent/charges from the pre-amendment assignments.
Superseded amendments are now folded into effective terms for their historical
dates; recorded old values restore the original deposit, notice, formula,
indexation settings, and tenant fields. Explicitly clearing indexation values
on an amendment persists nulls rather than reviving old indexes; these paths
have regression tests. An indexation-only amendment now retains the original
billing-cycle anchor; only a rent-formula change starts new cycles at the
effective date. New per-unit amendment changes now preserve the pre-amendment
lease end in change metadata. The original-contract projection restores that
baseline; legacy single-unit `unitEndDate` changes use their recorded old value.
Local tests cover extension, shortening, a post-end view, a longer-running
unit addition, and successive per-unit end changes, including a later
legacy lease-end change. Older add/remove
amendments without a baseline still need data-specific historical review:
the current lease row is updated on activation, and those changes did not
always record enough information to reconstruct the original unit windows.
A fresh
`npm audit --omit=dev --audit-level=high` on 2026-10-17 reports zero
vulnerabilities. Guarantee
forms now reject negative/non-numeric amounts and retention above the amount
received, with field-level errors. Receipt creation and manual allocations
reject non-finite amounts before writing. Automatic and manual allocation now
use the same scope priority (lease, then tenant, then property) so a receipt
linked to one lease cannot be applied to another tenant merely because both
leases belong to the same property. These are local tests only; authenticated
payment and guarantee smoke tests against the target backend are still needed.
Partially recoverable costs now require an explicit tenant-recoverable share
between 0% and 100%. Allocation, profitability, lease reconciliation, and
cost-list displays use that share; the new migration preserves the historical
50% interpretation of existing entries. Its SQL constraint passes an isolated
Postgres test, including a repeated application, but it has not been applied
or smoke-tested on Lovable Cloud. The cost allocation overview now labels
each property and unit amount with that property's currency rather than
defaulting to EUR; multi-currency browser QA remains open.
Cost entry creation and editing now use one database transaction for the entry
and its allocated rows. The invoker-rights RPC checks the expected update time,
references, and amount split, then returns persisted rows. Isolated PostgreSQL
tests prove rollback after a child-row constraint failure and RLS write denial.
This migration is not applied to Lovable Cloud, so those forms are intentionally
blocked on the current backend until migration reconciliation and backup.
Lease/amendment lifecycle writes still need equivalent backend atomicity or a proven
recovery strategy before release.
Allocation-rule creation/editing and share replacement now use one
invoker-rights transaction. Isolated PostgreSQL tests cover stale versions,
percentage validation, property scoping, rollback, and role denial. This
migration is not applied to Lovable Cloud; rule editing is intentionally
blocked there until backend reconciliation and target QA.
Charge reconciliation creation/deletion and the linked adjustment receivable
now use invoker-rights transactions. The creation RPC checks the signed balance,
resolution, lease, and duplicate periods; the deletion RPC rejects stale
versions and adjustments with payment allocations. Isolated PostgreSQL tests
cover rollback, no-action resolutions, and reader denial. The migration
`20261018000000_atomic_charges_reconciliation.sql` has not been applied to
Lovable Cloud, so these actions are blocked there pending backup, migration
reconciliation, and target QA.
The next reconciliation now defaults to the day after the prior inclusive
period, and an overlap is shown inline. A later database trigger serializes
writes for the lease and rejects any overlapping period, including direct row
updates; its migration refuses historical overlaps. The local PostgreSQL test
proves boundary behavior and failed-write rollback, but target concurrency and
historical-data checks remain open.
Amendment creation and editing now save the parent and its structured changes
in one invoker-rights transaction. The database assigns the amendment number
while holding the lease lock, checks the expected edit version, and rolls back
the parent if a change insert fails. Isolated PostgreSQL tests cover rollback,
stale edits, numbering, and reader denial. The migration
`20261018010000_atomic_amendment_changes.sql` has not been applied to Lovable
Cloud; amendment saves are blocked there until backup, migration reconciliation,
and target QA. Activation has its own later migration and target QA gate.
Activation now uses an invoker-rights transaction for the lease, assignment
windows, amendment statuses, generated receivables, and changed tenant
statuses. A full-chain embedded PostgreSQL test covers a successful write,
stale version refusal, rollback after a rejected new receivable, and viewer
denial. The migration is not applied to Lovable Cloud, so activation is
intentionally blocked there until migration reconciliation and target QA.
The same transaction now accepts a regenerated `overdue` receivable when an
amendment is activated after its effective date. The isolated PostgreSQL test
persists that retroactive row and still checks rollback on invalid input;
target-backend verification remains required.
The later `20261018190000_amendment_rpc_only_writes.sql` migration revokes
direct authenticated writes to amendment parents and change rows, makes the
original save/activation/closure functions private to ordinary users, and
adds role-checked client wrappers plus a version-checked draft/scheduled
status RPC. Embedded PostgreSQL tests cover direct promotion denial, editor
save and activation, viewer denial, and lease closure with the wrapper. The
backend still requires restored-staging and target verification before use.
Activation also preserves future schedule receivables explicitly marked
cancelled, disputed, or written-off rather than deleting them as if they were
unpaid open items. A regression test covers this. Scheduled activation still
requires an authenticated server process to run when no browser is open.
Ordinary lease editing now uses a separate invoker-rights transaction for the
lease row and changed tenant statuses, with version checks on both. The
embedded PostgreSQL test covers success, rollback on stale tenant data,
stale lease refusal, and viewer denial. Its migration has not been applied to
Lovable Cloud, so the matching edit flow is intentionally blocked there.
The later status-history migration records the initial lifecycle on insert and
writes subsequent lease-edit transitions in the same transaction as the lease
and tenants. Embedded PostgreSQL tests cover one history row per transition,
no row for an ordinary edit, and rollback when history insertion fails. The
target backend still needs an authenticated lifecycle and history smoke test.
A deferred database guard also catches direct status changes that bypass the
application RPC. It recognizes history rows written in the same transaction,
so manual, closure, and scheduled transitions do not duplicate the audit row.
Embedded PostgreSQL tests cover direct-write rollback on history failure and
the scheduled transition's single-row history invariant; the deployed backend
still needs the same checks.
The new closure trigger removes only unpaid, unallocated lease-schedule rows
whose due date is after the ended/terminated lease's new end date. Its embedded
PostgreSQL test proves paid and manual rows survive and a failed closure rolls
back the cleanup. The UI reloads the lease's actual receivables after a
successful closure. The later closure RPC now updates the lease, assignment
windows, active amendments, unit vacancy, and linked tenant statuses in one
invoker-rights transaction, including the status-history row. Its embedded
PostgreSQL test covers success, rollback after tenant or history write failure,
stale versions, and viewer denial. It
does not prorate or settle an already due advance cycle that crosses the closure
date; this still requires reconciliation and target QA.
Lease deletion now uses a separate transaction that rejects financial records,
documents, notice, and completed occupancy, then recalculates linked tenant
statuses from surviving leases. Direct client DELETE on `leases` is revoked;
the security-definer RPC checks portfolio role and lease version explicitly.
The embedded PostgreSQL test covers protected data, rollback after tenant
failure, viewer denial, and direct-table denial. Target verification remains
required after deployment.
Lease creation now uses one invoker-rights transaction for the lease, unit
windows, generated receivables, and affected tenant statuses. It locks units
before overlap checks and returns database-confirmed rows; isolated PostgreSQL
tests cover rollback, stale tenant data, date boundaries, and role denial.
This migration is not applied to Lovable Cloud, so new lease creation is
intentionally blocked there until backup, migration reconciliation, and
target-backend QA.
Receipt creation with auto-allocation, quick-pay, and manual allocation now use
one invoker-rights database transaction. It verifies optimistic versions,
currency, scope, and balances and returns persisted rows before the UI changes.
Isolated PostgreSQL tests cover stale receipt/receivable versions,
cross-currency rejection, duplicate allocation ids, and rollback after a child
constraint failure. The migration is not applied to Lovable Cloud, so these
flows are intentionally blocked there until backup, migration reconciliation,
and target-backend QA. A receipt created without allocation still uses a
single-row insert.
Cancelled, disputed, and written-off receivables are excluded from automatic,
manual, and quick-pay allocation, with the same rejection enforced by the RPC.
Occupied-only cost rules now select units from dated lease assignments at the
cost start date, including historical ended/terminated leases, instead of the
unit's current manual status. The rule still needs target-backend QA and a
business decision for costs spanning multiple occupancy changes.
Inline key identifiers and meter readings now save on blur rather than every
keystroke; failed writes restore the previous value. Meter entries accept a
decimal comma and reject invalid/negative readings. Stale quick-pay and manual
allocation targets now surface an error instead of returning silent success.
An authorized network check on 2026-10-17 reached published deployment
`3c364263-503b-4c6f-993c-96eadf0a6afe` and confirmed missing CSP,
`X-Frame-Options`, and `Permissions-Policy`. It returned 404 for
`/release.json`, so the published revision is not traceable by the new build
marker. The local build emits `/release.json` with revision
`b30c4095c3d70e42bca38f0ab21230b790e04a41` and `dirty: true`; that
local working tree is not deployable as-is.
Earlier manual receipt allocation used client-side compensation after a failed
write; that path has been replaced by the atomic RPC above. Its old 189-test
result is historical evidence, not the current release gate.
Read-only financial checks on 2026-10-17 found no receivable arithmetic errors,
nonpositive allocations, or cross-currency allocations. Two negative receipts
in a non-Demo portfolio were marked `matched` with no allocations. The owner
confirmed these were erroneous negative amounts and approved correcting them
to +50 and +100 EUR; the 2026-11-04 correction is recorded below. One 120 GBP receipt
in Demo is `matched` with zero unmatched amount but has no allocation rows.
No payment data was changed. The receipt-status helper now classifies invalid
nonterminal amounts as `exception` on recalculation, but it does not rewrite
stored historical rows; the data anomalies remain a release blocker.
The complete read-only audit SQL was rerun on Lovable Cloud on 2026-10-17:
`receivable_arithmetic=0`, `nonpositive_receipt_without_terminal_status=2`,
`positive_receipt_unmatched_out_of_range=0`, `nonpositive_allocation=0`,
`allocation_currency_mismatch=0`, and
`positive_receipt_allocation_drift=1`. The two negative bank transfers are
-50 and -100 on 2026-06-18; the 120 bank transfer is dated 2026-06-17.
Their business intent is still unconfirmed, so none were changed.
The 2026-10-18 read-only Lovable SQL recheck still found
`receivable_arithmetic=0`, `nonpositive_allocations=0`, and
`nonpositive_receipts=2`. Both nonpositive receipts remain `matched`, with
amounts of -100 and -50. The owner later confirmed they were errors and
approved a positive-amount correction. The target migration history contains 29 entries and
ends at `20260622145643`, versus 79 unique local migrations. No SQL writes or
target migrations were run during this recheck.
The same read-only audit found zero duplicate lease-schedule rows, zero
out-of-range positive receipt balances, zero cross-currency allocations, and
one positive receipt whose allocation rows do not match its saved balance.
It also found three non-draft leases with no unit assignment: `HUB` (active),
`REZ` (signed), and `REZ2` (signed). None has a receivable linked to a unit, so
the correct assignment cannot be inferred from billing history. No
overlapping charges reconciliations, lease/assignment property mismatches,
lease/receivable property mismatches, or open schedule rows after closed lease
end dates were found in this snapshot. These counts need a fresh preflight
after backup and before migrations.
Four amendment unit references were flagged because their metadata holds a
legacy unit ID rather than a UUID: two `unitAssignments`, one
`unitChargesShare`, and one `unitRentShare`. All four resolve through
`units.legacy_id` within the same property and portfolio. The staged
normalization migration must still prove it rewrites them without changing
the amendment's intended unit. The same audit found zero unit millieme-key
totals above the property base, invalid share roots, or invalid share values.
At the 2026-10-18 UTC/European business date, the live lifecycle audit found
one lease still `active` after its end date (`RAT1`, end 2026-08-30) and four
still `signed` after their start dates (`BAIL-AMS-002`, `BAIL-PAR-003`, `REZ`,
`REZ2`). The scheduled lifecycle worker and its migrations must be exercised
on restored staging and then proven to advance the target without losing
status history or misassigning units. This snapshot uses `current_date`
because the live properties lack the local `time_zone` column; rerun the
property-zone audit after migration.
The 2026-11-04 read-only recheck found zero receivable arithmetic errors and
zero duplicate lease-schedule rows, but still three non-draft leases with no
unit assignment (`HUB`, `REZ`, `REZ2`). Two active leases are now past their
end date (`RAT1`, `HUB`), while the same four leases remain signed after their
start date. The query used the database's `CURRENT_DATE`, not each property's
business zone; all listed dates are months past, so a time-zone boundary does
not explain these results. No lease status or assignment was changed.
The 2026-11-05 time-zone migration precheck found eight properties with
country codes `BE` (2), `DE` (1), `FR` (3), `GB` (1), and `NL` (1). Every
observed code has an explicit mapping in the prepared backfill; this does not
verify the eventual property-zone scheduler on the target.
The 2026-11-05 read-only drill-down confirmed the exact affected records.
`HUB` is active through 2026-10-31 with no assignment, receivable, status
history, or signed date. `REZ` is signed through 2026-10-31 and `REZ2` is
signed through 2026-04-30; both have no assignment, receivable, or status
history. `REZ2` has a signed date of 2026-06-28, after its lease end. `RAT1`
is active through 2026-08-30 with one assignment and three status events, the
latest still active. The other two past-start signed leases are
`BAIL-PAR-003` (starts 2026-07-01, three assignments) and `BAIL-AMS-002`
(starts 2026-09-01, two assignments). None was edited. There is no reliable
billing or status-history evidence from which to reconstruct the missing
assignments for `HUB`, `REZ`, or `REZ2`; require a business decision on each
record before correction. After rehearsed migrations and lifecycle-worker
deployment, verify the four valid assigned leases advance with status history,
then separately resolve the three unassigned records and re-run the audit.
The release SQL audit now also counts leases without any status-history row
and leases signed after their end date. On the 2026-11-05 live target those
counts are four (`HUB`, `REZ`, `REZ2`, draft `QA-INDEX-001`) and one (`REZ2`),
respectively. The local migration chain executes the expanded audit with zero
findings on a fresh database; it has not repaired these live rows.
An additional read-only Cloud audit on 2026-10-17 found one stored active
lease without an assignment covering the Brussels business date: `HUB`
(2025-04-01 through 2026-10-31). It found zero
open/overdue, unallocated lease-schedule receivables extending past an ended
or terminated lease. The latter is a data snapshot, not proof that closing a
lease cleans future schedule rows; the current closure path does not remove
them. Resolve the active lease and test closure of a lease with future
receivables before release.

Read-only Lovable Cloud inspection on 2026-10-17 found RLS enabled on
`properties`, `leases`, `lease_documents`, `receivable_items`, and `cost_entries`.
The recorded migration history stops at `20260622145643`. Indexation columns
exist on `leases`, but `properties.is_partially_owned`, the custom document type
table and contractual document columns, and cost amortization columns are
absent. `lease_amendments.amendment_type` is still present. A database export
and isolated restore must precede reconciling this schema drift; enabling RLS
alone does not prove that cross-portfolio policies are correct.
On 2026-11-04, the target still held the same 29 migration-history rows.
Their versions differ by one to three seconds from the first 29 local
filenames, but each target `md5(array_to_string(statements, E'\n'))` matched
the corresponding local file byte for byte. The prepared history-only repair
script checks all 29 versions and SQL hashes in one transaction, rejects
unexpected rows, and updates nothing when an assertion fails. Its isolated
PostgreSQL tests cover successful mapping, rollback on a changed body, and
rejection of migration rows added after the target snapshot.
The repair has **not** been run on Lovable Cloud; a restored-backup rehearsal
and a fresh target fingerprint are required first.
The owner declined a full database export and any paid staging environment
on 2026-11-04. Do not use a live migration or live financial-data rewrite as a
substitute for the missing recovery rehearsal. The current daily Lovable
backup has not been restored and does not prove storage-file recovery.
Lovable's own database documentation confirms that drafts share the project's
database and that a daily backup restores over that same project, not into a
separate staging environment. It also says database backups exclude storage
files: https://docs.lovable.dev/features/database and
https://docs.lovable.dev/features/database-backups.
An additional read-only SQL check on 2026-11-04 identified the two erroneous
receipts by ID: `27773004-5552-4dd7-995f-0e2e12e29887` (-50 EUR) and
`eb2abc52-ef03-41ab-8e63-fbee0057e5c4` (-100 EUR). Both are dated
2026-06-18, marked `matched`, have `unmatched_amount` equal to their negative
amount, and have no allocation, bank-transaction reference, import batch, or
receipt reference. After the owner specified +50 and +100 EUR, a single guarded
SQL statement locked and updated exactly these two rows, checking their old
values and absence of allocations first. A read-back confirmed amounts and
unmatched balances of +50 and +100 EUR, status `unmatched`, no allocations,
and zero remaining nonterminal nonpositive receipts. The 2026-11-04 Lovable
backup at 05:04:45 UTC predates this narrow correction but has not been test-
restored. This was a targeted data repair, not validation of the pending
schema migrations or a substitute for a recovery exercise.
The post-correction audit found one remaining positive receipt allocation
drift: `56c641a0-0c14-4fce-8117-b8ae863434a6`, a 120 GBP bank transfer
dated 2026-06-17 with reference `test2`, `matched` status, zero unmatched
amount, and no allocation rows. It links to lease `BAIL-LON-001`. The owner
confirmed that it should remain unallocated. A guarded SQL correction changed
only this row to `unmatched` with `unmatched_amount = 120`; a read-back
confirmed the amount, currency, status, balance, and zero allocations.
The subsequent live audit returned zero nonpositive nonterminal receipts,
zero positive-receipt allocation drift, zero out-of-range unmatched balances,
zero nonpositive allocations, and zero allocation currency mismatches.
This data repair does not validate the pending schema migrations.
An additional read-only document audit on the Lovable database found four
lease-document rows and four files in the `lease-documents` bucket. It found
zero missing files, wrong-portfolio paths, wrong-lease paths, or orphaned
files. This confirms the existing references, not the uninstalled Storage
deletion policy or backup recovery.
On 2026-11-05, a read-only cost-scope audit found zero cost entries with both
`unit_id` and `allocation_rule_id`, and zero unit-direct cost entries with
allocation-result rows. The app now rejects mixed scope on create/update,
profitability and reconciliation prefer the direct unit cost if stale rows
ever appear, and migration `20261018235900` enforces the exclusive-scope
constraint. The migration validates historical rows and will fail rather
than silently accept mixed-scope costs. It has not been installed on Lovable.
A read-only 2026-11-04 schema check confirmed that Lovable Cloud still lacks
`lease_documents.document_type`, `.status`, and `.signed_date`, as well as
`cost_entries.recognition_mode`, `properties.is_partially_owned`, and
`portfolios.receivable_lead_days`. It does have `leases.indexation_enabled`.
The contractual-document status audit could not run because `document_type`
is absent. These are directly observed launch blockers, not inferred solely
from migration history.
The 2026-11-04 full local gate passed 371 tests in 75 files, build, lint,
app TypeScript, unique-version validation for 80 local migrations, and
`git diff --check`. The new document-file policy was exercised with an
authenticated editor and viewer, including a reference hidden by
cross-portfolio RLS, in embedded PostgreSQL. The live target still
records only the first 29 SQL-identical migrations, leaving 51 pending; the
new policy is not installed there. An indexation test had depended on the wall-clock date
to exclude a November receivable; it now checks the billing-day invariant
instead, so the 30-day generation horizon can advance without false failure.
The scheduler now validates a strict UTC `businessInstant` within 15 minutes
of its server clock before running any job. Fifteen targeted scheduler tests
and an esbuild bundle passed locally; the Edge Function's Deno check and
deployed behavior remain unverified.
The document cleanup worker now rechecks Storage after a nominally successful
delete and retains the queue row if the file remains or verification fails.
Eleven focused cleanup tests and an Edge bundle passed locally; a deployed
Storage failure/retry test remains open.
The same-day production dependency audit initially found one high-severity
advisory in the unused direct `zod` dependency. Removing `zod` from the
manifest and lockfile reduced `npm audit --omit=dev --audit-level=high` to
zero findings. The full local gate was repeated on that final lockfile and
passed; CI must repeat it on the reviewed release commit.
In the latest 2026-11-04 local rerun, Deno could not execute because the
installed binary is for a different CPU architecture, and npm audit could not
reach the registry. Neither check is treated as a fresh pass; both must pass
in CI on the release commit.
The live `leases.end_date` column is `NOT NULL`, although the Add Lease form
accepts an empty end date. `20261017180000_allow_open_ended_leases.sql` is
prepared locally to allow null dates and enforce end >= start when present.
A read-only preflight found zero existing leases with end < start. The app now
stores a blank lease end as SQL null and generates complete open-ended billing
cycles instead of truncating one at a temporary scheduling horizon. This
migration and workflow have not been tested on the target backend.
Lovable Cloud exposes the database export at Cloud > Advanced settings > Export
data. Its private `lease-documents` bucket was rechecked on 2026-10-17 and
still showed zero files; verify storage again immediately before backup, since
the database export alone does not cover files uploaded later. No export or
restore has been performed. Starting the export would create a downloadable
copy in Lovable Cloud storage and email a temporary link. That action was
stopped pending explicit user approval; do not bypass it or apply migrations
without a restorable backup.

The same inspection found `lease_documents` and `lease-documents` storage write
policies granting every portfolio member mutation rights, including viewers.
`20261017120000_restrict_lease_document_writes.sql` narrows writes to the
roles that can edit leases and checks that a document's lease belongs to its
portfolio. The migration is prepared locally but not yet applied to Cloud.
`20261017130000_enforce_lease_document_types.sql` prevents uploading a
document with an unknown custom type and deleting, renaming, or moving a type
still in use. These paths pass an isolated in-memory PostgreSQL test. Its
concurrent upload/delete behavior and target RLS still need integration tests
after migration.
The duplicate-receivable trigger also passes an isolated PostgreSQL test for
duplicate insert and update rejection while permitting distinct schedule slots
and manual rows. It has not been applied or concurrency-tested on Cloud.
`20261017170000_align_admin_data_permissions.sql` updates 21 operational
tables and lease status history so admins can write business data, as promised
by the Settings role description. Representative property, receipt, and cost
writes pass isolated RLS tests for admin, editor, viewer, and outsider roles.
The prepared document/storage policy migration likewise passes isolated tests
for admin/editor writes, viewer denial, and cross-portfolio lease rejection.
These migrations still require restored-backup testing and target verification.
Read-only Cloud preflight on 2026-10-17 found every existing policy name
expected by the admin-role migration; the migration has not been executed.
The shared portfolio write-access rule now hides and guards mutation controls
on property, unit, tenant, vendor, lease, payment, maintenance, cost-entry,
cost-category, and allocation-rule lists, plus property, unit, tenant,
maintenance, and lease detail pages. Contractual document and amendment dialogs
and the lease's charge-reconciliation section also guard their writes;
document view/download, status history, and other
read-only navigation remain available. Edit/create deep links wait for the
portfolio role before opening forms.
The signed-document date editor stays open when its status write or lease
sync fails instead of disappearing after an error toast.
Background receivable generation and scheduled amendment activation also skip
viewer sessions; the receivable behavior has a regression test. The role
helper has unit tests, but a real viewer, editor, and administrator session
against the target backend have not been exercised. Viewer mode therefore
remains a release blocker. The local preview redirects to login without an
authenticated test session, and the connected Mac was locked during the
2026-10-17 browser handoff. A browser visit is not a substitute for a backend
scheduler to activate amendments while nobody is signed in.
The advance-cycle panel now anchors its current-formula view to the most recent
applied formula amendment rather than the original lease start. Paid amounts
distinguish old and new cycle indexes by period and cycle end, and open-ended
leases receive a complete display horizon. Focused unit tests pass; this panel
still needs authenticated browser verification.
The unit form no longer silently caps an excessive millieme share. It retains
invalid input, shows a field-level error after save, and applies the remaining
capacity across the entire bulk-create count. Parser and capacity tests pass;
the add/edit dialog still needs authenticated browser verification.
Calendar-day decisions across lease status, amendment activation, receivables,
occupancy, payments, and reports now use the local day rather than UTC midnight.
Tests cover Belgian/London summer and winter boundaries and show that an
open-ended active lease is not mislabeled overdue because its end date is blank.
Cross-border property-specific time zones and scheduled server activation
remain separate release gates.
The Cloud `lease_documents` table has four rows but still lacks
`document_type`, `status`, and `signed_date`. Two older rows have type metadata
only in `notes` (one draft amendment and one custom `id` type). Migration
`20261017185000_backfill_legacy_lease_document_metadata.sql` now restores
those values to the real columns after the schema/type-guard migrations and
registers referenced custom types. An isolated PostgreSQL test verifies the
backfill and an abort on incomplete signed metadata. New document uploads no
longer retry without their selected type or report a local-only type as saved;
Settings retains prior local type drafts for explicit import after migration.
The Documents dialog checks for the required database columns before enabling
Add Document; component tests cover both missing and available schemas.
The migration is prepared, not applied to Cloud. A restored-backup rehearsal
and authenticated upload/type-status smoke test are still required.
The 2026-11-05 read-only recheck parsed both legacy metadata objects: the
custom document has `documentType=id`, null status and null signed date;
the amendment has `documentType=amendment` and `status=draft`. Neither row is
missing a required field for that migration. This checks those two current
rows only; it is not a restore or migration rehearsal.
The original schema permits a row in one portfolio to reference a parent row
in another portfolio: its RLS policy checks only the child's `portfolio_id`,
while its foreign key checks only the parent's `id`. The prepared
`20261017150000_enforce_portfolio_reference_integrity.sql` migration checks
same-portfolio references on 18 tables, prevents direct reassignment of any
row's `portfolio_id`, and aborts if historical mismatches exist. The
migration has not been applied to Cloud. After a restorable backup, test
authorized same-portfolio inserts/updates, rejected
cross-portfolio references, rejected parent-portfolio changes, and updates to
each nullable reference.
The migration now passes isolated PostgreSQL tests for same- and
cross-portfolio unit references, cross-portfolio receipt allocations,
lease billing tenants and JSON participant IDs, immutable portfolio IDs,
and rejection of historical mismatches or malformed participant data.
Preflight against the live Cloud schema caught three stale column references
(`leases.unit_id`, `leases.primary_tenant_id`, and
`lease_documents.amendment_id`); the prepared migration now uses the actual
`billing_tenant_id` and `tenant_ids` fields and omits the deleted document
field. On 2026-10-17, read-only Cloud queries found no missing columns for
the corrected UUID reference pairs, zero cross-portfolio lease participant
links, and zero mismatches across all corrected reference pairs. This proves
the preflight data shape, not deployed triggers or target RLS policies.
`20261017140000_secure_portfolio_invitation_acceptance.sql` replaces the
unusable non-member invitation table flow with token-scoped preview and atomic
acceptance functions. An isolated PostgreSQL test now covers token preview,
successful and repeat acceptance, wrong email, expiry, revoked inviter, and an
existing member. Repeat these cases with real accounts before release. The
`create-portfolio-user` Edge Function now writes membership through the caller's
RLS-protected client, rather than bypassing owner-role rules with the service
role. A separate isolated PostgreSQL test confirms admins cannot promote
themselves, add an owner, or demote an owner through upsert. The installed
`deno` executable is incompatible with this host CPU, so the Edge Function
itself still needs a deploy-time type check and integration smoke test. Configure the
Supabase Auth redirect allowlist for the deployed `/accept-invite/*` path and
verify the email-confirmation link returns to the invitation.
On 2026-11-05, the local direct-member flow was restricted to existing Auth
accounts with a confirmed email. It no longer creates an account,
auto-confirms an address, collects an administrator-set password, or writes a
profile; new users must use the token-scoped invitation flow. The Edge
Function verifies the membership write and its errors are shown in the form.
The UI test confirms no password field or password payload. Deploy the
updated function and smoke-test verified-account success, unknown and
unconfirmed-account refusal, duplicate-add refusal without role change, and
owner-role denial for an admin with real accounts. The local function now
inserts memberships instead of upserting them, and an isolated PostgreSQL
test confirms a duplicate insert leaves the existing owner's role intact.
The currently published function may still have the old behavior.
On 2026-11-05, direct member addition changed from upsert to insert, so an
already-present account cannot be silently demoted or promoted through the
add form. A new manager-scoped member-list RPC supplies the account email for
role management; the Settings page clears and discards stale results when
switching portfolios and disables changes if that list cannot load. Focused
PostgreSQL and UI tests cover duplicate-add refusal, owner/admin visibility,
viewer/anonymous and cross-portfolio denial, out-of-order responses, and
failed-list behavior. The full migration chain passes locally with 82 files;
the new RPC has not been applied to Lovable Cloud.
The 2026-11-05 invitation hardening migration rejects acceptance by a
signed-in account whose email is not confirmed. The isolated PostgreSQL test
proves the rejected attempt writes neither membership nor acceptance date and
the same token works after confirmation. The full 82-migration chain and
migration-version check pass locally. The target backend has not applied the
new migration or deployed the verified-account-only member function.
The Lovable Domains page currently lists only `rentflowing.lovable.app`; no
custom domain or reverse proxy is configured to supply missing response headers.
On 2026-11-05, local authentication handling was hardened: a rejected initial
session request no longer leaves the app loading indefinitely, a late initial
session response cannot overwrite a newer auth event, and rejected sign-in,
sign-up, password, and sign-out requests return visible errors. The account
menu now stays on the current page when sign-out fails and uses localized,
accessible labels. Focused failure-path tests pass; the complete local gate
passed 392 tests in 80 files, build, TypeScript, lint, and `git diff --check`.
These are local checks, not an authenticated smoke test of the published app.
The maintenance backlog report also now defaults to open, assigned, and
in-progress tickets instead of counting completed/cancelled tickets as open.
Ticket age uses calendar days in the property's business time zone, so a
same-day ticket is zero days old and daylight-saving changes do not add an
extra day. Three report UI tests cover same-day age, a clock change, and
closed-ticket exclusion; build, TypeScript, lint, and diff checks pass. The
published report still needs authenticated verification with real tickets.
The Rent Roll now derives current leases from the property's calendar day and
requires a current unit assignment. This excludes a stale `active` lease past
its end date, includes a signed lease whose term has started, and displays the
currently assigned unit rather than a stale legacy unit reference. Local UI
tests cover these cases, the monthly rent total, and a Brussels/London
cross-border midnight. A current lease excluded for lack of an assignment
is explicitly listed in the report with a link to its record. The 2026-11-05
full local gate passed 397 tests in 82
files, build, TypeScript, lint, and diff checks. This does not advance the
stored lifecycle stage or repair the live unassigned leases; those remain
separate backend and data-reconciliation release gates.
The overdue report now groups outstanding receivables by tenant, lease, and
property instead of assigning all of a tenant's debt to the first active
lease. An ended lease with unpaid receivables retains its own reference and
property, while the overdue-tenant KPI still counts distinct tenants. A
focused UI test covers two leases in different currencies and a not-yet-due
balance. Build, TypeScript, lint, and diff checks pass after this change; the
published report still needs an authenticated multi-lease verification.
Indexation's `none` rounding mode now preserves the unrounded intermediate
monthly calculation but rounds the final receivable cycle total to cents,
matching the `numeric(14,2)` amounts stored by the backend. The lease and
amendment controls call this "No monthly rounding". A regression test covers
a three-month cycle and verifies its expected and outstanding amounts. The
2026-11-05 full local gate passed 399 tests in 83 files, build, TypeScript,
lint, and diff checks. This arithmetic consistency check does not replace
jurisdiction-specific legal review or target-backend verification.

The Lovable deep security scan completed on 2026-10-17 with three findings:
spreadsheet-formula injection in deposit and maintenance CSV exports, and
service-role profile-name overwrite when adding an existing user to a
portfolio. Local fixes now escape formula-leading CSV cells for every report
and update profile names only for newly created users. These findings remain
open on the published revision until that revision is deployed and rescanned.

The same audit still lists nine known dependency issues on the older Lovable
revision (`react-router-dom` 6.30.1 and `recharts` 2.15.4). The local checkout
now uses React Router 7.18.4, and `tailwindcss-animate` is classified as a
build-only dependency. On 2026-10-18, `npm audit --omit=dev` reported zero
advisories. The full audit reports 27 development-dependency advisories,
including two critical findings in Vitest's worker chain and unpatched
Tailwind 3 transitive dependencies. `npm audit fix` failed inside npm 10's
Arborist peer resolution for `lovable-tagger` (`edgesOut` on null); it did not
complete an upgrade. Review those separately and rerun the audit on the exact
release lockfile; neither result applies to the older published Lovable
revision.

Local persistence hardening still requires target-backend rehearsal. The prepared RPCs now make lease creation, assignment edits, closure,
deletion, amendment save/activation, cost allocation, receipt allocation, and
charge reconciliation transactional; the status-history trigger participates
in the same lease transaction. Contractual document status changes and their
lease signature effects also commit together in the new guarded RPCs. None of
those target migrations has passed a restored-backup rehearsal or authenticated
target smoke test. Document file cleanup remains a separate storage request,
but a new deletion outbox records the pending path in the same transaction.
The service cleanup worker is not deployed or scheduled yet, so interrupted
file deletion is still an operational release gate.

On 2026-10-18, `git ls-remote origin HEAD` matched the local June 23 baseline
`b30c4095c3d70e42bca38f0ab21230b790e04a41`. The current application,
migration, test, and runbook changes remain in a heavily modified local `main`
checkout, including nine partially staged files. They are not a reviewed,
committed release revision and have not been pushed or published. A candidate
branch must account for both staged and unstaged changes. The untracked
`README 2.md` and `src/test/deploymentCheck.test 2.ts` are older duplicates,
not candidate artifacts; preserve them locally without including them in a
release commit.
The pending file-deletion migration and worker now reject nested, encoded,
backslash, and traversal-like paths even when their prefix matches the
document folder. The staging path audit executes in an isolated PostgreSQL
test and flags malformed legacy paths for manual review.

On 2026-10-18, a read-only Lovable workspace check showed Property Hub but no
separate Property Hub staging project. The live project's Backups view showed
the latest daily recovery point at 2026-10-17 05:05 UTC and seven changes
ready to publish. A live backup is not an isolated restore rehearsal. No
migration, backup restore, project remix, or publish was initiated during this
check. An isolated staging target and explicit approval for any billable copy
remain necessary before testing the migration chain against actual data.
The 2026-11-04 Backups view shows a daily recovery point at
2026-11-04 05:04:45 UTC. Its presence does not prove that a database export
can be downloaded and restored or that storage files are recoverable.
Lovable's [Remix documentation](https://docs.lovable.dev/features/projects/remix)
states that a remix copies the schema but not database records, secrets, or
the source project's storage objects. Creating a remix alone therefore does
not satisfy the populated-data migration or database-and-storage recovery gate.
The live project's Cloud > Advanced settings exposes a database export that
stores an export in Cloud storage and emails a temporary download link. The
2026-10-18 inspection stopped at its confirmation dialog pending explicit
approval; no export was started. A database export alone does not include
storage files, which must be backed up separately before a restore rehearsal.

On 2026-11-05, the Lovable Cloud SQL editor was checked again using read-only
queries. `supabase_migrations.schema_migrations` still contains 29 versions;
the newest is `20260622145643`, while the local tree contains 83 migration
files. Direct schema checks returned false for the custom document-type table,
`lease_documents.document_type`, `cost_entries.recognition_mode`,
`properties.is_partially_owned`, and `portfolios.receivable_lead_days`.
This confirms that the target is materially behind the local application,
not merely missing migration-history records. No migration or data mutation
was run during this check. The owner declined database export and paid staging,
so populated-data restore rehearsal and production migration remain blocked.
Local indexation billing now preserves the contractual monthly rent until an
indexation is applicable, even when the selected indexation rounding mode is
whole-euro; disabling indexation likewise cannot round the base rent. On
2026-11-05, 32 focused indexation/receivable tests, app TypeScript, and
`git diff --check` passed. These local checks do not validate target billing.
Cost profitability now recognizes an immediate cost entirely in the period
containing its start date even when the cost has a later service end date.
Allocated cost rows retain that service window for charge reconciliation;
only amortized costs are spread over their recognition window in unit and
property profitability. Direct and allocated costs and recoverable amounts
have regression tests. The 2026-11-05 local gate passed 403 tests in 83 files,
`npm run build`, `npm run lint`, app TypeScript, and `git diff --check`.
The corrected figures still require target-backend and browser verification.
The local receivable scheduler now isolates per-lease date and schedule
calculation failures, reports the affected lease ID, and continues with valid
leases. A failed database insert still rejects the job for retry. Eight
focused server-job tests and app TypeScript passed on 2026-11-05; deployment,
monitoring, and a closed-browser run on Lovable remain unverified.
On 2026-11-05, read-only checks against the published
`https://rentflowing.lovable.app` failed both release gates:
`npm run check:deployment -- https://rentflowing.lovable.app b30c4095c3d70e42bca38f0ab21230b790e04a41`
received HTTP 404 for `/release.json`, so the published revision is not
traceable to that commit. `npm run check:production-headers --
https://rentflowing.lovable.app` reported missing or invalid CSP
`frame-ancestors`, `object-src`, `base-uri`, and `script-src`, plus
`X-Frame-Options` and the camera, microphone, geolocation, payment, and USB
permissions policies. The public host is therefore not a verified deployment
of this checkout; no publish or host configuration was changed during the check.
The local `dist/_headers` contains the intended directives, but Lovable's
published host is not serving them. The local `dist/release.json` records the
baseline revision with `dirty: true`, so this build cannot satisfy the clean
release gate. `npm run check:migrations` validated 82 unique local versions.
Occupancy and vacancy calculations now cap an assignment by the lease start,
the lease end, and any earlier actual move-out date. A stale active lease or
longer assignment can no longer make a unit appear occupied after the lease
has ended, or suppress the following month's vacancy loss. On 2026-11-05,
the local gate passed 408 tests in 83 files, `npm run build`, `npm run lint`,
app TypeScript, and `git diff --check`. Target-data and browser verification
remain required before relying on these figures operationally.
Charges reconciliation now uses the lease's persisted unit assignments for
both preview and save, including units added by amendment. It shows the unit
on each cost line and caps the lease cost window at the earlier of contractual
end and actual move-out. The old single-unit path remains only as a fallback
for leases with no assignment rows. On 2026-11-05, 410 tests in 83 files,
`npm run build`, `npm run lint`, app TypeScript, and `git diff --check` passed.
An authenticated multi-unit browser check and target RPC verification remain
open; the available preview currently stops at login.
The reconciliation engine no longer counts a prior `charges-adjustment`
receivable as a new period's collected charges provision. This avoids a
second-period surplus created solely by payment of the earlier adjustment.
The financial-coherence and lease-persistence suites passed locally on
2026-11-05; a two-period payment/reconciliation browser scenario remains
open in `QA_SCENARIOS.md`.
On 2026-11-05, a read-only Lovable query found no cancelled rent, charges,
or charges-adjustment receivables. Local profitability now excludes cancelled
rows from billed and collected rent and charges provisions, while retaining
written-off rent as billed debt. Dashboard, tenant and lease outstanding
summaries now consistently exclude cancelled and written-off balances;
unit next-due also excludes non-allocatable rows. The lease and tenant
aggregate checks use each property's business date. The full local gate
passed 416 tests in 83 files, build, lint, app TypeScript, migration-version
check (83), and `git diff --check`. These behaviors still need authenticated
target-browser verification, especially around disputed and written-off rows.
Another read-only Lovable query found 16 matched, one partially matched, and
four unmatched cash receipts, with no refunded, reversed, or exceptional
receipts. The client now refuses manual and automatic allocation of terminal,
exceptional, invalid, or internally inconsistent receipts even before the
backend migration is deployed. Payment actions and dashboard credit exclude
them, property-archive warnings ignore them, and tenant unapplied credit is
scoped to a requested currency. Tenant detail displays each currency
separately; lease detail includes only credits usable on that lease, excluding
receipts already tied to another lease. Focused tests cover status, currency,
and lease-scope boundaries; the target backend's prepared receipt-allocation guard remains
uninstalled and still requires migration and authenticated verification.

On 2026-11-05, the 120 GBP receipt dated 2026-06-17 with reference `test2`
was checked read-only in Lovable Cloud: it is already `unmatched`, has 120 GBP
unmatched, and has zero receipt allocations. No data change was needed. A
second read-only query found zero cost allocation rows whose parent cost has
no allocation rule. The local database migration
`20261019000000_guard_cost_allocation_result_scope.sql` now rejects allocation
rows on unit-direct or no-rule costs, including direct database writes and
mode changes that leave stale allocation rows. It allows an atomic mode change
that deletes those rows in the same transaction. This migration has passed
the local PostgreSQL transaction test and full ordered migration-chain test;
it has not been applied to Lovable Cloud because the user declined export
and paid staging, so target rollback and verification remain unavailable.
The local gate passed 419 tests in 83 files, `npm run build`, validation of
84 unique migration versions, and `git diff --check`.
The next local migration, `20261019010000_guard_cost_property_links.sql`,
adds same-property references for cost entries and allocation results and
protects manual allocation-rule shares. Read-only target checks found zero
cross-property links in each of those five relationships. Local PostgreSQL
tests cover rejected cross-property writes, historical mismatches, and valid
atomic cost/rule moves. The target migration is deliberately not installed
until backup, restore and release verification are available.
On 2026-11-05, the updated local gate passed 424 tests in 84 files,
`npm run build`, `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`,
`npm run check:migrations` (85 unique versions), and `git diff --check`.

On 2026-11-05, read-only Lovable checks found three EUR cash receipts and
seven EUR receivables attached to GBP property `Résidence du Parc` and lease
`BAIL-PAR-001`. Six paid EUR lease-schedule rows have GBP rows with the same
dates, types, and amounts, but they belong to different units: the EUR rows
refer to `PAR-A01`, while the GBP rows refer to `PAR-P01`. They are not exact
duplicates. The seventh EUR row is a manual repair recharge. The paid EUR
receipts are allocated to EUR rows. Four active cost entries also use a
currency different from their property's currency. A conservative assignment
window audit found 21 lease-schedule rows across multiple leases without an
assignment to their recorded unit overlapping even the due month or stored
cycle end; six are the `BAIL-PAR-001` EUR rows. Investigate these with
`scripts/audit-currency-anomalies.sql` and
`scripts/audit-lease-schedule-unit-windows.sql`. No currency conversion,
deletion, or reallocation was made: the contractual currency, unit history,
and recoverable source entries need a business decision and a restorable
backup.
Local receipt entry now permits the actual receipt currency while same-currency
allocation remains enforced. Unit and property operational-return panels hide
their numeric metrics and show an explicit warning whenever rent, charges, or
recognized costs in the selected period use another currency; they no longer
present mixed sums as one currency. Lease-detail receivable rows display their
own currency and its payment KPIs and footer totals are grouped by currency.
The dashboard overdue-tenant table and lease-list receivables tooltips now use
the same currency grouping. AppContext lease and tenant balance queries return
currency groups instead of a single mixed numeric sum; focused tests cover
EUR/GBP debt and property-local overdue dates.
The updated local gate passed 439 tests in 88 files, `npm run build`,
`npm run lint`, app TypeScript, and `git diff --check`. Authenticated browser
verification of these three financial screens is still pending.
The 120 GBP `test2` receipt was checked again and is already unmatched with
120 GBP unapplied and no allocations. Authenticated target-browser checks,
the cross-currency and assignment-history reconciliation, migration deployment,
and published host verification remain release blockers.
The expanded local audit passed 440 tests in 88 files, `npm run build`,
`npm run lint`, app TypeScript, `npm run check:migrations` (85 unique versions),
and `git diff --check` on 2026-11-05. The 21 assignment-window findings are
read-only observations, not authorization to alter paid receivables.
Unit and property operational-return panels now also suppress their numeric
KPIs for any selected period containing a lease-schedule receivable without a
plausible matching unit assignment. The check uses the full due month for
legacy rows without a stored cycle end, so mid-month assignment starts are
not flagged solely because an invoice is due earlier in that month. A local
calculation test covers that boundary, cancelled and manual rows, and a paid
orphaned schedule row. Authenticated browser confirmation is still pending;
the local preview at a new origin redirects to sign-in without an existing
session.
The subsequent local gate passed 441 tests in 88 files, `npm run build`,
`npm run lint`, app TypeScript, and `git diff --check` on 2026-11-05.
Lease editing now refuses to detach a retained scheduled receivable from the
unit assignment that previously covered its billing period. The pending
`20261018160000_atomic_lease_assignment_edit.sql` migration applies the same
guard in its atomic edit RPC and rejects a newly generated receivable without
a plausible assignment. Already-orphaned historical rows are not silently
rewritten or used to block unrelated edits. This guard deliberately applies
to lease editing, not closure or amendment activation, which have separate
preserve-and-review behavior for allocated future receivables. The pending
migration must still be installed and verified on a backed-up target database.
The local post-guard gate passed 442 tests in 88 files, `npm run build`,
`npm run lint`, app TypeScript, `npm run check:migrations` (85 unique versions),
and `git diff --check` on 2026-11-05. The local preview answered HTTP 200;
an authenticated browser check of the edit error is still pending.
The pending `20261019020000_guard_new_lease_schedule_assignments.sql` migration
adds a database-level check for newly inserted scheduled receivables and
edits to their lease, property, unit, billing window, or currency. It locks a
matching unit assignment and the property while checking the billing window
and property currency, serializing inserts against edits. Payment/status
updates to legacy rows remain possible, and the migration does not scan or
rewrite existing rows. Manual receivables and genuine foreign-currency
receipts or supplier costs remain permitted. Local PostgreSQL tests cover
missing units, out-of-window dates, mid-month starts, wrong-currency rows,
historical payment updates, and authenticated owner writes. Install only after
the target backup/restore and migration sequence are verified; re-run the
financial assignment audit afterward.
The post-migration local gate passed 443 tests in 88 files, `npm run build`,
`npm run lint`, app TypeScript, `npm run check:migrations` (86 unique versions),
and `git diff --check` on 2026-11-05. No target database write was made.
The expanded currency guard passed the same 443-test suite, build, lint,
TypeScript, migration-version and diff checks on 2026-11-05. On the current
lockfile, `npm audit --omit=dev --audit-level=high` reported zero known
production-dependency vulnerabilities. This does not verify the older
published Lovable bundle.

The read-only currency exposure summary on Lovable Cloud found one affected
property, `Résidence du Parc` (configured in GBP). It has four active EUR cost
entries totaling 8,600.07 EUR and four active GBP costs totaling 5,006 GBP.
Its EUR receivables comprise six paid rows totaling 4,500 EUR and one open
row of 180 EUR. Three EUR receipts total 4,700 EUR: two matched receipts
account for 3,000 EUR and one partially matched receipt accounts for 1,500
EUR of its 1,700 EUR. The same property also has four open GBP receivables
totaling 5,100 GBP and 65 overdue GBP receivables totaling 56,850 GBP.
All 65 stored overdue GBP rows have due dates before 2026-11-05. Two of the
four stored open GBP rows are also due before that date; the Payments page and
dashboard derive overdue state from the due date and outstanding amount at
display time, so they include these without relying on the stale stored label.
These are recorded face values, not converted or adjusted for ownership;
they must never be added across currencies. The query is retained in
`scripts/audit-currency-exposure-summary.sql` and tested against the local
migration chain. The EUR entries require source-document and lease-history
review before any correction; no automatic conversion or deletion is safe.

Lease closure now rejects future dates and does not vacate units occupied by
another active lease. Occupancy display no longer falls back to a legacy lease
unit when that unit has ended assignment records. Scheduled amendment retries
are serialized in the browser and failures are surfaced, but deployed activation
still requires an open browser session until the prepared backend scheduler is
deployed and verified; this remains a release blocker.
Lovable Cloud exposes `pg_cron` 1.6.4 and `pg_net` 0.20.3 as available extensions,
but neither was installed on 2026-10-17. A database job or scheduled Edge
Function is technically plausible, not implemented or verified. Do not enable
either extension on the current database before backup and restore testing.
The existing last-owner trigger counts owners without serializing concurrent
deletions and may reject a portfolio's own cascading delete. A replacement
function is prepared locally to lock the parent portfolio before counting and
to allow the cascade once the parent no longer exists. The isolated PostgreSQL
test confirms single-owner delete/demotion refusal, removal when two owners
exist, and a successful portfolio-delete cascade. The simultaneous two-session
race still needs a multi-connection database test.

The property-time-zone lease-closure wrapper now rejects changes to unrelated
lease terms in the same closure request. An authenticated database test verifies
that a request attempting to raise `monthly_rent` while ending a lease fails
atomically and leaves both the rent and lease status unchanged. This protection
is local only until the migration is installed and verified on the target.

Partial-property costs with a normalized millieme rule now use the `general`
shares to determine the owner-managed invoice portion, then the rule's selected
key to distribute that portion among units. A local test with different
`general` and `elevator` shares verifies that allocated unit amounts sum to
the effective property cost. The unit cost explanation shows the general
owned share for normalized rules and the selected-key invoice share for
absolute rules. Target-browser financial reconciliation remains pending.
The 2026-11-05 local gate after this change passed 458 tests in 91 files,
`npm run build`, `npm run lint`, app TypeScript, 87 unique migration versions,
and `git diff --check`.

The property detail cost cards and allocation overview previously included
inactive/stale allocation rows in some totals and formatted every cost in the
property currency. Both now use one active-cost summary grouped by each
entry's currency, including direct unit costs, allocated property costs,
owner burden, and recoverable amounts. Pure tests cover mixed EUR/GBP costs,
cancelled entries with old allocation rows, and partial-ownership allocation
totals. Authenticated browser comparison against target cost data remains open.
The 2026-11-05 local gate passed 461 tests in 92 files, `npm run build`,
`npm run lint`, app TypeScript, 87 unique migration versions, and
`git diff --check` after this overview change.

The unit detail cost section now uses the same active-cost, per-currency
summary for its owner-borne and recoverable totals. Its rows, tooltips and
footer retain each invoice's own currency. This also fixes direct unit costs
with partial recovery, which were previously absent from both summary cards,
and excludes cancelled costs and their stale allocations. A focused test
covers the 40% recoverable direct-cost split; authenticated unit-detail QA is
still required on the target.
The local gate after this unit-detail correction passed 462 tests in 92 files,
`npm run build`, `npm run lint`, app TypeScript, 87 unique migration versions,
and `git diff --check` on 2026-11-05.
An additional rendered-page test now verifies that the allocations overview
places the separate EUR and GBP totals in both property and unit rows while
excluding a cancelled entry's stale allocation. The focused test, app
TypeScript, and diff check pass locally; an authenticated browser comparison
against Lovable Cloud is still required.
A rendered property-detail test now checks the cost cards and unit burden row
with the same mixed-currency and cancelled-allocation fixture. The focused
test, app TypeScript, and lint pass locally; it does not replace target-browser
verification of the deployed UI.
A rendered unit-detail test now checks the visible owner/recoverable amounts for
a partially recoverable EUR charge and an owner-borne GBP tax, including each
row's invoice currency. A cancelled cost's stale unit allocation remains
hidden. The focused test, app TypeScript, and targeted lint pass locally;
authenticated target-browser verification is still pending.
The 2026-11-05 local gate after adding these rendered-page tests passed 465
tests in 95 files, `npm run build`, app TypeScript, targeted lint, and
`git diff --check`. This is local evidence only, not production approval.

On 2026-11-05, the published `https://rentflowing.lovable.app/` returned HTTP
200, but `release.json` returned HTTP 404. The release-marker check therefore
cannot verify that this checkout is deployed. The production-header check also
failed: the published response lacks CSP, `X-Frame-Options`, and the required
`Permissions-Policy` directives. Its HSTS, referrer policy, and
`X-Content-Type-Options` headers were present. These are observed release
failures, not local test gaps; the published host must serve the prepared
artifact and headers before production approval.
On 2026-11-05, a fresh read-only `npm audit --omit=dev --audit-level=high`
against the current lockfile reported zero vulnerabilities across 147
production dependencies. The same day's published-host recheck still failed
`npm run check:production-headers`: CSP `frame-ancestors`, `object-src`,
`base-uri`, and `script-src`, `X-Frame-Options`, and five required
`Permissions-Policy` directives are missing or invalid. The published
`/release.json` still returned HTTP 404. The dependency check is green;
the deployed-host and revision-verification gates remain red.
The HTML CSP fallback is now generated separately for development and
production by Vite. Production HTML allows scripts only from the configured
origin's `/assets/` and `/security/` paths and no longer permits inline
scripts or localhost connections; the development preview keeps the allowances
needed for Vite hot reload. The built `dist/index.html` and the live local
development response were inspected on 2026-11-05, and focused CSP tests pass.
This is defense in depth only: a meta CSP cannot enforce `frame-ancestors`,
and the published host still fails the required HTTP-header gate.
The 2026-11-05 local gate after this CSP change passed 467 tests in 96 files,
`npm run build`, `npm run lint`, Node TypeScript, and `git diff --check`.
The local Vite preview responded with HTTP 200 at
`http://127.0.0.1:8087/`; the production host was not republished.
On 2026-11-05, read-only GET probes to the configured Supabase project returned
HTTP 404 with `NOT_FOUND` / `Requested function was not found` for
`advance-receivables`, and HTTP 404 for `cleanup-lease-document-files`.
The same GET probe to the existing `create-portfolio-user` function returned
HTTP 405, confirming that the endpoint pattern can distinguish a deployed
function from these missing jobs. Neither scheduled function was invoked or
deployed. Automatic lease/amendment/receivable advancement and queued document
file cleanup remain unavailable on the target until the functions and their
monitored schedules are deployed and verified.
A trailing slash on `PUBLIC_APP_ORIGIN` previously made the HTML fallback CSP
point at `//assets/` while the generated HTTP-header policy pointed at
`/assets/`, potentially blocking the app on a custom domain. The CSP origin is
now normalized. On 2026-11-05, a build with
`PUBLIC_APP_ORIGIN=https://rent.example/` produced matching `/assets/` and
`/security/` script sources in `dist/index.html` and `dist/_headers`; the
ordinary default-origin build was then restored. A focused regression test
covers the trailing-slash case. This does not verify any deployed custom
domain.
The in-app replay guard now scrubs scripts nested inside a `DocumentFragment`
before the fragment is inserted, matching the public head guard. A focused
DOM test confirms a replay script is neutralized while a safe sibling remains.
This is local defense in depth; it does not establish that the published host
blocks session replay or serves the missing CSP and anti-framing headers.
The 2026-11-05 local gate after this guard change passed 469 tests in 97 files,
`npm run build`, app TypeScript, `npm run lint`, and `git diff --check`.
The public head replay guard now preserves the standard `replaceChild` return
value when it blocks a replay script. An isolated DOM test covers both that
contract and pre-insertion scrubbing of a `DocumentFragment`; the focused test,
app TypeScript, targeted lint, and production build passed on 2026-11-05.
The built `dist/security/replay-guard.js` was inspected and contains the fix.
This still requires an authenticated check on the published host, whose CSP
headers remain absent.
The new `check:backend-functions` release command probes both scheduled Edge
Function endpoints with GET only and expects the handlers' HTTP 405 response.
Focused tests cover deployed, missing, and invalid-URL cases. Against the
configured Supabase project on 2026-11-05 it failed as intended, reporting
HTTP 404 for both `advance-receivables` and `cleanup-lease-document-files`.
No scheduled POST request or backend write was made.

On 2026-11-07, the Demo cash receipt dated 2026-06-17 with reference `test2`
was verified in the authenticated Payments view after a reload: 120 GBP
received, 120 GBP unmatched, and status `Unmatched`. No allocation or receipt
mutation was needed. The local test suite passed all 473 tests across 99 files
with one worker; a two-worker run timed out in two PGlite tests despite both
passing immediately when rerun alone. The project now uses one test worker for
the repeatable release gate. Read-only target checks still returned HTTP 404
for both scheduled Edge Functions and reported missing production CSP,
`X-Frame-Options`, and `Permissions-Policy` requirements. Production remains
no-go pending deployment and target verification.

On 2026-11-07, read-only queries in the connected Property Hub Lovable Cloud
SQL editor confirmed a mixed backend state: `leases.indexation_enabled` exists,
but `lease_document_types`, `lease_document_file_deletions`, and the
`insert_due_lease_receivables` function do not. The newest recorded
`supabase_migrations.schema_migrations` version is `20260622145643`, despite
the indexation column's presence. Presence checks do not prove complete
migration semantics, and the column/history mismatch must be reconciled before
any push. Lovable's Jobs view said "No scheduled jobs yet". Its Backups view
listed daily snapshots through 2026-11-06 with "Restore to this backup"
actions, but no isolated restore was demonstrated; restoring the live project
would not satisfy the staging rehearsal. The user declined a database export
and any paid staging environment, so no migration or restore was attempted.

On 2026-11-07, the current lockfile passed a fresh `npm audit --omit=dev
--audit-level=high` with zero reported vulnerabilities across 147 production
dependencies. `npm run check:migrations` validated 87 unique local versions.
The published host still failed `npm run check:production-headers`: required
CSP directives, `X-Frame-Options`, and five `Permissions-Policy` directives
were absent or invalid. Read-only GET probes still found both required
scheduled functions unavailable (HTTP 404): `advance-receivables` and
`cleanup-lease-document-files`. These are deployment blockers, not local test
failures; no target writes or deployment were made.
Lovable's published documentation confirms that drafts use the same live
database and files as the main project, so a draft is not an isolated
migration rehearsal. A remix creates a separate backend with schema but no
source records, so it cannot exercise the target's legacy data anomalies.
Daily backup restore replaces the same project's database, not a staging
copy. See https://docs.lovable.dev/features/drafts,
https://docs.lovable.dev/features/projects/remix, and
https://docs.lovable.dev/features/database-backups. With export and paid
staging declined, the current live migration cannot be safely validated on
representative target data; local synthetic migration tests are not a
substitute for that release gate.

On 2026-11-07, a read-only Lovable Cloud query found three leases stored as
`ended` while their contractual end dates remain in the future. Two have
recorded move-outs on 2026-06-11 (`BAIL-PAR-001`, `BAIL-BRU-001`).
`BAIL-PAR-001` and the subsequently signed `BAIL-PAR-003` use the same unit,
but their assignment windows end on 2026-06-11 and start on 2026-07-01,
respectively; there is no unit-date overlap. The local hydration helper had
instead been reopening explicitly ended leases whenever the contractual end
was still future. It now leaves terminal `ended` leases untouched. A third
row, `BAIL-AMS-001`, is `ended` with an `end_reason` of `natural-expiry` before
its contractual end and no actual move-out date. That source-data anomaly
needs business review; it was not rewritten. The lease summary now selects
the historical assignment at actual move-out for a closed lease instead of
inventing a current assignment with the future contractual end date. The
receipt `test2` was also
checked directly in SQL: status `unmatched`, unmatched amount 120 GBP, and zero
allocation rows. No target data was changed.
The corrected local preview shows `BAIL-PAR-001` as `Termine` and the unit
assignment ending 2026-06-11 after reload. It also exposes a separate
source-data mismatch: the lease monthly rent is 1,350 GBP while its sole
recorded assignment has `rent_share=120 GBP` and `charges_share=0`. The UI now
shows the recorded assignment amount rather than masking it with a lease-level
fallback. No contractual value was inferred or rewritten. The local gate
passed 475 tests in 99 files, `npm run build`, `npm run lint`, app TypeScript,
and `git diff --check`. Production remains no-go for the previously listed
backend/deployment blockers and this unresolved financial discrepancy.

Further read-only Lovable Cloud tracing on 2026-11-07 identified the source of
that discrepancy. `BAIL-PAR-001` has only the parking unit `PAR-P01` assigned
at 120 GBP rent, while its applied indexation amendment references legacy unit
`u1` (`PAR-A01`) and raises that unit's share from 1,230 to 1,270. There is no
`PAR-A01` assignment on this lease, although six paid EUR lease-schedule rows
totaling 4,500 EUR and one open manual EUR row of 180 EUR reference it. The
same apartment is assigned to `BAIL-PAR-003` from 2026-07-01. This is missing
historical linkage plus mixed-currency billing, not merely a display mismatch;
no assignment, receivable, or currency was invented or rewritten. A broader
read-only query found six non-draft leases without a main unit assignment:
`BAIL-AMS-001`, `BAIL-BRU-001`, and `BAIL-PAR-001` have only an ancillary
assignment; `HUB`, `REZ`, and `REZ2` have none. The release audit now counts
these cases separately, with detail in `scripts/audit-lease-main-assignments.sql`.
Contract documents and historical payment evidence are required to repair
them safely; the current live backend remains unsuitable for release.
The local lease detail now warns when a non-draft lease has no recorded main
unit assignment, so these incomplete breakdowns are not presented silently.
The authenticated local preview confirmed the warning on `BAIL-PAR-001` and
its absence on `BAIL-PAR-003`, which has a main-unit assignment.

On 2026-11-07, the new manual post-publication workflow was added and its YAML
was parsed locally. Its three read-only checks were run against the published
site and configured backend: `check:deployment` failed because `/release.json`
returned HTTP 404 for expected commit `b30c4095c3d70e42bca38f0ab21230b790e04a41`;
`check:production-headers` failed for CSP `frame-ancestors`, `object-src`,
`base-uri`, and `script-src`, `X-Frame-Options`, and the five required
`Permissions-Policy` directives; `check:backend-functions` found both
`advance-receivables` and `cleanup-lease-document-files` missing (HTTP 404).
The checks did not change the published site or backend. Local focused tests,
build, TypeScript, lint, and diff checks passed after the missing-main-unit
warning. This is an explicit no-go for publishing real data.

The local due-receivables worker now checks that each signed/active lease has a
current main-unit assignment belonging to its property and portfolio before
generating schedule rows. Ancillary-only, expired-main-unit, and cross-property
assignments are reported as incomplete rather than billed as the whole lease.
This guard has not been deployed to the published backend. A separate financial
release blocker remains: `generateLeaseReceivables` emits one whole-lease rent
and charges row per cycle using the first active assignment's `unitId`. For a
valid multi-unit lease, this can attribute the full revenue to one unit in
unit-level returns. A per-unit schedule and reconciliation of existing paid and
open rows are required before multi-unit profitability can be trusted. The
Demo `test2` receipt was previously verified as `unmatched` with 120 GBP
unapplied and no allocation, matching the requested treatment; it was not
modified.
The local scheduler guard passed its targeted tests and the complete gate:
480 tests in 100 files, app TypeScript, lint, build, Deno check of the Edge
function, and `git diff --check`. None of these local checks establishes that
the published backend has been updated.

The 2026-11-07 read-only Lovable Cloud audit found four multi-unit leases.
`BAIL-BER-001` has 72 schedule rows: 40 anchored to storage `BER-K01`, 32 to
apartment `BER-W02`, with each rent row carrying the full 910 EUR lease rent
and each charges row the full 250 EUR lease charges. The current assignment
charges shares sum to only 190 EUR, leaving a 60 EUR monthly discrepancy that
must be resolved from the contract; the application cannot infer its owner.
`BAIL-PAR-003` has 12 whole-lease rows, ten anchored to parking `PAR-P01`
and two to apartment `PAR-A01`; its apartment, studio, and parking shares
otherwise sum to the 2,320 GBP rent and 230 GBP charges. `QA-LEASE-001` has
four rows, including two paid rows that must be preserved. `BAIL-AMS-002`
has two assignments and no schedule rows despite a signed lease beginning
2026-09-01, requiring a separate billing review. The query is preserved at
`scripts/audit-multiunit-receivable-attribution.sql`. These are live data
findings, not a simulated test. No database rows were changed.
The unit-detail operational return now refuses to display a monetary return
when the selected period contains whole-lease schedule rows spanning multiple
assigned units. It explains the number of affected rows instead of treating
the stored `unit_id` as a real unit revenue split. Property-level totals must
also be reviewed for historical duplicate cycles.
This is a visibility guard, not the final per-unit billing implementation.
Focused tests passed, and the authenticated local preview showed the guard on
`PAR-P01` with 12 affected schedule rows. The historical rows and their
allocations remain unchanged.
The complete local gate after this guard passed: 482 tests in 100 files,
app TypeScript, lint, build, and `git diff --check`. The read-only audit SQL
was parsed and executed against a minimal PostgreSQL schema in PGlite.
This does not resolve the multi-unit billing split or the published-backend
deployment blockers; production remains no-go.

The subsequent local profitability change can split a single, stable
whole-lease schedule row for reporting when all unit shares reconcile to the
lease and the cycle amount. It leaves the contractual receivable untouched.
It now rejects single-unit assignments whose share does not cover the lease
amount and repeated whole-lease rows for one cycle. The Lovable Cloud read-only
check found a concrete example of each in Demo: `BAIL-PAR-001` assigns only
120 GBP of its 1,350 GBP monthly rent to `PAR-P01`, and `BAIL-PAR-003` has two
July 2026 rent rows of 2,320 GBP and two charges rows of 230 GBP for the same
cycle, anchored to different units. The local preview hides `PAR-P01`'s
operational return with 20 unallocatable schedule rows in the current-year
view. Historical payments and receivables have not been rewritten. Property
totals can still be inflated by duplicated whole-lease rows, so the source
documents and a verified cleanup are required before production release.
The completed local gate for the attribution change passed: 493 tests in 101
files, app TypeScript, lint, build, and `git diff --check`. The two corrected
June 18 receipts were verified at +50 EUR and +100 EUR, both unmatched, and
the `test2` receipt remains unmatched at 120 GBP with no allocation. No
additional receipt or receivable mutation was needed in this pass.

A further local guard now masks property operational returns when multiple
schedule rows for one lease cycle do not sum to the contractual cycle amount.
It accepts separate per-unit rows when their sum is correct and each row
matches its unit's contractual share; inconsistent per-unit rows remain hidden.
The authenticated Demo preview for `Residence du Parc` showed four affected
July 2026 rows alongside the existing mixed-currency and missing-assignment
warnings. No historical financial rows were changed. The underlying duplicate
rows still require contract-backed cleanup, and the published backend remains
unverified.
The complete local gate after this property guard passed on 2026-11-07:
496 tests in 101 files, app TypeScript, lint, build, and `git diff --check`.
The same-day published recheck still found the release marker returning the
site's 404 page and both required Edge function endpoints returning
`NOT_FOUND` (`advance-receivables` and `cleanup-lease-document-files`). The
local shell could not reach the public endpoint, so these external results
were verified in the browser instead. This is not a production release.

The local profitability cycle matcher now reads applied amendment history.
When a rent-formula amendment restarts billing at its effective date, unit
attribution and property cycle validation use that segment rather than
reconstructing every cycle from the original lease start. Tests cover a
monthly cycle before an April amendment and a six-month April-September cycle
after it, including per-unit rows that sum to the contractual total. Leases
without applied amendments retain the direct calculation path. Historical
receivables were not edited.
The complete local gate for the amendment-aware profitability change passed:
498 tests in 101 files, app TypeScript, lint, build, and `git diff --check`.

The next local fix addresses a source of cross-unit duplicate schedule rows:
receivable generation previously treated `unit_id` as part of the billing
identity even though the generated amount covers the whole lease. An amendment
or assignment change can move the attribution anchor and recreate the same
lease/type/period/due-date row. Client generation, historical backfill and
amendment regeneration now deduplicate by the lease billing slot; migration
`20261107000000_dedupe_lease_billing_slots.sql` applies the same rule to the
database trigger and backend insertion RPC. It does not delete or modify
historical duplicates. The migration and any required data reconciliation
remain undeployed on Lovable Cloud. The Demo `test2` 120 GBP receipt was
rechecked as `unmatched`, with 120 GBP unmatched and zero allocations; no
mutation was necessary.
The complete local gate for this change passed on 2026-11-07: 499 tests in
101 files, app TypeScript, lint, build, 88 unique migration versions, and
`git diff --check`. This is local verification, not deployment approval.

The client-side receivable generator now uses the same applied rent-formula
amendment segment start as the server worker. Previously, after activation it
could regenerate cycles from the original lease start using the new formula.
For the first cycle of an amended segment, a nominal due day before the
effective date is moved to the effective date; later cycles keep the agreed
due day. Original lease schedules retain their prior due-day behavior.
Existing billed cycles crossing the effective date are already blocked by
amendment validation, and protected allocated rows remain for review.
The local gate after this change passed on 2026-11-07: 501 tests in 101 files,
app TypeScript, lint, build, and `git diff --check`. Live backend deployment
and data reconciliation are still outstanding.

Vacancy and theoretical rent now use the actual days in each reporting month,
clipped to the selected reporting period and the unit's available-from date.
Lease assignment windows are combined before counting occupied days, so a
one-day tenancy no longer hides the remainder of a vacant month and overlapping
assignment records cannot double-count occupied days. Property totals sum the
same per-unit basis. This changes historical profitability figures where a
reporting window, availability date, or lease window starts/ends mid-month;
the change should be checked against source leases before publication.
The local gate after this calculation change passed on 2026-11-07: 502 tests
in 101 files, app TypeScript, lint, build, and `git diff --check`.
Follow-up regression coverage preserves the prior unit fallback: when a unit
has no configured base rent, theoretical rent uses its billed rent rather
than the zero returned by day-prorated potential rent. The focused financial
coherence suite now contains 28 passing tests; the full gate above predates
this narrow follow-up and must be rerun before release.
The property theoretical total now uses the same billed-rent fallback for
units without a base rent. A multi-unit lease test verifies that a 900/100
unit attribution sums to 1,000 at property level rather than zero or 2,000.

Release recheck on 2026-11-07: the current local gate passed 503 tests in
101 files, app TypeScript, lint, build, 88 unique migration versions, and
`git diff --check`. The local `dist/release.json` says `dirty: true`, so this
checkout is not a promotable release artifact. In the published Lovable app,
`/release.json` still renders its 404 page. Both backend endpoints,
`advance-receivables` and `cleanup-lease-document-files`, still return
`{"code":"NOT_FOUND","message":"Requested function was not found"}`.
Those are live read-only observations, not a claim about the local build.
Production remains no-go until backend deployment, migration rehearsal with
a recoverable copy, financial data reconciliation, a clean build, and a
published-host verification all pass. The user declined database export and
paid staging, so no live migration was attempted.

Property-level costs now retain the full owner-managed invoice share in both
profitability and the cost overview even when an absolute millieme rule leaves
some managed units unallocated (for example, an occupied-only rule with a
vacant owned unit). The unallocated remainder stays at property level as
owner-borne; it is not attributed to a tenant or invented on a unit. Focused
tests cover immediate and amortized recognition, unit allocation, property
totals, and collected recovery. Historical reports with underallocated rows
may change and require review against the underlying invoice and ownership
shares before publication.
The complete local gate after this correction passed on 2026-11-07: 505 tests
in 101 files, app TypeScript, lint, build, 88 unique migration versions, and
`git diff --check`. No production migration or deployment was attempted.

The read-only financial release audit now includes
`property_cost_overallocated`: it flags active property-level costs whose
stored unit allocations exceed the currently owner-managed share, including
after a property is changed to partial ownership. Use
`scripts/audit-cost-allocation-excess.sql` to identify the cost entry, full
invoice, owner-managed amount, and stored allocated amount. The migration-chain
test proves the check is clear for a fully owned property, detects a stale
allocation after changing to 100/1000 ownership, and clears after the stored
allocation is corrected. No historical allocation is auto-rewritten; a
nonzero target count requires source-data review before publication.
Property profitability also caps each allocated recoverable cost at that
entry's recognized owner-managed amount for the reporting period, so stale
historical rows cannot create negative owner burden. This does not repair the
underlying unit allocations; the audit remains a release blocker. Focused
tests cover both immediate and amortized costs.
The complete 2026-11-07 local gate after these changes passed: 507 tests in
101 files, app TypeScript, lint, production build, 88 unique migration
versions, and `git diff --check`. This is local evidence only; the published
backend and host remain unverified for these changes.

Fresh published-state check on 2026-11-07: the hosted
`https://rentflowing.lovable.app/release.json` still renders the app's 404
page. The authenticated Lovable Cloud Edge functions list for Property Hub
shows only `create-portfolio-user` (active, last updated 2026-06-17); neither
`advance-receivables` nor `cleanup-lease-document-files` appears. The Jobs
view says "No scheduled jobs yet." These are read-only UI observations. A
direct request to the receivables endpoint was not made in this check because
browser safety controls rejected the potentially mutating URL. The absence
in Lovable's own function list is sufficient to keep the release blocked.

The cost allocation overview now detects stored unit allocations that exceed
the owner-managed share of an active property cost. The property-level
owner-borne and recoverable totals stay within that managed share, while the
historical unit rows remain unchanged and an in-app warning identifies that
they need review. The warning appears in the allocation overview and the
affected property and unit detail pages. This is a display safeguard, not a
data repair: a nonzero `property_cost_overallocated` audit still blocks release
until the underlying allocations are reconciled. Focused tests cover the
calculation and overview warning. The complete 2026-11-07 local gate passed:
509 tests in 101 files, app TypeScript, lint, production build, 88 unique
migration versions, and `git diff --check`. This does not verify the published
app or repair any stored excess allocation.

The Lovable Cloud `cash_receipts` table was checked read-only on 2026-11-07:
the 120 GBP receipt dated 2026-06-17 with reference `test2` already has
`status = unmatched` and `unmatched_amount = 120.00`. None of the 30 rows in
`receipt_allocations` references its ID. No further receipt mutation was needed.

The allocation overview warning now lists each affected cost entry, property,
and excess amount. Portfolio writers can open the cost entry directly to
review and recompute its allocations; read-only users see the same diagnostic
without a nonfunctional edit link. The focused overview/calculation suite
passed 9 tests on 2026-11-07. The prior 509-test full gate predates this
interface change; repeat it on the eventual reviewed release commit.

Mid-month rent-formula amendments now use the same first-cycle due-date rule
for profitability attribution as the receivable generator: when the normal
due day falls before the amendment effective date, that first due date is
the effective date. Previously such a valid receivable could be reported as
unattributable, hiding unit and property returns. A generated six-month
cycle beginning 2026-04-15 is covered end-to-end for expected amount and
900/100 unit rent shares; the property and unit profitability test uses the
same mid-month boundary. This fixes recognition only. It does not repair
historical duplicate rows or unreconciled assignment shares on Cloud.
The complete local gate after this fix passed on 2026-11-07: 511 tests in
101 files, lint, production build, 88 unique migration versions, and
`git diff --check`. Published-host and backend verification remain open.

Property profitability now flags a single scheduled rent or charges row when
its amount differs from a reconstructable contractual cycle. Previously only
multi-row cycle totals were checked, so one incorrect row could inflate or
understate a property return without warning. The existing duplicate-cycle
check remains, and legacy rows without enough cycle metadata are not assigned
an invented contractual amount. Focused tests cover both boundaries and the
EN/FR warning now names missing or incorrect billing as well as duplicates.
The complete local gate after this change passed on 2026-11-07: 513 tests
in 101 files, app TypeScript, lint, production build, 88 unique migration
versions, and `git diff --check`. Cloud data and published behavior remain
unverified for this change.

The post-deployment backend check now requires each scheduled Edge Function
to answer a read-only GET with HTTP 200 and `{ "ready": true }`. The handlers
return HTTP 503 when the cron secret, Supabase URL, or service-role key is
missing, without exposing those values or running the POST job. This closes
the old false-positive where an unconfigured handler could pass merely by
returning HTTP 405. The checker rejects old 405 responses, false readiness,
and invalid JSON. Five focused tests pass, and both handlers pass `deno check`
using Deno 2.9.6 on ARM. A ready response still does not prove a scheduled
job exists; Lovable's missing Jobs and absent deployed functions remain
release blockers until published-state verification succeeds.
The `advance-receivables` handler was also started locally without secrets:
GET returned HTTP 503, `{ "ready": false }`, and `Cache-Control: no-store`.
The temporary local server was stopped afterward. No POST job was invoked.
The complete local gate after this readiness change passed on 2026-11-07:
515 tests in 101 files, app TypeScript, lint, Deno checks for all three Edge
Functions, production build, 88 unique migration versions, and
`git diff --check`. It is not evidence that Lovable has deployed the functions,
configured their secrets, scheduled the jobs, or rehearsed the migrations.

The production-dependency audit was rerun against the npm registry on
2026-11-07 with `npm audit --omit=dev --audit-level=high`: it returned
`found 0 vulnerabilities`. This removes the earlier local registry-access
uncertainty for the current lockfile, but CI must repeat the audit on the
reviewed release commit. The current checkout still has 327 dirty paths,
including pre-existing staged, unstaged, and untracked work; no bulk commit
or reset was performed. It is not a traceable release revision.

Fresh read-only published-site checks on 2026-11-07 still fail:
`check:deployment` receives HTTP 404 for `/release.json` when checking local
HEAD `b30c4095c3d70e42bca38f0ab21230b790e04a41`;
`check:production-headers` reports missing or invalid CSP `frame-ancestors`,
`object-src`, `base-uri`, and `script-src`, `X-Frame-Options`, and the camera,
microphone, geolocation, payment, and USB `Permissions-Policy` directives.
No published files or backend data were changed by these GET checks.

Lovable's Security view was inspected read-only on 2026-11-07. Its last scan
was 20 days old and still lists two CSV formula-injection warnings (deposit
and maintenance exports) and one warning that portfolio admins could overwrite
another user's profile name. The local checkout already routes both reports
through `src/lib/exportCsv.ts`, which neutralizes formula-leading cells, and
`create-portfolio-user` no longer writes to `profiles` or accepts names for
an existing account. These local fixes are not yet published: rerun the
Lovable scan after deploying the reviewed revision and confirm all three
findings clear. The Security panel also lists nine known dependency issues
from the old scan; the current local production-dependency audit found zero.
Lovable's visible Domains and Project Settings panels did not expose a
security-header control, so the published header failure remains a host-side
release blocker requiring a supported deployment configuration or host fix.
Lovable's current documentation confirms that its drafts share the project's
real database and files; deleting a draft does not undo test writes. Do not
use a draft as an isolated migration rehearsal or backup substitute:
https://docs.lovable.dev/features/drafts#drafts-share-your-apps-backend-and-data.
The same vendor documents deploying a React/Vite frontend outside Lovable
while retaining its built-in backend:
https://docs.lovable.dev/tips-tricks/external-deployment-hosting.
Cloudflare Pages documents applying `public/_headers` to static responses:
https://developers.cloudflare.com/pages/configuration/headers/.
This is a possible header-compliant route only after a reviewed release,
provider/account setup, correct build origin and auth redirects, and checks
against the final URL. It does not solve the missing backend migrations,
workers, or recoverable-data rehearsal.

The static-host CSP was tightened on 2026-11-07 to allow Supabase images,
HTTPS requests, and realtime WebSockets only at the configured backend origin.
A custom-origin dry build with dummy public settings revealed and then fixed
a missed WebSocket rewrite in `dist/_headers`; both it and the HTML fallback
now name only `ci-placeholder.supabase.co`, not the live project's origin or
the broader `*.supabase.co` wildcard. Two template tests protect the HTTPS
and WebSocket replacements. This does not change the currently published
Lovable response or prove that another host applies `_headers`.
The full local gate after the CSP change passed on 2026-11-07: 518 tests in
102 files, app TypeScript, lint, the custom-origin production build, 88
unique migration versions, and `git diff --check`. The migration suite
applies the chain to a fresh local schema, not to a restored copy of the
Lovable database; the target-data rehearsal remains unverified.

The financial audit previously grouped duplicate scheduled receivables by
`unit_id`, although the 2026-11-07 database guard correctly treats the unit as
an attribution anchor for a whole-lease bill. The audit now groups by lease,
item type, due date, and period without unit, including for mixed-currency
slots. A new read-only detail query identifies each duplicate row and its
receipt-allocation count. The migration-chain test passes with both a paid
EUR/open GBP pair anchored to different units and another cross-unit pair;
it expects two duplicate billing slots. No target rows were deleted or
rewritten. The 518-test full gate predates this audit correction; repeat it
on the eventual reviewed release revision.

Read-only Lovable Cloud SQL audit on 2026-11-07, using the lease-wide billing
slot key (portfolio, lease, item type, period, due date): 48 excess scheduled
receivable rows across 48 duplicate slots; 96 rows participate in those
slots on five leases. Of those 96, 83 are open/overdue with no allocation and
13 are paid or partially paid and linked to a payment. Six slots mix EUR and
GBP. By lease: `BAIL-AMS-001` has 2 duplicate slots (2 protected rows),
`BAIL-BER-001` 32 (0), `BAIL-BRU-001` 6 (5), `BAIL-PAR-001` 6 (6), and
`BAIL-PAR-003` 2 (0). On `BAIL-PAR-001`, six paid EUR rows on `PAR-A01`
with receipt allocations share billing slots with six open GBP rows on
`PAR-P01` without allocations. These are new findings beyond the earlier
74 strictly identical rows that were removed with explicit authorization.
No SQL mutation, export, or deletion was performed in this audit. Reconcile
each slot against its contract and payment history on a recoverable copy;
never remove a paid or receipt-linked row merely to make the count zero.
Lovable Cloud's Backups view listed daily whole-database backups on
2026-11-07, most recently 2026-11-06 05:04 UTC, with a restore action.
This is not an isolated copy of the current database: a restore would replace
later changes and cannot rehearse migrations without affecting the target.
No restore was started. The user declined a full export and a paid isolated
environment, so target-data migration and duplicate repair remain blocked
pending an approved recoverable approach.

On 2026-11-07, the Payments duplicate review was aligned with the lease-wide
billing slot used by schedule generation and the database guard. It now
surfaces same-lease/date/type/period conflicts even when their unit anchors
or currencies differ. Automatic deletion remains limited to otherwise
identical, untouched open rows with the same unit; cross-unit, cross-currency,
paid, or receipt-linked conflicts are shown for manual review with lease,
unit, amount, currency, and status. If only ambiguous slots exist, the
dialog has no deletion action. Two regression tests cover cross-unit and
mixed-currency protected pairs. The 120 GBP `test2` receipt was already
`unmatched` with 120 GBP unapplied and zero allocations, so the user's
requested state required no mutation. Local verification passed: 520 tests
in 102 files, app TypeScript, lint, production build, and `git diff --check`.
This improves diagnosis only; the 48 historical duplicate billing slots
still require contract/payment reconciliation and a recoverable repair path.

The duplicate-removal command previously issued direct browser deletes in
50-row chunks based on an in-memory review. It now calls one portfolio-scoped,
atomic database function that rechecks each row's version, unallocated/open
state, payment links, exact peer identity, and last-copy preservation while
holding the billing-slot and row locks. Missing function or incomplete
acknowledgement is reported as failure. Isolated PostgreSQL tests cover
protected and stale rows, cross-unit/currency cases, role checks, and batch
rollback; repository tests cover RPC payload and failure handling. The
new migration is local only, not installed on Lovable Cloud. Until installed
and verified there, the Payments cleanup action will fail closed.
The complete local gate after this change passed on 2026-11-07: 526 tests
in 103 files, 89 unique migration versions, app TypeScript, lint, production
build, and `git diff --check`. These checks do not validate target data or
prove the migration is present on the published backend.

A separate database deletion guard now rejects direct removal of paid,
partially paid, allocated, or receipt-linked receivables. A nested portfolio
delete remains possible, as does legitimate removal of an unpaid future bill.
The isolated PostgreSQL test covers direct and cascading deletes. The
lease-edit migration test now rolls back its protected paid-row fixture
instead of deleting it. This guard is also local only and requires target
deployment plus an authenticated backend check before real payments.
The guard's cascade exception additionally checks that the parent portfolio
has actually been deleted; a nested trigger deletion while the portfolio
still exists remains blocked. The migration-chain and isolated deletion tests
pass with this narrower condition.

Read-only published-state checks on 2026-11-07 remain red: `/release.json`
returns HTTP 404 at `https://rentflowing.lovable.app`, the host lacks the
required CSP, `X-Frame-Options`, and `Permissions-Policy` directives, and
both `advance-receivables` and `cleanup-lease-document-files` return HTTP 404
on the configured Supabase origin. The initial sandboxed header check could
not reach the network; the subsequent read-only external check produced these
specific HTTP/header results. No deployment or backend data change occurred.
The final local gate after tightening the cascade exception passed on
2026-11-07: 527 tests in 104 files, 90 unique migration versions, app
TypeScript, lint, production build, and `git diff --check`. This is local
evidence only; the published release is still a no-go.

Further local financial/UI audit on 2026-11-07: the profitability warning for
duplicate lease receivable cycles now uses the same lease-wide billing-slot
key as schedule generation and the database duplicate guard. Previously,
different cycle end dates could hide a duplicate from that warning. Amendment
create, comparison, confirmation, and list amounts now use the associated
property's currency rather than a hardcoded EUR; formula durations and
indexation labels use translations. Regression coverage includes a GBP lease
following an EUR property and a duplicate with a different cycle end date.
The complete local gate passed: 531 tests in 105 files, app TypeScript, lint,
production build, and `git diff --check`. No target data or deployed service
was changed. The published release remains a no-go for the reasons above.

The subsequent local display audit corrected lease-detail cash receipts to
show each receipt's recorded currency, and allocation history to show the
receivable currency rather than blindly using the property's currency. Cost
entry prerequisites and rolling-12-month recognition labels are now localized;
the invoice and recognized amounts use the property locale. The scheduler
runbook now requires every migration in filename order, including the newer
billing-slot and paid-receivable guards, rather than stopping at an obsolete
time-zone migration. Focused receipt, cost, and financial-coherence tests
(38), app TypeScript, lint, build, and `git diff --check` pass. A full suite
rerun and authenticated target-browser check are still required on the
reviewed release revision; this local pass is not deployment evidence.

The release verifier now binds `/release.json` to the built HTML entry point
with a SHA-256 digest. Seven deployment-check tests cover a matching page,
stale or absent page, absent digest, revision mismatch, dirty build, insecure
origin, and cross-origin redirects. The local production build's marker
digest matched its generated `dist/index.html`; this build correctly reported
`dirty: true` because the current checkout is not a reviewed release. The
published site still has no working `/release.json`, so this added gate has
not passed against production.

Fresh read-only release checks on 2026-11-07 confirmed the public no-go:
`https://rentflowing.lovable.app/release.json` returns HTTP 404; the published
home page lacks the required CSP `frame-ancestors`, `object-src`, `base-uri`,
and `script-src` policy, `X-Frame-Options`, and five required Permissions-Policy
directives; both scheduled function endpoints on
`https://othaxlwgtqpodncnlglv.supabase.co` return HTTP 404. The production
dependency audit found zero vulnerabilities. The machine's installed Deno was
an incompatible Intel binary, so the official Deno 2.9.6 Apple Silicon archive
was checksum-verified and run from `/tmp`; all three Edge Functions passed
`deno check`. The complete local suite passed (534 tests in 105 files), as did
the 90-version migration check, app TypeScript, lint, and `git diff --check`.
No backend data, migration, function, or published site was changed. These
local checks do not substitute for a restored-copy migration rehearsal,
authenticated browser validation, or the published release gate.

The final fire-and-forget repository write wrappers and their delayed global
error event were removed. No application caller used them; persistence paths
now expose only awaited repository methods that return an error or throw to
the initiating form. A regression test rejects reintroduction of the six
void-returning write methods. The focused repository and lease-persistence
suite passed (111 tests), as did app TypeScript, lint, production build, and
`git diff --check`. This removes a misleading future write path but does not
change the published no-go or repair historical payment data.

The payment write-surface audit found that `authenticated` still had direct
`UPDATE` privilege on receivables despite allocation rows being RPC-only. A
new migration revokes that direct privilege, preventing a browser client from
silently rewriting a paid receivable's balance or status. The isolated SQL
payment test proves direct update denial and successful authorized allocation
through the existing definer wrapper. A separate background schedule path now
shows a destructive error toast and leaves local receivable state unchanged
when persistence returns or throws an error. The full local gate passed:
535 tests in 105 files, 91 unique migrations, app TypeScript, lint, production
build, and `git diff --check`. No target migration or data change occurred.

A follow-up audit of direct receivable deletion found that
`save_lease_with_assignments`, `delete_charges_reconciliation`, and the
`prune_future_closed_lease_receivables` trigger still run with invoker rights;
the latter can fire during a lease status update. Revoking authenticated
`DELETE` on `receivable_items` now would break those legitimate workflows.
Before closing that write surface, introduce portfolio-role-checked wrappers
and test cross-portfolio denial, protected payment rows, and successful
lease/reconciliation/closure transactions after the revoke. Direct insert
likewise remains necessary for client schedule generation and several invoker
RPCs, so it needs a separate transaction-safe migration rather than an
unconditional revoke.

The trailing 12-month profitability period had a leap-day overflow: on
2024-02-29 it started on 2023-03-02 rather than 2023-03-01. The calculation
now clamps the prior-year anniversary before advancing one day. Regression
tests cover the leap day, the following February, and an ordinary date.
The 35 focused profitability tests, app TypeScript, lint, production build,
and `git diff --check` passed. The full-suite result above predates this
date-helper change and must be repeated on the reviewed release revision.

The `test2` cash receipt was checked in the Lovable database on 2026-11-07:
receipt `56c641a0-0c14-4fce-8117-b8ae863434a6` is GBP 120, has GBP 120
unmatched, status `unmatched`, and zero allocation rows. The requested
unallocated state was already persisted, so no database update was made.

The notice-end-date default also had a calendar overflow: one month after
January 31 became March 3 in a non-leap year. `addNoticePeriod` now clamps
month/year additions to the last day of the target month and uses UTC calendar
arithmetic so the ISO date is stable across local time zones. The 23 focused
notice/lifecycle/profitability tests, app TypeScript, and focused lint passed.

The full local gate was repeated after the notice-date fix on 2026-11-07:
541 tests in 107 files, app TypeScript, lint, production build, and
`git diff --check` passed. A fresh read-only Lovable Cloud SQL check found
no nonterminal negative cash receipts and no receipt status/balance mismatch.
The two previously negative EUR receipts dated 2026-06-18 are now +50 and
+100, both unmatched with their entire amounts unapplied and zero allocations.
The 120 GBP `test2` receipt is likewise unmatched and unallocated. No data
mutation was needed. There are zero strictly identical extra schedule rows
when unit, amount, currency, and label are included, but 48 excess rows under
the lease-wide billing-slot key remain. Each sampled slot spans two unit
anchors; some involve payments. The strict-duplicate count does not clear
these lease-wide collisions, and none were deleted. Target migration rehearsal,
deployment, and payment/contract reconciliation remain open release blockers.

A further read-only Lovable Cloud check on 2026-11-07 found zero receivable
arithmetic mismatches, zero positive-receipt allocation drift, and zero open
lease-schedule rows after a closed lease's end. Six lease-wide billing slots
still mix currencies. The full `scripts/audit-financial-consistency.sql` cannot
yet run on that backend: `properties.time_zone` is absent (`42703`), confirming
the property business-time-zone migration has not been installed there. These
subset results do not constitute a complete target financial audit. No schema
or data was changed during these checks.

The local receivable DELETE surface is now narrowed by
`20261107040000_restrict_direct_receivable_deletes.sql`: authenticated and
anonymous direct deletion of receivables and charges reconciliations is
revoked. Role-checked definer wrappers preserve lease edits and reconciliation
deletion; the lease-closure trigger retains its internal ability to remove
only unpaid future schedule rows. The frontend calls the new wrappers and
fails closed when they are absent. Local SQL tests exercise direct denial,
viewer/cross-portfolio denial, an owner replacing an unpaid bill through a
lease edit, deletion of a reconciliation together with its adjustment bill,
and authenticated lease closure with paid-row preservation. The complete
local gate after this change passed on 2026-11-07: 542 tests in 107 files,
92 unique migration versions, app TypeScript, lint, production build, and
`git diff --check`. The migration has **not** been applied to Lovable Cloud;
target-data rehearsal and authenticated target checks remain required before
deploying this frontend. Direct receivable INSERT remains a separate security
gap and is not covered by this DELETE migration.

`20261107050000_restrict_direct_receivable_inserts.sql` closes the remaining
direct receivable INSERT permission for authenticated clients. Two
portfolio-role-checked wrappers retain atomic lease and charges reconciliation
creation. Routine due-cycle generation is now server-owned; opening a page no
longer tries to create bills. The SQL integration test proves direct INSERT
and viewer denial as well as successful owner creation of a lease schedule row
and a charges adjustment row after the revoke. **Do not deploy this frontend
or migration before the scheduled `advance-receivables` job is deployed and
verified**: later billing cycles would otherwise be missed. No target database
or published site changed in this local work.
The local gate for this revision passed on 2026-11-07: 541 tests in 107 files,
93 unique migration versions, app TypeScript, lint, production build, and
`git diff --check`. These checks do not verify the absent production job or
the target database migration; the release remains blocked.

The scheduled-job release probe now requires a success timestamp within three
hours, not just a deployed handler and configured secrets. Each worker records
that timestamp only after a complete HTTP 200 run, in the service-only
`scheduled_job_health` table added by
`20261107060000_scheduled_job_health.sql`. A missing table, no successful run,
or a stalled worker fails the read-only probe. This is still not proof of the
next Cron dispatch; inspect Cron configuration and history separately. On
2026-11-07, read-only browser probes of both Lovable backend function URLs
returned `{"code":"NOT_FOUND","message":"Requested function was not found"}`;
the published app's `/release.json` still rendered its 404 page. The local
Node-based backend check could not reach the network from this workspace, so
these browser observations are the current external evidence. No live POST or
database write was made.
The local gate for the job-health change passed on 2026-11-07: 543 tests in
108 files, 94 unique migration versions, Edge Function `deno check` using the
ARM-compatible Deno 2.9.6 binary, app TypeScript, lint, production build, and
`git diff --check`. The default `/usr/local/bin/deno` is an incompatible Intel
binary on this machine; the verified ARM binary under `/tmp` was used. These
local passes do not waive the restored-copy rehearsal, target migration,
actual Cron dispatch, authenticated smoke tests, or published release gates.

Direct `INSERT` and `UPDATE` on `charges_reconciliations` are now revoked from
authenticated clients by `20261107070000_restrict_direct_reconciliation_writes.sql`.
The existing scoped creation/deletion RPCs remain the only interactive write
paths. Local migration-chain tests prove an owner can create a reconciliation
with its adjustment receivable, while direct owner table writes are denied.
This migration is local only; target deployment and verification remain open.

`20261107080000_restrict_direct_cost_allocation_writes.sql` prevents a browser
client from changing a cost entry independently of its unit allocations. The
frontend now calls a portfolio-role-checked transaction wrapper, and the old
RPC plus direct table writes are unavailable to authenticated users. Local
SQL tests prove owner creation, allocation replacement on edit, direct-write
denial, viewer denial, and cost-delete cascade. This migration is not applied
to the Lovable backend.

`20261107090000_restrict_direct_allocation_rule_writes.sql` similarly closes
direct rule and manual-share mutations. The frontend uses a role-checked
transaction wrapper; local SQL tests cover owner create/edit, complete share
replacement, viewer and direct-write denial, and deletion cascade. The target
backend still needs this migration and authenticated verification.
The complete local gate after the three financial write-surface changes passed
on 2026-11-07: 545 tests in 108 files, 97 unique migration versions, app
TypeScript, lint, production build, and `git diff --check`. These results prove
the fresh-schema permission paths and repository calls, not compatibility
with the current Lovable schema or its historical data. None of the three
migrations was applied to the live backend.

`20261107100000_validate_cost_allocation_splits.sql` fixes an accounting
write failure for informational cost entries. Their unit allocation retains
the invoice share, while recoverable and owner-borne amounts are both zero;
the previous database function incorrectly required those zero splits to sum
to the allocated share. The same atomic save now rejects a non-positive invoice,
negative allocation components, a recovery-type mismatch, and a sum of unit
allocations above the invoice. The migration-chain test covers a successful
informational save and rejection of an inflated allocation. This migration is
local only. It does not replace the target-data rehearsal or prove that every
partial-ownership allocation matches the configured rule exactly.
The full local gate after this fix passed on 2026-11-07: 545 tests in 108 files,
98 unique migration versions, app TypeScript, lint, production build, and
`git diff --check`. The informational-cost save was also exercised through the
authenticated database wrapper. No target migration or data change occurred.

Profitability now follows the informational recovery split as well: a cost
entry marked `informational` remains visible as an invoice but contributes
neither owner-borne nor tenant-recoverable recognized cost to unit/property
returns, whether direct or allocated. Previously the cost summaries counted
the full invoice as an actual cost and the recovery summaries attributed it
to the owner despite both stored split amounts being zero. Direct and allocated
regression tests cover both levels. The local gate after this calculation fix
passed on 2026-11-07: 547 tests in 108 files, app TypeScript, lint, production
build, and `git diff --check`. This does not validate historical target data
or deployed reports.

The cost overview also kept the unallocated part of an informational invoice
in its owner-borne column on a partially owned property. It now leaves that
column at zero while retaining the owner-managed invoice amount in the cost
total. Tests cover both an ordinary partial allocation and an excessive stale
allocation. The atomic cost-save migration was further tightened: recovery
splits must match the cost's recovery mode and configured partial percentage;
unit allocations cannot exceed the owner-managed invoice share (using the
selected millieme key for absolute millieme rules). The migration-chain test
exercises inflated allocations, forged recovery splits, partial-ownership
limits, and a valid informational save. The local gate after these changes
passed on 2026-11-07: 549 tests in 108 files, 98 unique migration versions,
app TypeScript, lint, production build, and `git diff --check`. None of these
changes has been deployed to or verified against the Lovable backend.

Scheduled lease receivables previously used the first active assignment as
their unit anchor. Database row order could therefore attribute an entire
lease's rent and charges to a parking or storage unit even while a main unit
was leased. The shared generator now selects a main-unit assignment for each
cycle using a stable order; lease creation, historical paid backfill, amendment
activation, lease editing, and the scheduled backend job all pass unit types.
`20261107110000_guard_schedule_main_unit.sql` also rejects newly written
lease-schedule rows anchored to an ancillary unit while permitting ordinary
updates to existing historical rows. Tests cover ancillary-first ordering in
the scheduled job and adapter, historical backfill, database rejection, and a
legacy-row update. The local gate passed on 2026-11-07: 552 tests in 108 files,
99 unique migration versions, app TypeScript, lint, production build, Edge
Function Deno check, and `git diff --check`. The migration and scheduled job
are still not deployed or verified on Lovable Cloud.

A further read-only Lovable Cloud audit on 2026-11-07 counted 164 historical
lease-schedule rows anchored to parking/storage, all with zero receipt
allocations: 114 have no main-unit assignment overlapping their billing month,
40 have one, and ten have two. The 114 belong to `BAIL-PAR-001` (56),
`BAIL-BRU-001` (50), and `BAIL-AMS-001` (8). These three ended leases have
recorded unit rents/charges below their lease totals, so the missing main-unit
linkage cannot be reconstructed from the available records. The 40 belong to
`BAIL-BER-001`; the ten with two main candidates belong to `BAIL-PAR-003`.
No row was reassigned or deleted. The repeatable read-only query is
`scripts/audit-receivable-unit-anchors.sql`. A recoverable data rehearsal and
contractual review are required before correcting historical attribution.

The local scheduled worker now rejects a lease if any due billing cycle lacks
an eligible main-unit assignment. Previously it could skip an early cycle and
silently insert later cycles once a main unit had been added. Lease form
validation blocks both an initial gap and any later break in main-unit
coverage, while accepting consecutive main-unit assignments. Lease creation,
editing, and amendment activation also refuse incomplete regenerated
schedules; the paid-receivable orphan warning retains priority on edits.
Focused tests cover these paths. The final local gate passed 559 tests in 109
files, app TypeScript, lint, production build, and `git diff --check`.
The three Edge Functions passed `deno check` on 2026-11-07 with the same
Deno 2.9.6 release used by CI. The official macOS ARM archive was downloaded
to a temporary directory and its SHA-256 matched the release checksum
(`213a2f304f04d3c9cb5220669afad138f60a5aab1fe80962abdeb8f35807a472`).
The system-wide Deno binary remains incompatible with this ARM host; the
verified temporary executable was used without changing that installation.
Target deployment and a backend smoke test are still required. None of these
local changes has been deployed to Lovable Cloud.

Follow-up release checks on 2026-11-07: the exact CI Deno 2.9.6 version
successfully checked all three Edge Functions after SHA-256 verification of
the temporary ARM binary. `npm audit --omit=dev --audit-level=high` reported
zero vulnerabilities in production dependencies. The read-only published-site
checks still fail: `/release.json` returns HTTP 404; the production-header
check reports missing CSP `frame-ancestors`, `object-src`, `base-uri`, and
`script-src`, `X-Frame-Options`, and the camera/microphone/geolocation/payment/
usb `Permissions-Policy` directives; the backend readiness endpoints for
`advance-receivables` and `cleanup-lease-document-files` both return HTTP 404.
These results are evidence of a deployment no-go, not of a completed release.

Cost entry persistence follow-up on 2026-11-07: creating or editing a cost
now rejects a missing allocation rule, a rule owned by another property, or
missing property settings before any database write. The former behavior
could save an entry successfully while silently producing no allocation rows.
The form remains open with a localized error. Add/update regression tests
cover all three cases. The full local gate passed 562 tests in 109 files,
app TypeScript, lint, production build, and `git diff --check`; after the
error messages were localized, the 79 focused persistence tests and app
TypeScript passed again. The Demo `test2` receipt remains correctly
unmatched: GBP 120 unapplied and no allocations, so no data edit was needed.

Financial recognition follow-up on 2026-11-07: a property return is now withheld
when a scheduled rent/charges row lacks cycle metadata needed to reconcile it
with the lease. Previously a single such row bypassed the cycle check and
could leave an unverified property return visible. The warning now covers both
unverifiable and mismatched cycles. The read-only financial audit includes a
`lease_schedule_missing_cycle_metadata` count. On the Lovable Cloud target it
found 30 rows across `BAIL-AMS-001`, `BAIL-BRU-001`, `BAIL-BRU-003`,
`BAIL-LON-001`, and `BAIL-PAR-001` (six each). All 30 lack `cycle_end_date`,
none lacks `period_month`, and 25 have a positive allocated amount. No live
row was changed; payment-linked billing history requires a recoverable
rehearsal and contractual review before repair. The complete local gate after
this change passed 562 tests in 109 files, build, app TypeScript, lint, and
`git diff --check`. Fresh public checks still found `/release.json` as 404
and both required scheduled Edge Functions as `NOT_FOUND`, so this is not a
production release.

Reporting follow-up on 2026-11-07: Rent Roll now uses the current indexed
monthly rent and excludes analytical charges from all-inclusive lease totals.
Occupancy now distributes indexed rent across units only when the active
assignment shares reconcile with the lease's base rent; inconsistent or
missing shares display no fabricated unit amount. The full local gate passed
566 tests in 109 files, production build, app TypeScript, lint, and
`git diff --check`. No Lovable Cloud data was changed. The Demo `test2`
receipt was already unmatched with GBP 120 unapplied and no allocations.

Overdue reporting follow-up on 2026-11-07: the report now uses the same
outstanding-receivable rule as the dashboard and tenant detail. Cancelled and
written-off rows with stale positive balances no longer inflate overdue or
outstanding totals. A report-level regression test checks both totals while
retaining genuinely due and upcoming balances. The complete local gate passed
567 tests in 109 files, production build, app TypeScript, lint, and
`git diff --check`. No Lovable Cloud data or deployment changed. The published
release marker, security headers, scheduled jobs, and target-data rehearsal
remain unresolved release blockers.

Deployment binding follow-up on 2026-11-07: the build now stamps the Supabase
origin used by the frontend into `/release.json`. The manual deployment gate
requires that origin to match the backend whose scheduled jobs are checked;
CI also verifies the stamp. Regression tests reject a different or absent
backend origin and an insecure backend URL. The local build emitted the
configured origin and correctly reported `dirty: true` for this uncommitted
worktree. The full local gate passed 569 tests in 109 files, production build,
app TypeScript, lint, and `git diff --check`. In a fresh read-only browser
check, the published `/release.json` still showed the app's 404 page, and
`advance-receivables` returned `NOT_FOUND`. The direct GET probe of
`cleanup-lease-document-files` was rejected by the safety reviewer because a
different deployed handler could delete files on invocation; it was not
retried or bypassed. Local source restricts deletion to an authenticated
POST, but this does not prove the deployed implementation. Confirm its
deployment via non-invoking metadata before attempting a live health probe.

Runtime asset verification follow-up on 2026-11-07: Vite now emits its build
manifest, and `/release.json` records SHA-256 digests for every manifest file,
CSS/asset reference, and the replay guard. The published-release check fetches
and verifies every stamped file with bounded concurrency; a missing, stale, or
redirected lazy-loaded page fails the release gate rather than leaving a
green HTML-only result. The local build stamped all 105 manifest runtime
paths, excluding unrelated residual files from `dist`. CI checks local asset
digests, and deployment tests cover missing and altered files. The complete
local gate passed 571 tests in 109 files, production build, app TypeScript,
lint, and `git diff --check`. None of this deploys the missing Lovable marker
or scheduled functions; the release remains blocked.

Reports localization follow-up on 2026-11-07: all six report views now use
the selected EN/FR language for visible labels, filters, status/type values,
empty states, KPI captions, and CSV headers. Tests exercise the French tabs
and exports, while existing maintenance-age and overdue-attribution tests now
assert the translated interface without changing their financial checks. The
complete local gate passed 572 tests in 109 files, production build, app
TypeScript, lint, and unstaged/staged `git diff --check`; the Impeccable UI
detector reported no findings for the changed report files. A fresh local
preview is running at `http://127.0.0.1:8083/`, but visual inspection of the
authenticated reports remains unverified. Read-only Lovable SQL confirmed
that the 2026-06-17 `test2` GBP 120 receipt is unmatched with GBP 120 unapplied
and no allocations, and the two 2026-06-18 EUR receipts are already +50 and
+100 with their full balances unmatched. No live data mutation was needed.
Deployment and backend release blockers described above remain open.

Non-invoking scheduled-job gate follow-up on 2026-11-07: the manual deployment
workflow now checks Supabase function metadata and the service-only job-health
table via the Management API's read-only SQL route. It no longer sends GET to
an unverified deployed Edge Function, which could have different behavior from
the local source. The gate requires active functions, `verify_jwt = false`, and
success timestamps within three hours; it fails if its scoped management
token or either evidence source is missing. The target Lovable SQL editor was
queried read-only: both `public.scheduled_job_health` and `cron.job` resolved
to NULL, and `pg_catalog.pg_extension` contained no `pg_cron` row. The target
therefore has neither the job-health migration nor a configured database Cron
extension. No migration, job, or deployed function was invoked. Management API
access and the target deployment remain prerequisites to exercising the new
gate against the actual backend. The complete local gate passed 575 tests in
109 files, production build, app TypeScript, lint, and staged/unstaged
`git diff --check`.

Additional read-only Lovable Cloud financial triage on 2026-11-07: payment
arithmetic, positive receipt balance range, nonpositive active receipts,
allocation drift, and allocation currency checks all returned zero. The
lease-wide schedule key still has 48 duplicate slots (48 excess rows); every
slot spans two unit anchors, 13 contain a paid/allocated row with a linked
receipt, and six mix currencies. None of those 13 linked slots is eligible for
an unattended deletion. Thirty active rent/charges schedule rows lack
`period_month` or `cycle_end_date`; 28 of them have receipt allocations. The
seven receivable and three receipt/property currency mismatches are all EUR
rows under the property `Résidence du Parc`, which currently has GBP as its
currency; six of the seven receivables and all three receipts are paid or
allocated. These require source-document and property-currency review before
any data repair. The 2026-06-17 `test2` GBP 120 receipt was rechecked by ID:
status `unmatched`, unmatched amount GBP 120, and zero allocations, so the
requested "non affecté" state is already present. No live row was changed.

Property-currency follow-up on 2026-11-07: the editable property currency could
relabel existing unit prices and financial rows without conversion. Both
property edit dialogs now lock the field after any units, leases, receivables,
receipts, or costs exist; changing country in the property list no longer
silently changes that locked currency. Migration
`20261107120000_guard_property_currency_after_use.sql` enforces the same rule
for direct database updates and RPC saves. A PGlite test exercises each related
table and confirms empty properties remain editable. The migration is local
only and does not repair the existing EUR/GBP mismatch at `Résidence du Parc`.
That historical discrepancy must be reviewed against source documents and
rehearsed recoverably before a live correction.
The complete local gate for this follow-up passed 576 tests in 110 files,
production build, app TypeScript, lint, 100 unique migration versions, and
`git diff --check`. The existing migration-chain test now asserts that a
used property's currency change is rejected while updates to historical
payment notes still work. No target database migration or data change was
performed.

Read-only follow-up on repeated billing slots: historical per-unit split bills
are supported by the attribution code, so a repeated lease/date/type key is a
review signal rather than automatic deletion authority. The target has 48
repeated active slots. In 23 monthly rent and 23 monthly charges slots, the
sum of the two rows exceeds the lease's *current* monthly amount; this is
strong overbilling evidence but current terms alone do not prove the amount
that applied historically. Two further slots belong to a longer-formula lease
and require amendment/indexation review. Thirteen slots include a linked
payment. The read-only detail query now prints slot totals, unit/currency
counts, and row versions to support a recoverable, document-backed repair.
The query passed a PGlite test covering mixed currencies, linked payment,
and combined billed/allocated/outstanding amounts. No target rows were changed.

Target-data deployment gate follow-up on 2026-11-07: `check:target-data` now
runs the complete 28-check financial SQL audit through the Supabase Management
API read-only query route. It rejects missing credentials, missing schema,
partial/duplicate/invalid results, and every nonzero count. The manual
deployment workflow includes this check after the published-site, security
header, and scheduled-function checks. Tests cover all failure paths, and the
full migration-chain test verifies that the SQL emits exactly the expected
check names. This adds a fail-closed release gate; it does not make the current
Lovable target green. The previously observed schedule, currency, and cycle
anomalies will keep it red until reviewed and repaired.
The local verification after this gate change passed 581 tests in 112 files,
production build, app TypeScript, lint, 100 unique migration versions, YAML
workflow parsing, and `git diff --check`. The read-only target query was not
executed through the Management API because its scoped token is not configured;
the earlier Lovable SQL-editor observations already contradict a green result.

Read-only migration-history follow-up on 2026-11-07: the Lovable SQL editor
reports 29 installed migration versions, from `20260610113735` through
`20260622145643`, and no versions from October onward. This checkout has 100
unique local migration versions, including November's property-currency guard.
The target is therefore materially behind the release; applying this checkout
or running data-changing repairs there remains blocked by the user's explicit
no-export/no-fee constraint and the lack of a recoverable rehearsal. The manual
deployment workflow now compares every target migration version with the
checkout through a read-only Management API query and fails on missing,
unexpected, repeated, or malformed versions. This gate has not been exercised
against the Lovable backend through the Management API because its scoped token
is not configured. No target migration or data mutation was performed.
The local gate passed 585 tests in 113 files, production build, app TypeScript,
lint, 100 unique local migration versions, deployment workflow YAML parsing,
and `git diff --check`.

Scheduled-function gate follow-up on 2026-11-07: recent success timestamps
alone do not prove that the next run is configured. The read-only backend check
now also requires an active `cron.job` entry targeting each required function.
It does not invoke the functions or expose Cron command text. The known Lovable
target has no `pg_cron` extension, so this stricter gate is expected to fail
there until scheduling is deployed and verified. Tests cover absent, inactive,
malformed, and unavailable Cron metadata; no target job was changed.
The local gate passed 587 tests in 113 files, production build, app TypeScript,
lint, and `git diff --check`.

Published-site recheck on 2026-11-07: a read-only HTTPS request to
`https://rentflowing.lovable.app/` still fails `check:production-headers`.
The response lacks the required CSP `frame-ancestors`, `object-src`, `base-uri`,
and `script-src` directives, `X-Frame-Options`, and the five restricted
Permissions-Policy features. `https://rentflowing.lovable.app/release.json`
returns HTTP 404, so the deployed revision and asset digests cannot be
verified. No site or backend changes were made. A local Supabase runtime
rehearsal is unavailable on this workstation because the Supabase CLI is
installed but Docker/Podman and a standalone PostgreSQL server are not.
The PGlite migration tests remain useful but cannot substitute for a
restored Lovable database-and-storage rehearsal.
The current lockfile also passed `npm audit --omit=dev --audit-level=high`
with zero reported vulnerabilities on 2026-11-07. This is a dependency
snapshot, not a substitute for deployment and runtime verification.

Anonymous API probe on 2026-11-07: the configured Supabase origin returned
HTTP 200 with zero rows for `properties`, `units`, `leases`, `receivable_items`,
`cash_receipts`, and `lease_documents` when queried with only the publishable
key and no user session. The requests selected IDs with a one-row limit and
did not return record contents in the probe output. This supports anonymous
read isolation for those six table queries only; it does not prove write
denial, storage privacy, or cross-portfolio RLS under authenticated roles.
No target row was changed.
The `lease-documents` Storage list endpoint likewise returned HTTP 200 with
zero objects for an anonymous one-object listing request. This does not prove
that the bucket contains files or that a known private path cannot be
downloaded anonymously; those checks still require a controlled fixture and
authenticated role tests.
Local browser smoke on 2026-11-07: with no session, opening `/leases` in the
development preview at `http://127.0.0.1:8084/` redirected to `/login` and
showed the sign-in form. This confirms only that client-side route guard in
that preview. Authenticated role, storage, and end-to-end workflows remain
unverified against the target. The local `deno check` could not run because
the installed `/usr/local/bin/deno` is x86_64 while this machine is arm64;
the Linux CI workflow retains the Deno type-check step. GitHub CLI access
also reports an invalid local token, so hosted CI status was not inspected.

Scheduled-function surface follow-up on 2026-11-07: both service-role Edge
Functions previously accepted unauthenticated GET and performed a privileged
health-table read to disclose a timestamp. That path is now removed; non-POST
requests return 405 before privileged client creation. Both POST paths still
require their shared secret check before using service-role credentials. The
shared secret helper has unit tests for exact, missing, short, and incorrect
values; a regression test asserts the method and secret gates precede the
privileged client in both functions. Deno 2.9.6 arm64 type-check passed for
all three Edge Functions. These changes are local only and must be deployed
before they protect the Lovable target.
The complete local gate passed 591 tests in 114 files, production build,
app TypeScript, lint, the Deno 2.9.6 Edge Function check, and
`git diff --check`.

Scheduler secret follow-up on 2026-11-07: both privileged job handlers now
refuse to run with a missing or configured secret shorter than 32 characters,
returning HTTP 503 before service-role client creation. A wrong supplied
secret still returns HTTP 401. The shared helper has boundary tests at 31 and
32 characters, and all three Edge Functions pass the Deno type check.
This rule is local only until the handlers are deployed with a matching
32+ character secret in both Edge secrets and the scheduler.

Lovable Auth configuration follow-up on 2026-11-07: `Auto-confirm email` was
disabled in the project's Users > Settings > Auth > Email panel and persisted
after reopening it. A separate read-only request to the configured Supabase
Auth settings endpoint returned HTTP 200 with `mailer_autoconfirm: false`.
The Lovable minimum password length was raised from 6 to 8 and remained 8
after reopening the panel, matching the frontend signup requirement. The
Auth site URL remains `https://rentflowing.lovable.app`; its redirect list
includes that origin. Confirmation-mail delivery, password-reset email, and
the full signup/invitation redirect flow are not yet verified. No account,
password, portfolio membership, or business row was changed.
The deployment workflow now checks `mailer_autoconfirm` through the public
Supabase Auth settings endpoint with the supplied publishable key and fails
closed if the response is missing or incorrect. Its three unit tests pass,
and the same read-only check passed against the configured Lovable project on
2026-11-07. This does not prove that a confirmation email is delivered or
that the redirect completes successfully.
The full local gate after this change passed 594 tests in 115 files,
production build, app TypeScript, lint, deployment workflow YAML parsing,
and `git diff --check`.

Email-confirmation lifecycle follow-up on 2026-11-07: the existing signup
trigger created a starter portfolio at `auth.users` insertion, even while
`email_confirmed_at` was null. The new local migration
`20261107130000_defer_new_user_portfolio_until_verified.sql` now creates a
profile at insertion but waits for confirmed email before creating a starter
portfolio. On confirmation it reuses an existing default, legacy-created
portfolio, or invitation membership instead of duplicating it. The migration
chain tests cover unconfirmed, legacy, invited, and confirmed-at-insert users.
The trigger now also recognizes an unaccepted, unexpired invitation for the
confirmed email from an authorized inviter, so an invitee does not receive an
unwanted starter portfolio before joining. A separate membership trigger sets
the first joined portfolio as the profile default without replacing an
existing choice. The migration-chain test exercises confirmation, invitation
acceptance, and a later second membership end to end.
These migrations are **not installed on the Lovable target**, so the live service
can still create portfolios for unconfirmed signups. Do not treat the Auth
toggle alone as completion of the signup release check. The target requires a
rehearsed, recoverable migration deployment followed by actual email-delivery,
confirmation-link, and invitation tests.

The Demo `test2` receipt was checked again in the Lovable `cash_receipts`
table after the user's instruction to leave it unallocated. It already has
`amount_received = 120 GBP`, `unmatched_amount = 120 GBP`, and status
`unmatched`; the prior allocation audit found no linked allocation. No data
change was needed.
After this migration, the complete local gate passed 595 tests in 115 files,
production build, app TypeScript, lint, 101 unique migration versions, and
`git diff --check` on 2026-11-07. These are local checks only, not a Lovable
deployment or an authenticated end-to-end production check.

The read-only Auth release gate now also requires email sign-in and public
signup to be enabled, in addition to requiring email confirmation. On
2026-11-07 the Lovable public Auth settings endpoint returned `external.email:
true`, `disable_signup: false`, and `mailer_autoconfirm: false`; the strengthened
gate passed against it. This checks configuration, not mail delivery or the
deployed signup database trigger. Public signup was subsequently disabled
while the target remains on its older migration set; this historical passing
result is no longer the target's current launch state.
The complete local gate after this change passed 596 tests in 115 files,
production build, app TypeScript, lint, and `git diff --check` on 2026-11-07.

Password-change hardening on 2026-11-07: the local Profile form now
collects the current password and sends it with the new password; the recovery
flow continues to call the Auth API without a current password. Focused tests
cover the form payload and the distinction between profile and recovery calls.
The Lovable Auth Email setting was briefly enabled, then returned to **off**
and verified after reopening the panel. The published frontend has the older
Profile form, so enforcing the setting now would break password changes.
Publish the new form first, enable the setting, then run both live checks.
An actual signed-in change and emailed recovery flow were not run because no
account password or recovery email was authorized for use. Publish the form
and verify both flows before claiming this release check complete.
The full local gate after this change passed 598 tests in 116 files, the
production build, app TypeScript, lint, and `git diff --check` on 2026-11-07.

Recovery-route follow-up on 2026-11-07: the local `/reset-password` form now
opens only after a `PASSWORD_RECOVERY` Auth event; a signed-in user visiting
the route directly sees a request-new-link action. Recovery intent survives a
same-tab refresh for up to an hour and is cleared on sign-in, sign-out, user
update, or successful reset. Focused tests cover the direct route, event,
refresh, and reset. This is a UI safety measure, not a security boundary:
the target Auth requirement for the current password remains off until the
matching Profile form is published. Real emailed recovery and signed-in
password-change tests still need an authorized test account.
The full local gate passed 602 tests in 117 files, production build, app
TypeScript, lint, and `git diff --check`. A direct browser visit to
`http://127.0.0.1:8082/reset-password` showed "Recovery link required" and a
"Request a new link" action, with no password input. That browser check does
not prove the emailed recovery callback works on the deployed site.

Lovable staging-options check on 2026-11-07: [Lovable drafts](https://docs.lovable.dev/features/drafts)
use the main project's actual backend and data; deleting a draft does not undo
data changes. A draft is therefore not a migration rehearsal environment.
[Remixing](https://docs.lovable.dev/features/projects/remix) creates an
independent backend with the schema but explicitly does not copy database
records. It cannot test migration behavior against the existing lease,
payment, and document history. The user declined both a full database export
and any added cost, so neither a data-copy rehearsal nor a possibly billable
remix was initiated. Lovable's [daily backups](https://docs.lovable.dev/features/database-backups)
are not a substitute for rehearsal: restoring one replaces the live database
and discards intervening changes, while stored files are backed up separately.

Invitation signup verification on 2026-11-07: the migration-chain test now
covers confirmation, invitation acceptance, and a second membership, including
the default-portfolio assignment. The full local gate passed 598 tests in 116
files, production build, app TypeScript, lint, 102 unique migration versions,
and `git diff --check`. Neither new migration was applied to Lovable; a
recoverable target rehearsal and a live email/invitation test remain required.

Prelaunch Auth containment on 2026-11-07: Lovable Users > Settings > Auth now
has `Disable sign-up` enabled, and the setting remained enabled after leaving
and reopening the Auth panel. Email sign-in remains enabled, so existing
accounts can still log in. This prevents new public accounts from hitting the
unmigrated signup trigger; it is intentionally a release-check failure until
the backend, frontend, email delivery, and invitation flow are verified.
Re-enable public signup as the final launch step, then rerun the read-only
Auth settings gate. The local shell could not reach the public Auth settings
endpoint in this turn, so the persisted Lovable UI state is the evidence for
this setting change; no new account was created to probe it.

Auth email capacity check on 2026-11-07: Lovable Users > Settings > Auth > Email
> Advanced shows a limit of 1,000 emails per hour. Lovable's separate More >
Emails feature is not enabled. According to [Lovable's custom-email
documentation](https://docs.lovable.dev/features/custom-emails), disabling
custom app emails does not disable the default authentication-email sender.
Neither the configured limit nor that documentation proves delivery: a real
confirmation email, recovery email, and redirect still need to be tested with
an authorized test mailbox before public signup is re-enabled.

The local signup page now recognizes Auth's `signup_disabled` response and
explains that registration is temporarily closed while leaving the existing
sign-in route available. Its invitation copy no longer promises a new starter
portfolio. Five focused signup/invitation tests and app TypeScript passed on
2026-11-07. This frontend change is not yet published; the current live page
may still show the backend's generic error until a coordinated release.

Deployment-gate hardening on 2026-11-07: the manual GitHub workflow now reads
its backend target from the repository-managed `PRODUCTION_SUPABASE_ORIGIN`
variable instead of an operator-supplied dispatch input. The variable was
created on `Abotermans/rentflowing` and read back as
`https://othaxlwgtqpodncnlglv.supabase.co`. The scheduled-function check now
requires exactly one active hourly Cron job per function whose command names
that project's literal endpoint. A PostgreSQL-backed test verifies that a
different project host and a five-minute schedule are excluded. The full local
gate passed 605 tests in 117 files, lint, production build, workflow YAML
parsing, and script syntax checking. This workflow change is still local and
has not run against the Lovable target; actual Cron dispatch, migrations, and
the published release remain unverified. The 605-test full run preceded the
additional PostgreSQL query test; all 14 focused scheduled-function tests
passed after that addition.

A read-only Auth settings check against the Lovable backend on 2026-11-07
failed specifically because public signup is disabled. This is the expected
containment state, not a release pass. The check sends no account credentials
and made no backend change.

Dependency hardening on 2026-11-07: the production-only npm audit found zero
issues, but the full audit found 5 high and 2 critical findings in build/test
dependencies. Vite, Vitest, the React SWC plugin, and Lovable's tagger were
updated together; compatible transitive fixes and two targeted npm overrides
removed the remaining advisories. A fresh `npm ci` reported zero
vulnerabilities across all dependencies. CI now audits development as well as
production dependencies at high severity. The upgraded toolchain passed lint,
app TypeScript, a warning-free production build, and all 606 tests in 117
files. The Vite server on port 8082 was restarted after installation; an
authenticated browser reload showed the populated lease list instead of the
old hot-reload error. These checks do not verify the unpublished release or
the target's missing migrations.

Production-header follow-up on 2026-11-07: the release check now validates
both the public home page and the `/leases` app route, and rejects a route
redirected to the home page. Nine focused tests pass, including a case where
the home page is protected but the lease route is not. The published Lovable
home page still fails the required-header check. A separate read-only request
confirmed `/leases` returns HTTP 200 but lacks CSP, X-Frame-Options, and
Permissions-Policy; it has nosniff, referrer policy, and HSTS. No deployment
or live database change was made. The published site remains a no-go.

Scheduled-billing safety follow-up on 2026-11-07: if any due amendment fails
activation, `advance-receivables` now returns HTTP 409 before lease lifecycle
transitions or receivable generation. This prevents an old-formula receivable
from being issued after a failed amendment. Earlier successful amendments in
the same run remain committed; the operator must investigate the failed IDs
and retry. Thirteen targeted amendment/scheduler tests pass. This Edge
Function change is local only; deploy and test it with failed and successful
amendments on restored staging before enabling Cron on the target.

Receivable-job acknowledgement follow-up on 2026-11-07: the Edge Function
requires an integer insertion count from the database, and the shared job
rejects a count outside zero through the submitted batch size. A null,
negative, fractional, or excessive acknowledgement now fails the run rather
than refreshing `scheduled_job_health`. Zero remains valid for idempotent
retries. Twenty-three focused scheduler tests pass and the Edge Function
bundles locally. This does not verify the target RPC response or Cron job.

Lease-assignment write-surface follow-up on 2026-11-07: two unused AppContext
methods that wrote `lease_unit_assignments` directly were removed. Current
lease editing uses the transactional lease-and-assignments RPC, which also
reconciles the unpaid schedule. No production component called the removed
methods; only obsolete tests exercised them. App TypeScript and the remaining
76 lease-persistence tests pass, including rollback and database-version
checks for the active atomic path. Target RPC and policy verification remain
open before deployment. The full local suite passed 611 tests in 117 files;
the production build, app TypeScript, and `git diff --check` also passed.

Occupancy-rate consistency follow-up on 2026-11-07: dashboard, property list,
property detail, and occupancy report now count leased ancillary units in the
occupied numerator whenever those units are included in the total-unit
denominator. Primary and ancillary counts remain separate where the report
shows them. A focused 1-primary-plus-1-parking regression passes; app
TypeScript and the production build pass. Confirm these figures against
representative occupied and vacant properties in an authenticated preview
before the release gate is cleared.

Date-derived occupancy follow-up on 2026-11-07: unit lookup, property stats,
unit detail/list, and dashboard now share a lease-occupancy predicate covering
the signed/active lifecycle stage, start date, lease end, and actual move-out.
This prevents stale active rows with an elapsed end date from appearing
occupied and recognizes signed leases once their start date arrives. An
active lease under notice now displays `overdue-end` after its end date rather
than remaining `under-notice`, so the lease filter follows the same boundary.
Fourteen focused occupancy/status tests, 83 focused occupancy/lease-context
tests, app TypeScript, and the production build pass. The scheduler still
needs target deployment and authenticated date-boundary checks; the client
predicate does not repair a stale persisted lifecycle stage.

Archived-unit KPI follow-up on 2026-11-07: property and dashboard occupancy
classification now puts an unleased archived unit in its own category rather
than counting it as vacant. Property detail displays the archived count, and
the occupancy report offers an archived-status filter. An active assignment
still takes precedence over the manual archived flag, matching the unit's
derived occupancy. The all-unit occupancy-rate denominator is unchanged.
Eighty-five focused tests, app TypeScript, and the production build pass;
confirm the revised property KPI layout on desktop and mobile before release.

Property KPI layout follow-up on 2026-11-07: the seven-card summary now uses
an auto-fit grid with a minimum card track of 8 rem instead of fixed viewport
breakpoints, so it responds to the available content width beside the
sidebar. The production build passed and emitted the expected CSS rule. The
local browser tabs were at `/login` without a usable authenticated preview
session, so no real property-detail desktop/mobile screenshot was verified.
Keep that visual check open; a compiled layout rule is not a rendering test.

Occupied-only cost-allocation follow-up on 2026-11-07: a signed lease whose
term has started now qualifies its assigned unit for a cost at the service
date, consistent with the date-derived occupancy shown elsewhere. Draft and
future assignments remain excluded; ended leases still count for historical
cost dates within their assignment window. Twenty focused occupancy and
allocation tests, app TypeScript, and `git diff --check` pass. Verify the
same case against the migrated target data before considering live cost
figures release-checked.

Amendment effective-date warning follow-up on 2026-11-07: the dialog now
compares ISO calendar dates against the property's business date. It no
longer parses the date-only field as UTC midnight and compares it to local
midnight, which could mark today as past in European time zones. Seven
focused business-date tests, app TypeScript, and `git diff --check` pass.
An authenticated browser check of the warning remains open.

Published-host recheck on 2026-11-07: the read-only
`check:production-headers` command reached
`https://rentflowing.lovable.app` and failed on `/` because CSP
`frame-ancestors`, `object-src`, `base-uri`, and `script-src`,
`X-Frame-Options`, and the required `Permissions-Policy` directives
are absent or invalid. A direct request to `/release.json` returned HTTP
404. The public deployment is therefore not the verified release artifact
and still fails the security-header gate. Deploy a reviewed revision through
a host that applies the required headers, then rerun both checks against its
final URL; local `_headers` alone does not change Lovable's live responses.

Local verification after the occupancy-cost and amendment-date fixes on
2026-11-07: the full Vitest run passed 617 tests in 117 files, the production
build completed, ESLint passed, app TypeScript passed, and `git diff --check`
passed. This is evidence for the current dirty worktree only, not a reviewed
commit or a deployed revision. The published-header and release-marker
failures above, target migration rehearsal, authenticated workflow checks,
and legal/privacy review still prevent a production approval.

Deletion acknowledgement follow-up on 2026-11-07: Maintenance and Vendors
list rows now use the shared asynchronous deletion dialog. It stays open
through persistence, displays a server error on failure, and closes only
after a successful delete; the confirmation and pending labels are
translated. Two focused dialog tests, app TypeScript, focused ESLint, and
`git diff --check` pass. Browser confirmation and failure-path checks on a
migrated authenticated preview remain open.

Migration-tooling check on 2026-11-07: `npm run check:migrations` validated
102 unique local migration versions. The existing PGlite migration-chain
test successfully applied every local SQL file in filename order to a fresh
synthetic database, including Supabase-compatible test stubs; its targeted
rerun passed. No standalone PostgreSQL client or Docker runtime is installed,
and no project-scoped management read token is set. The PGlite pass does not
prove that the SQL applies to the target Lovable schema or preserves its
existing data. The user declined a database export and added cost; do not
run migrations on the live target without a reversible rehearsal. A fresh
`npm audit` request was denied by the environment's outbound-data policy
because it would send the dependency tree to the npm registry. The user has
been asked for explicit approval; no audit result is claimed for this
revision.

Contract-document deletion acknowledgement follow-up on 2026-11-07: the
document deletion confirmation now remains open until the database confirms
the delete. The pre-start signed-lease rollback choice likewise remains open
if deleting or downgrading a signed initial contract fails. A successful
document-row deletion closes the confirmation even if subsequent Storage
cleanup fails, with a destructive cleanup warning because the row is already
gone. Three UI regression tests cover supporting-document rejection and
success plus failed initial-contract deletion after choosing to revert the
lease. The four focused document test files pass 19 tests; app TypeScript,
focused ESLint, and `git diff --check` pass. Target RPC, Storage cleanup,
and authenticated browser verification remain open before release.

Lease-action single-flight follow-up on 2026-11-07: manual signing, signed-date
editing, and notice cancellation now lock their confirmation controls while
the persistence request is in flight. A synchronous ref also rejects a second
click before React renders the disabled state. Failed writes leave the
respective dialog open and show the existing destructive toast; successful
writes close only after acknowledgement. Twenty-five focused lifecycle and
document tests, app TypeScript, focused ESLint, the production build, and
`git diff --check` pass. These tests do not exercise the full Lease Detail
component; repeat rapid-click and rejected-write browser scenarios with an
authenticated migrated backend before release.

Amendment API audit on 2026-11-07: the unused AppContext
`terminateAmendment` method was removed. It always requested the
`terminated` status through a repository operation that intentionally only
accepts `draft` or `scheduled`, so every invocation would fail. Existing
amendment termination remains part of the lease lifecycle transaction, not
the standalone status RPC. The 111 focused lease-persistence and repository
tests, app TypeScript, focused ESLint, and `git diff --check` pass. Target
transaction behavior remains to be rehearsed on a restored backend.

Allocation-rule portfolio isolation follow-up on 2026-11-07: the PGlite
integration test now attempts to save a rule in an authorized portfolio
while pointing its `property_id` at a different portfolio. The
`enforce_portfolio_references` trigger rejects it with the expected
portfolio-mismatch error, even through the scoped save RPC. The targeted
migration-chain test, app TypeScript, focused ESLint, and `git diff --check`
pass. This verifies the local migration chain, not the target Lovable policy
installation or its pre-existing data.

Report assignment-snapshot follow-up on 2026-11-07: Rent Roll and Occupancy
now pass the same property-local calendar date to lease stage, assignment,
active-lease, and indexed-rent lookups within each row. This avoids mixing
Brussels and London dates around midnight, or recomputing the day between
related lookups. Seventeen focused tests across assignment snapshots, Rent
Roll, and occupancy pass; app TypeScript, focused ESLint, the production
build, and `git diff --check` pass. An authenticated target-browser check
at a date boundary remains open. The Demo GBP 120 `test2` receipt was
previously verified as `unmatched` with GBP 120 unapplied and no linked
allocations, which is the user's requested state; no new live edit was made.

Receipt-status audit follow-up on 2026-11-07: the read-only target financial
gate now also flags positive receipts whose `unmatched`, `partially-matched`,
or `matched` label contradicts the unapplied balance. `imported`, exception,
and terminal statuses are excluded from this label-consistency rule. A
PGlite test executes the exact SQL clause, including a one-cent partial
payment, and another test checks that all 29 SQL checks match the required
gate list. The full local suite passes 625 tests in 119 files, focused
ESLint and `git diff --check` pass. This new check has not run against the
target Lovable database because no project-scoped management read token is
available in this environment; it may reveal data requiring correction
before the release gate can pass.

Cross-border receivable scheduling follow-up on 2026-11-07: a two-property
server-job test covers the same instant when it is November 1 in Brussels
and October 31 in London. With zero lead days, the scheduler prepares the
November rent row only for Brussels and retains October as London's latest
due row. All 19 server-receivable-job tests pass, as do focused ESLint and
`git diff --check`. Full project ESLint, app TypeScript, and unique-version
validation for all 102 local migrations also pass on the current worktree.
The local `deno` executable cannot run on this machine (`Bad CPU type in
executable`), so Edge Function type-checking remains a CI/target check, not
a claimed local pass. The live hourly job and its property-time-zone behavior
still require deployment and observation against the target backend.

Move-out display time-zone follow-up on 2026-11-07: Lease Detail and Unit
Detail now evaluate move-out completion on the same property-local date used
for their lease and occupancy status. Unit Detail also passes that snapshot
date to its active-lease fallback. A Brussels/London midnight regression test
and 25 other focused lifecycle/report tests pass; app TypeScript, focused
ESLint, the production build, and `git diff --check` pass. The accessible
Chrome browser currently has no authenticated Rentflowing Lovable project tab,
so the corresponding live detail-page smoke check remains open.

Receipt-status write guard follow-up on 2026-11-07: the new migration adds a
`NOT VALID` check that rejects positive receipts labelled unmatched,
partially matched, or matched when their unapplied balance disagrees. It
does not rewrite historical rows; the existing financial audit still flags
them for explicit review. The target-schema gate now requires this check.
The complete 105-migration PGlite chain and target-schema gate pass locally,
along with 645 Vitest tests in 122 files, the production build, ESLint,
app TypeScript, and `git diff --check`. The Lovable target has not received
this migration, and no live payment data was changed in this follow-up.

Portfolio read-policy gate follow-up on 2026-11-07: a local inventory of all
portfolio-scoped public tables found 26 client-readable tables with
membership-scoped SELECT policies. The separate document-file deletion queue
is intentionally server-only, with no client SELECT privilege or policy.
The target-schema gate now rejects an unscoped SELECT policy on any
portfolio-scoped table, not only the 11 core tables. A negative test using
`vendors` proves the broader gate catches a policy the old core-only check
missed; the full migration-chain and target-schema focused tests pass (36
tests). This is local policy inspection, not a live two-account access test.

Lease-document write-policy follow-up on 2026-11-07: the previous INSERT and
UPDATE policy used an unqualified `portfolio_id` inside a subquery over
`leases`, which PostgreSQL resolved to the inner lease row. The resulting
comparison was tautological. A separate portfolio-reference trigger blocked
cross-portfolio links in the full local schema, but the policy did not
independently enforce that link. Migration 106 qualifies the outer document
row in both policies. A trigger-free RLS test confirms cross-portfolio
INSERT and UPDATE fail while a same-portfolio INSERT succeeds. The
target-schema gate rejects both the old policy and an extra permissive
document-write policy. The full local suite (646 tests in 123 files),
production build, app TypeScript, ESLint, migration-version validation, and
`git diff --check` pass; target deployment remains open.

Lease-renewal follow-up on 2026-11-07: the active overdue-renewal action
previously updated only the lease row, leaving assignment end dates and
future receivables unchanged. It now uses the atomic lease-and-assignments
save, extending units present at the old lease end and generating missing
cycles. Rent and charges edits were removed from this quick action; they
belong in a dated amendment so historic billing terms are not silently
rewritten. Renewal validation now checks overlaps from the old lease end,
including when that date is in the past, and rejects open-ended leases or
leases without an assigned unit at the old end. It also refuses renewal
after actual move-out and requires an end beyond the original contractual
term when notice had shortened it. Renewal clears planned move-out and the
pre-notice end snapshot so they cannot truncate new receivables. Focused
overlap and persistence tests pass. The complete local suite passes (655
tests in 124 files), as do the production build, app TypeScript, ESLint, and
`git diff --check`. Live renewal and payment reconciliation remain to be
verified on a recoverable target environment.

Move-out billing follow-up on 2026-11-07: the active Lease Detail actions for
scheduling, confirming, or undoing a move-out previously saved the lease row
without rebuilding its receivables. These date changes now use the atomic
lease-and-assignments save, which recalculates only unallocated schedule rows
and preserves paid/allocated rows for review. Focused persistence tests cover
scheduled and actual move-out removing a future open bill, and undoing an
actual move-out restoring missing rent and charges. A move-out date alone does
not release the unit for a new lease while the prior lease remains active:
the database still reserves the assignment until lease closure. The matching
frontend availability rule was left unchanged to avoid promising a save the
database would reject. The complete local suite passes (658 tests in 124
files), as do the production build, app TypeScript, ESLint, and
`git diff --check`. Target workflow verification remains open.

Guarantee form follow-up on 2026-11-07: the three monetary inputs now retain
invalid text instead of letting numeric-input coercion turn it into an empty
value saved as zero. They accept exact cents in dot or comma notation and
reject negative, malformed, and sub-cent values with the specific reason below
each field. Saves are disabled in flight. The full local suite passes (698
tests in 135 files), as do the production build, app TypeScript, ESLint, and
`git diff --check`. Authenticated create/edit and reload verification on the
Lovable target remains open; this frontend validation does not establish a
database-level exact-cent guarantee constraint. The Demo `test2` cash receipt
was already verified as `unmatched`, with 120 GBP unapplied and no allocation;
the request to leave it unallocated required no live write.

Guarantee database follow-up on 2026-11-07: migration
`20261107260000_guard_guarantee_amounts.sql` removes the rounding typmod from
the three guarantee amounts and adds `NOT VALID` constraints to reject new
negative, sub-cent, over-retained, date-inverted, or status-inconsistent rows.
Existing rows are not rewritten; two new read-only target-data checks expose
historical amount and status drift. The target-schema gate checks raw numeric
precision and both constraints. A focused PGlite test covers direct writes and
legacy preservation. The complete local suite passed (701 tests in 136 files),
as did the production build, app TypeScript, ESLint, and migration-version
check (114 unique versions). This migration has **not** been applied to Lovable
Cloud. Its table rewrite and data checks require a reversible rehearsal before
live use; the user declined export and additional fees, so backend release
verification remains blocked pending a safe environment and target access.

Single-guarantee follow-up on 2026-11-07: the application has always displayed
and edited only one guarantee per lease, but the database allowed duplicates.
Migration `20261107270000_one_guarantee_per_lease.sql` now requires a unique
lease key and stops with an explicit error if historical duplicates exist; it
does not pick or delete any guarantee. The read-only financial audit counts
surplus rows, and `scripts/audit-duplicate-guarantees.sql` lists each affected
lease and guarantee for review. The add flow handles both a locally known
duplicate and a database uniqueness race with a localized error. The complete
local suite passed (705 tests in 136 files), as did the production build, app
TypeScript, ESLint, and the 115-version migration check. The target duplicate
audit and migration have **not** run on Lovable Cloud. Apply neither migration
without a reversible rehearsal and an explicit decision about any duplicate
guarantees the read-only audit finds.

Published-CSP follow-up on 2026-11-07: the production-header gate now requires
the expected Supabase origin and exact `default-src`, `form-action`,
`connect-src`, and `img-src` destinations plus `upgrade-insecure-requests`.
The local `_headers` template no longer allows arbitrary `*.r2.dev` images;
no application asset references that host. The deployment-verification
workflow passes the configured backend origin to the gate, and the same
template passes the gate when rebound to a different HTTPS app/backend pair.
The complete local suite passed (707 tests in 136 files), as did the build,
app TypeScript, ESLint, and `git diff --check`; the workflow YAML parsed and
forwards both origins. A live read-only retry against the Lovable host failed
at network fetch, before any headers were read. Current deployed CSP and
revision remain unverified, and no site or backend data was changed.

Release-marker cache follow-up on 2026-11-07: the deployment verifier now
rejects a `release.json` response lacking `Cache-Control: no-store`, matching
the static-host template. The template also sends one-year HSTS without
subdomain or preload directives, and the production-header gate requires it.
Focused negative tests cover a cacheable marker and absent/disabled HSTS.
The complete local suite passed (708 tests in 136 files), as did the build,
app TypeScript, ESLint, and `git diff --check`; the built `dist/_headers`
contains both directives. A read-only live retry failed at network fetch, so
the Lovable host's current HSTS, caching, and other headers remain unverified.

Independent-release-build follow-up on 2026-11-07: the post-publication
workflow now runs only from `main`, installs locked dependencies, and rebuilds
the intended revision with the expected site origin, backend, and publishable
key before checking the published site. `check:deployment` verifies the local
HTML and every local asset against its freshly generated marker, then requires
the published HTML and asset manifest to have the same hashes. It still
fetches each published asset to verify the bytes served by the host. Focused
tests reject a self-consistent but different remote build and a tampered local
file. The complete local suite passed (711 tests in 136 files), as did the
production build, app TypeScript and ESLint. The workflow YAML parsed with the
rebuild preceding verification; a local build's 104 asset digests matched its
marker, but its `dirty: true` value correctly prevents release attestation.
Two successive local builds produced the same combined HTML/104-asset digest
(`51aede76aed7205de2782c57dd631a0050075f4d5ed9f0ffff646be5171736bb`).
This is local reproducibility evidence only. No clean GitHub workflow run or
live deployment was performed.

Occupied-only cost allocation follow-up on 2026-11-07: the calculation no
longer falls back to a unit's stored `occupied` status when lease history is
missing. It requires leases and dated unit assignments, which both production
callers already supply, and determines eligibility at the cost start date.
The financial-coherence tests now provide actual active lease context, and a
new regression test rejects the missing-context case. The complete local
suite passed (712 tests in 136 files), as did the production build, app
TypeScript, ESLint, and `git diff --check`. No Lovable Cloud data or deployed
application was changed. The Demo `test2` GBP 120 receipt was previously
verified as `unmatched`, with GBP 120 unapplied and no allocation; the user's
instruction to leave it unallocated requires no data edit.

Profile and default-portfolio follow-up on 2026-11-07: Profile now displays
English/French labels, uses an in-app confirmation to leave a portfolio, keeps
the dialog open on rejected or failed membership deletion, and distinguishes a
successful departure from a subsequent refresh failure. The page re-reads the
server-selected default portfolio after leaving. Local migration
`20261107280000_keep_default_portfolio_accessible.sql` repairs existing
inaccessible defaults, rejects future defaults without membership, and picks
another membership (or null) when one is removed, including admin removal.
The read-only target data gate now has a 39th check for inaccessible defaults.
The complete local suite passed 721 tests in 137 files; production build,
app TypeScript, ESLint, migration-version validation (116 versions), and
`git diff --check` also passed. The new migration and data audit have **not**
run on Lovable Cloud. Do not apply it to the live database without a
reversible rehearsal, consistent with the user's no-export/no-fees constraint.

Target-migration verification follow-up on 2026-11-07: the read-only gate
previously hashed each raw local SQL file but compared that hash with the
target's `schema_migrations.statements` array joined by newlines. Supabase CLI
actually splits and trims the file into statements before storing that array
(see `pkg/migration/file.go` and `pkg/parser/token.go` in the Supabase CLI
source). A correctly applied multi-statement migration would therefore fail
the gate. The gate now accepts either the original raw-file hash (for legacy
whole-file histories) or the hash of CLI-style split-and-trimmed statements,
while still rejecting missing or changed content. Tests cover all 116 local
migrations in both formats and semicolons inside SQL functions, strings, and
comments. The complete local suite passed 723 tests in 137 files; production
build, app TypeScript, ESLint, migration-version validation, and
`git diff --check` also passed. The target's actual migration history has
**not** been checked because no scoped read-only management token is
available; this is a locally tested verifier, not deployment evidence.

Indexation-language and eligibility follow-up on 2026-11-07: the lease edit
and amendment forms now share French/English indexation labels and explain
that the application does not verify local legal prerequisites. The Brussels
regional guidance at
https://be.brussels/en/housing/rental/lease-contracts/rental-price-indexation
requires, for relevant residential leases, registration, a valid energy
certificate supplied to the tenant, an annual anniversary boundary, and a
written request; certain older low-EPB leases also need a correction factor.
The current model stores user-entered index values and computes a ratio from
the base date, but has no evidence fields or approval workflow for those
conditions and does not calculate regional correction factors. Do **not**
treat the generated amount as legally approved or enable automatic indexed
billing for such leases before a qualified jurisdiction-specific review and
an explicit eligibility/notice workflow are implemented and tested. Focused
indexation and translation tests pass; this is a documented launch blocker,
not a claim of regulatory compliance. The complete local suite passed 725
tests in 138 files, as did the production build, app TypeScript, ESLint, and
`git diff --check`. A fresh read-only HEAD request to the published Lovable
site still returned 404 for `/release.json` on 2026-11-07; no deployment or
target database change was made in this follow-up.

Schema-attestation follow-up on 2026-11-07: the target gate no longer accepts
one indexation column as proof of the lease indexation model. It requires all
eight columns with their expected types/precision and the three validated
constraints. The contractual-document gate now requires the signed-date
column, both validated status/type constraints, and a valid unique index on
`lease_id` filtered specifically to `initial-contract`. The amortization gate
requires the category default, cost-entry mode and dates, and their three
validated constraints. The property time-zone gate requires a non-null text
column without a fixed default, its validated length constraint, and the
enabled INSERT/UPDATE validator trigger with no authenticated execute grant.
PGlite tests reject partial models, missing constraints, a wrongly filtered
contract index, a fixed time-zone default, and a disabled validator. The full
116-migration local chain satisfies the stricter gate. The complete local
suite passed 729 tests in 138 files; production build, app TypeScript, ESLint,
migration-version validation, and `git diff --check` pass. No project-scoped
read-only management token is available, so the actual Lovable schema remains
unverified and no migration was applied.

Mutation-acknowledgement follow-up on 2026-11-07: the client now rejects
atomic payment-allocation, cost-allocation, and lease-creation RPC responses
that return the right number of rows but the wrong identities or parent links.
Focused repository tests cover mismatched receipt/receivable/allocation,
cost entry/allocation, and lease/assignment/receivable/tenant responses.
The complete local suite passed 732 tests in 138 files; production build,
app TypeScript, ESLint, migration-version validation (116 versions), and
`git diff --check` passed. No live data was changed. The Demo GBP 120 `test2`
receipt is already unmatched with no allocation, so the request to leave it
unallocated requires no correction. These client checks do not replace a
target-database migration audit or a production transaction smoke test.

Additional mutation-acknowledgement follow-up on 2026-11-07: lease metadata
and assignment edits now require exactly the expected tenant identities,
statuses, and portfolio. Amendment activation requires matching lease,
assignment, amendment, new/removed receivable, and tenant identities; rule
shares, reconciliation adjustments, and amendment changes also require their
expected IDs and parent links. Negative tests exercise wrong-row responses
without claiming the RPC itself is faulty. The complete local suite passed
737 tests in 138 files; production build, app TypeScript, ESLint, migration
version validation (116 versions), and `git diff --check` passed. A read-only
attempt to fetch the public `/release.json` marker could not resolve the
published host from this environment, so this turn adds no fresh deployment
evidence. No live data or deployment was changed.

Simple-write acknowledgement follow-up on 2026-11-07: repository inserts
that return a row now require the requested ID and portfolio. Updates and
deletes that return IDs require exactly the requested IDs, including batch
deletions whose returned count could previously match while the identities
did not. Negative tests cover each mismatch. The complete local suite passed
738 tests in 138 files, along with production build, app TypeScript, ESLint,
migration-version validation (116 versions), and `git diff --check`.

Lovable access path on 2026-11-07: Lovable documents **More > Database >
Manage > SQL editor** for project editors and offers a Lovable MCP connection
that can query the project's built-in database. This can provide read-only
target evidence without buying a separate Supabase project or exporting the
database. The Lovable connection is available but not connected in this Codex
session; no target query has run. An SQL editor query acts on the same database
as the published app, so first use only reviewed `SELECT` statements. Lovable's
daily backups restore the whole database to a previous daily point and omit
storage files; they are not a reversible rehearsal for the pending migration
chain. The user declined a database export and added costs, so do not apply
schema or data changes to the live project until a non-destructive rehearsal
and recovery path are agreed. References:
https://docs.lovable.dev/features/database,
https://docs.lovable.dev/features/database-backups,
https://docs.lovable.dev/integrations/lovable-mcp-server.

Millieme precision and cost-proration follow-up on 2026-11-07: capacity and
property-base validation now sum fractional unit shares with decimal
arithmetic instead of rounding them to two currency decimals. Bulk unit
creation multiplies shares exactly and displays a useful fractional limit.
Owner-managed invoice portions, absolute millieme allocations, partial cost
recovery, and weighted money distribution now round half cents consistently.
Regression tests cover a valid 999.999 + 0.001 share, a 1000.004 excess,
bulk 999.7 + 3 x 0.1, and a 0.29 invoice at 50% ownership/recovery. The
complete local suite passed 743 tests in 138 files; production build, app
TypeScript, ESLint, migration-version validation (116 versions), and both
staged and unstaged `git diff --check` passed. The build emitted a chunk-size
warning for an approximately 507 kB initial JavaScript asset (about 142 kB
gzip); mobile performance has not been measured. No Lovable database or
published application change was made.

Money-rounding follow-up on 2026-11-07: indexed rent and capped indexation
now use decimal arithmetic with explicit half-up rounding, including
multi-month totals. Amortized costs use cumulative decimal proration so
half-cent daily boundaries do not lose or create a cent. Regression tests
cover a 0.29 rent indexed by 1.5 and a 0.29 cost recognized over two days.
The complete local suite passed 745 tests in 138 files; production build,
app TypeScript, ESLint, migration-version validation (116 versions), and
staged and unstaged `git diff --check` passed. The build still warns about
an approximately 508 kB initial JavaScript chunk; mobile performance is
unmeasured. The Demo GBP 120 `test2` receipt had already been verified as
`unmatched` with GBP 120 unapplied and no allocations, matching the user's
instruction; no live write was needed or made. Lovable schema, deployment,
and live transaction checks remain unverified without project access and a
reversible rehearsal path.

Currency-total follow-up on 2026-11-07: grouped dashboard, report, tenant,
lease, and cost totals now sum with decimal arithmetic before rounding. A
regression test reproduces a half-cent total that floating-point addition
previously rounded down after two offsetting amounts. The complete local
suite passed 746 tests in 138 files; production build, app TypeScript,
ESLint, migration-version validation (116 versions), and staged and
unstaged `git diff --check` passed. The build still reports an approximately
508 kB initial JavaScript chunk. No Lovable data or deployment was changed;
target-schema verification, migration rehearsal, and published-host checks
remain required before real customer data is accepted.

Per-unit rent and receivable attribution follow-up on 2026-11-07: current
unit rent shares now require their decimal sum to match the lease rent
exactly; a one-cent excess no longer passes a floating-point tolerance.
Scheduled receivable attribution also compares billable cent amounts rather
than accepting a 1.1-cent difference, so a drifted assignment or billed row
is reported as unavailable instead of being silently attributed to a unit.
Focused regressions cover a one-cent excess and valid 0.1 + 0.2 shares.
The complete local suite passed 747 tests in 138 files; production build,
app TypeScript, ESLint, migration-version validation (116 versions), and
staged and unstaged `git diff --check` passed. No target database or
deployment change was made. Historical target rows and operational returns
still require an authenticated, read-only audit before launch.

Property-local lease creation follow-up on 2026-11-07: the atomic lease
creation path now uses the property's business date for historical paid
backfill, upcoming schedule generation, and the open-ended billing horizon.
Previously it used the manager's local date while the Step 1 preview used
the property date; near cross-border midnight, an installment due today at
the property could be saved as historically paid. A timezone-boundary test
covers a Brussels manager at 2026-01-02 and a London property still on
2026-01-01: two December rows are paid, while January rent and charges remain
open. The complete local suite passed 748 tests in 138 files; production
build, app TypeScript, ESLint, migration-version validation (116 versions),
and staged and unstaged `git diff --check` passed. This is local evidence
only; the matching authenticated creation/reload scenario remains in
`QA_SCENARIOS.md`. No live data or deployment was changed.

Payment-priority follow-up on 2026-11-07: automatic receipt allocation now
compares overdue/current/future status, item type priority, and due date in
that order. The old numeric key could let a very old charges row precede a
newer overdue rent row despite the documented rent-first policy. A focused
regression covers that long-horizon case. The complete local suite passed
749 tests in 138 files; production build, app TypeScript, ESLint,
migration-version validation (116 versions), and staged and unstaged
`git diff --check` passed. A fresh public-host attempt from this environment
could not resolve `rentflowing.lovable.app`; it adds no current deployment
evidence. Authenticated allocation and reload still need target verification.
No live data or deployment was changed.

Profitability half-cent follow-up on 2026-11-07: unit rent potential and
vacancy loss now accumulate monthly day prorations in decimal arithmetic and
round half-up at the end. A 1,000.29 monthly base rent over 15 days of a
30-day month now produces 500.15 in both unit and property operational
returns, rather than 500.14 from floating-point `Math.round`. Other finite
profitability totals use the same money rounding; non-finite legacy inputs
remain available to the existing integrity diagnostics instead of throwing
while rendering. The complete local suite passed 750 tests in 138 files;
production build, app TypeScript, ESLint, migration-version validation
(116 versions), and staged and unstaged `git diff --check` passed. The build
still warns about an approximately 508 kB initial chunk. The published
backend and UI remain unverified for this change; no live data or deployment
was changed.

Contractual-document acknowledgement follow-up on 2026-11-07: successful
upload/readback now confirms the exact document, lease, portfolio, type,
status, signed date, title, document date, filename, and storage path before
showing success. Contractual RPC responses additionally confirm the returned
lease identity; deletion confirms it before removing the storage object.
Mismatched responses leave the file in place and show an error for manual
inspection. Regression tests cover a wrong type after a successful insert,
a wrong lease after a lost response, and a wrong lease after contractual
deletion. The complete local suite passed 753 tests in 138 files; production
build, app TypeScript, ESLint, migration-version validation (116 versions),
and staged and unstaged `git diff --check` passed. These tests use mocked
responses; target-backend transaction and storage behavior remain unverified.
No live data or deployment was changed.

Lease-document navigation follow-up on 2026-11-07: the open dialog now reloads
when the lease changes and discards late document and custom-type responses
from the previous lease or portfolio. It clears stale rows and schema errors
before the new load. A regression test switches leases before the first query
resolves and confirms that only the second lease's document is shown. The
complete local suite passed 754 tests in 138 files; production build, app
TypeScript, ESLint, migration-version validation (116 versions), and staged
and unstaged `git diff --check` passed. The approximately 508 kB initial
JavaScript chunk warning remains. The Demo `test2` GBP 120 receipt had already
been verified as unmatched with GBP 120 unapplied and no linked allocation,
so the user's requested state required no write. No live data or deployment
was changed in this follow-up; target navigation and transaction behavior
remain unverified.

Account-switch isolation follow-up on 2026-11-07: portfolio loading now
rejects responses and callbacks from an account that is no longer active.
The provider hides the previous account's portfolio list immediately while
the new account loads or after sign-out, and a stale refresh or switch action
cannot replace the new account's selection. Regression tests cover an old
request resolving after account B loads, an old callback invoked afterward,
and immediate sign-out visibility. The complete local suite passed 756 tests
in 138 files; production build, app TypeScript, ESLint, migration-version
validation (116 versions), and staged and unstaged `git diff --check` passed.
The build still warns about an approximately 508 kB initial JavaScript chunk.
No target deployment or authenticated multi-account browser check was
performed; the Lovable release remains no-go.

Portfolio-storage resilience follow-up on 2026-11-07: a browser that denies
local storage no longer leaves portfolio loading or selection stuck. The
provider falls back to the first accessible portfolio and keeps later switches
in memory, while persistence remains best-effort. A regression test makes
both storage reads and writes throw and verifies loading and switching still
work. The complete local suite passed 757 tests in 138 files; production
build, app TypeScript, ESLint, migration-version validation (116 versions),
and staged and unstaged `git diff --check` passed. The build still reports
an approximately 508 kB initial JavaScript chunk. A fresh attempt to open
the published Lovable URL via the browsing tool was inaccessible; `curl`
could not resolve `rentflowing.lovable.app` from this environment. That is
not evidence of the site's current health. Target migrations, deployment,
authenticated workflows, and reversible rehearsal remain unverified.

Portfolio-creation acknowledgement follow-up on 2026-11-07: the UI now sends
a stable UUID for each attempted creation and reuses it after an uncertain
response in the same mounted session, preventing that retry from inserting a
second portfolio. A full page reload does not preserve the pending ID. The insert
acknowledgement must match ID, name, and creator; a lost response triggers an
exact-ID readback before success is shown. A confirmed creation followed by
a failed membership-list refresh is reported as created but not yet visible,
instead of inviting a duplicate retry. Tests cover exact confirmation,
lost-response recovery, rejected insert, mismatched row or ID, readback failure,
stable-ID retry, and refresh failure. The complete local suite passed 765
tests in 140 files. The production build, app TypeScript, ESLint, migration
version validation (116 versions), and staged and unstaged `git diff --check`
passed. The build still warns about an approximately 510 kB initial chunk.
No Lovable data was written or deployment changed. Target membership-trigger
and authenticated creation behavior remain unverified.

Invitation-acceptance acknowledgement follow-up on 2026-11-07: a lost or
failed acceptance response now triggers a scoped read of the signed-in user's
membership before the UI claims that the portfolio is accessible. A returned
portfolio ID different from the invitation is rejected; an explicit RPC error
is not ignored merely because a data field is present. If membership readback
fails, the UI reports an unverified outcome rather than a definite refusal.
Tests cover lost-response recovery, wrong-ID rejection, readback errors and
throws, and contradictory RPC responses. The complete local suite passed 770
tests in 140 files; production build, app TypeScript, ESLint, migration-version
validation (116 versions), and staged and unstaged `git diff --check` passed.
The approximately 510 kB initial JavaScript chunk warning remains. The
backend invitation functions and RLS policies still require a reversible
deployment and an authenticated two-account smoke test on the Lovable target.

Initial-load bundle follow-up on 2026-11-07: source inspection found no
TanStack Query hook usage, yet the app mounted `QueryClientProvider` on every
route. Removing that unused provider and dependency reduced the initial
JavaScript chunk from 509.71 kB (142.99 kB gzip) to 486.60 kB (136.22 kB
gzip), and the Vite 500 kB warning disappeared. The Impeccable mechanical
detector reported no findings for `src/App.tsx`. Local Playwright loaded
`/login` at 1280x800 and 390x844 with HTTP 200, the expected sign-in fields,
no page errors, and no visible overlap in the captured screenshots. The
complete local suite passed 770 tests in 140 files; production build, app
TypeScript, ESLint, migration-version validation (116 versions), staged and
unstaged `git diff --check`, and `npm audit --audit-level=high` passed (zero
reported vulnerabilities). This measures bundle transfer size, not mobile
LCP/INP or the published site's performance. No Lovable data or deployment
was changed.

Portfolio entry localization follow-up on 2026-11-07: portfolio switching,
portfolio creation, and invitation acceptance now use the selected English or
French locale for application-owned labels, roles, success messages, and
errors. Two new UI tests cover French account mismatch and creation failure;
the complete suite passes 772 tests in 140 files. The production build, app
TypeScript, ESLint, migration-version validation (116 versions), and tracked
`git diff --check` pass. A local mocked invitation rendered at 1280x800 and
390x844 with the French title, role, and actions, no horizontal overflow, and
no page errors. The Impeccable detector reported no findings. These checks do
not establish that a real Lovable invitation or the published deployment works.
The Demo `test2` receipt remains 120 GBP unmatched with no allocation, so the
user's requested state required no live write. The release decision remains
no-go until the target migration, deployment, and authenticated workflow gates
are verified.

Payment-filter follow-up on 2026-11-07: receivable and cash-receipt status
filters now retain separate selections across tabs. The focused UI test first
reproduced the bug (an overdue receivable filter hid an unmatched receipt),
then passed after the fix and also checked switching back with both filters
selected. App TypeScript, production build, ESLint, and the Impeccable detector
passed. A fresh read-only HEAD request to the published Lovable release marker
still returned HTTP 404. This local fix has not been checked in an
authenticated published session, and the production release remains no-go.

Shared-filter localization follow-up on 2026-11-07: the reusable multi-select
filter now translates its search placeholder, empty state, select-all action,
and clear action in English and French, including the clear control's
accessible label. Two new focused tests cover both locales. The complete
suite passes 775 tests in 141 files; production build, app TypeScript, ESLint,
and migration-version validation (116 versions) pass. The Impeccable detector
reported no findings. This is local UI coverage, not an authenticated smoke
test against the published Lovable application.

Full migration-chain follow-up on 2026-11-07: a new CI test applies every
local SQL migration in filename order to an empty PGlite database with only
Supabase auth/storage/pgcrypto bootstrap objects supplied by the fixture. All
116 migrations apply, and every check in `scripts/check-target-schema.sql`
passes against the resulting synthetic schema. The complete suite passed 776
tests in 142 files; app TypeScript, production build, ESLint, and migration
version validation passed. This catches local ordering and final-schema drift
without an export, fee, or live write. It cannot prove that Lovable's actual
database has those migrations or that existing data passes their constraints.

Shared-filter accessibility follow-up on 2026-11-07: the clear control is now
a separately focusable native button, not an interactive span nested inside
the filter trigger. The trigger has an accessible name that includes the
selected count, and the clear button names the filter in the selected locale.
Focused UI tests verify both English and French behavior; the complete local
suite passed 776 tests in 142 files, and app TypeScript, production build,
ESLint, and staged and unstaged `git diff --check` passed. The Impeccable
detector reported no findings. An isolated browser mount could not render
outside the application's provider tree, so this change has no visual or
published-site verification yet. The Demo `test2` cash receipt had previously
been verified as 120 GBP unmatched, with its full balance unapplied and no
linked allocation; the user's requested state needs no additional data write.

Profile-load reliability follow-up on 2026-11-07: the Profile page no longer
shows empty editable fields when its account record fails to load or is
missing. It offers a localized retry action, ignores stale responses, and
hides the previous account's fields immediately when the signed-in account
changes. Three focused UI tests cover failed reads, absent records, retry,
and account switching; the complete local suite passed 779 tests in 142
files. App TypeScript, ESLint, production build, staged and unstaged
`git diff --check`, and the Impeccable detector passed. A fresh read-only
public check of the Lovable host still returned HTTP 404 for `/release.json`,
failed the required security-header gate, and found signup disabled on the
Supabase backend. No live data or deployment was changed. These public gates,
target migrations, recovery rehearsal, and authenticated workflows still
block release.

Profile-write reliability follow-up on 2026-11-07: profile details, email,
password, and default-portfolio writes now share a guarded in-flight state.
Thrown network failures show a destructive error, restore the controls for a
retry, and preserve entered values; neither a failed default-portfolio write
nor a failed profile save claims success. A repeated submit while a write is
pending cannot dispatch a duplicate request. Five focused UI tests cover the
four failure paths and duplicate submission. The complete local suite passed
784 tests in 142 files; app TypeScript, ESLint, production build, staged and
unstaged `git diff --check`, and the Impeccable detector passed. No live
account or backend was changed; authenticated behavior on the Lovable target
remains unverified.

Anonymous-access spot check on 2026-11-07: using the configured public
publishable key without a user session, read-only PostgREST requests for one
ID each from `portfolios`, `properties`, `units`, `tenants`, `leases`,
`receivable_items`, `cash_receipts`, and `lease_documents` all returned HTTP
200 with zero visible rows. An anonymous root listing of the `lease-documents`
storage bucket likewise returned HTTP 200 with zero visible objects. These
results found no immediate anonymous listing leak but do not prove that every
document path is private, that all tables have correct policies, or that
one authenticated portfolio cannot read another. The two-account RLS and
document-download checks remain blocking; no data was written or downloaded.
