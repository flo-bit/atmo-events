# Operations

These notes include migration status recorded before deployment. Reverify that
status against the deployed Worker and bindings before acting on it.

## Contrail and search

Contrail indexes records in `DB`. The existing one-minute cron handles bounded
Jetstream v2 ingestion, due backfill retries, the reply bot, topic aggregates,
daily city snapshots and [event starter-pack refreshes](starter-packs.md).
Text search uses Contrail's D1 full-text search. User-entered terms are escaped
as literal, all-terms FTS queries; topic expressions retain their server-owned OR
semantics. There is no external search service, near-you search, geocode drip or
search reindex job. Interactive event
address entry/maps still use the optional Nominatim-compatible geocoder.

```sh
pnpm --filter web generate          # query Lexicons + Atcute types, offline
pnpm --filter web backfill          # local D1
pnpm --filter web backfill:remote   # operator-run production backfill
```

Custom event pipelines have checked-in contracts under `lexicons/custom/`.
Generated method and record types are committed. Ordinary browser read queries
are public. Browser update notifications require the existing session,
same-origin requests and records owned by that session DID; no service JWT is
needed. Internal bot/SSR calls stay in-process.

### Contrail release

The app pins published `@atmo-dev/contrail@0.27.0`, including session-backed
reporting and the profile-miss cache. No review tarball or sibling checkout is
required. The prepared records database was built with the preceding review
build; release compatibility is checked before deployment.

## Private reports and moderation

`REPORTS_DB` is a **separate, stable D1 database** containing reports, resolution
notes and reporter quotas. It must never alias `DB` or follow projection rebuilds.
Missing report storage fails closed; there is no fallback to the projection.
The schema initializes lazily. Back up this database independently.

Reports use the existing OAuth session through SvelteKit remote commands.
Reporter identity comes only from server-side `locals.did`; no new RPC OAuth
grants, service audiences or `getServiceAuth` calls are required. Contrail's
public report XRPC routes are disabled. SvelteKit automatically marks remote
responses `private, no-store`; do not call `setHeaders` inside a remote function.

Set `MODERATOR_DIDS` to a comma-separated list of trusted `did:plc`/`did:web`
identifiers. Empty means nobody has moderator access. Use the same setting for
operator CLI commands. No moderator identity is preselected in this checkout.

Viewers can open reporting from the profile footer and the event-page footer
(when the indexed record has a CID). Signed-in viewers submit directly; signed-out
viewers can sign in or email `reports@atmo.social`, with the subject link prefilled.
Failed direct submissions also offer email with the entered details. Report buttons
are not shown on your own content while signed in, or in embeds. Direct submissions
still require an authenticated session. The shared Kit `ReportDialog` owns the
form and its UI states; the app's `ReportButton` supplies auth, the canonical link,
mailbox, and session-backed submission/error mapping.
Configured moderators can open `/mod` (also linked from their own profile) to
review, resolve and paginate reports.
The inbox can authorize the optional **repository create/delete** permission for
`tools.atmo.moderation.action`. That grant is not requested during normal
login/signup and is not necessary for reporting or resolving reports.

Hide actions are **public PDS records**, trusted globally by instances configured
with that moderator DID. Reasons and notes stay in `REPORTS_DB` and are never
copied into public action records. The app reserves each report's action URI and
public record in `REPORTS_DB.report_actions` before publication, independently of
resolution. Reloads retain the association; pending publications can retry the
same record without creating duplicate hides. Moderators can undo their own
associated actions from either inbox; other applicable hide reasons can remain.
PDS writes are indexed immediately when possible, with scheduled reconciliation
as recovery. An indexing failure is shown as pending, not a failed PDS write.
External labelers are not enabled implicitly.

Public content is checked against current Contrail visibility. Public OG/JSON/
calendar responses use `no-store`; R2 and private versioned OG caching still avoid
rerendering. The old stale event-cache fallback was removed so database failures
cannot resurrect hidden content. Topic counts exclude hidden subjects when
refreshed, but the daily snapshot can lag visibility changes.

## Production migration — review before deploying

A separate reports database and a fresh, backfilled records candidate have been
provisioned and connected in `apps/web/wrangler.jsonc`. **The Worker has not been
deployed to these bindings.** The old production database remains untouched.
The previously referenced database preparation record,
`database-generation-20261029.md`, is missing from this checkout. Recover and
review its IDs, verification evidence and app-state transfer plan before cutover.

The Worker dry-run bundle is approximately **3.25 MiB gzipped**, above Cloudflare's
3 MiB free-tier limit; confirm a paid Workers plan (10 MiB limit) before deployment.

Before deployment:

1. Keep the tested Contrail release pinned. Configure trusted moderator DIDs only
   when moderator access is intentionally enabled.
2. Verify the imported projection and run a recent catch-up with its pinned source
   service and continuity epoch. Keep the old Worker/database tuple for rollback.
3. Stop old ingestion/writers for cutover and refresh non-rebuildable app state
   (bot deduplication records, OG billing counters and active leases). Old code
   must never write to the new projection. Creating a new DB does not transfer this
   state automatically.
4. Deploy the reviewed Worker, verify queries, reports and ingestion progress, and
   purge old public OG/CDN caches once so prior long-lived responses cannot bypass
   the new visibility checks. Previously returned bytes cannot be recalled.
5. Keep `REPORTS_DB` fixed across future projection swaps. Do not roll old code back
   onto an already migrated projection; restore a matching backup/Worker tuple.
