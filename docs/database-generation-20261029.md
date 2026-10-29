# Database preparation — 2026-10-29

These are separate D1 databases in Western Europe. Preparation does not deploy
or change the running Worker's bindings.

| Binding                             | Database                        | ID                                     |
| ----------------------------------- | ------------------------------- | -------------------------------------- |
| `DB` (new projection)               | `atmo-events-records-g20261028` | `2e4b6ea4-6c67-444a-b37d-73594c5b2c01` |
| `REPORTS_DB` (stable private state) | `atmo-events-reports`           | `451dce30-46b2-4e2d-a09c-f7ed4ccdfc4c` |
| Old production projection, retained | `atmo-events-v5`                | `3f862040-84ee-4216-8ba7-ef3146058de4` |

The generation name reflects the October 28 local session; creation occurred
October 29 UTC. Keep `REPORTS_DB` stable when replacing projections.

## Acquisition and import

- Used the app's pinned Contrail review tarball, generated validation Lexicons,
  and complete event/RSVP/profile/follow configuration; no features were omitted.
- Captured Jetstream v2 sequence `26550359876` at `2026-10-29T01:13:29Z` **before**
  discovery/backfill, pinned to `https://jetstream.us-east.bsky.network` and epoch
  `atmo-events-records-g20261028`. A timestamp is not a substitute for a v2 sequence.
- Built native SQLite with `contrail backfill --sqlite`: 100 identity resolutions,
  20 hosts, three accounts/host, one immediate attempt. Retried at 30/10/2 limits.
- The initial pass took 324 seconds; retry pass took 46 seconds. Of 2,380 discovered
  accounts, 2,316 completed and 64 remain scheduled for retries. Remaining failures
  are unavailable repositories/PDSes and upstream/network errors, not omitted work.
- Replayed from the captured boundary past an independently observed live target.
- Snapshot totals: 105,937 events, 8,422 RSVPs, 89,381 follows, 1,860 profiles,
  205,603 canonical version rows, and 105,937 FTS rows.
- Prepared 46 hash-checked SQL parts, approximately 350 MiB total, each at most
  8 MiB. Inserts contain at most 40 rows and approximately 48 KB of values.
  Two rows exceeded D1's 100 KB SQL-statement limit; bounded staging fragments
  assemble those values before their final insert. Logical FTS rows are exported,
  not SQLite shadow tables or writable-schema operations.
- Reconstructed all parts into another SQLite database and verified exact logical
  contents of all 40 application tables, including FTS rowids and CR/LF content,
  plus integrity/foreign-key checks, before upload.

Cloudflare `cf` handles resource creation and SQL queries. Bulk SQL uploads use
Wrangler's `d1 execute --file` because the installed `cf` exposes query/batch APIs,
not the bulk-file import command. Each uploaded part writes a durable hash receipt;
resume checks the destination ID and remote receipts, not only local success files.
Imports and index creation incur normal D1 reads/writes.

Remote verification confirmed all 46 part receipts and all 40 snapshot table
counts. Five exact content checks passed, including CR/LF FTS content and the
oversized FTS/JSON rows. A subsequent remote ingest advanced the captured
snapshot cursor `26550553180` to `26550784546`, past an independently observed
live target (`26550771765`) at `2026-10-29T01:29:53Z`. In-process Contrail smoke
tests against the remote candidate returned 200 for upcoming events, event
lookup, literal hashtag search, RSVP listing and cursor status. The disabled
public report procedure returned 404 as expected.

Successful bulk-import responses reported 5,209,962 reads and 3,576,761 writes,
with approximately 50.5 seconds of aggregate SQL duration. These figures exclude
verification, reports setup, app-state transfer and catch-up, and are not an
invoice or a whole-operation usage total.

## Published-release compatibility

The app now pins registry release `@atmo-dev/contrail@0.27.0`; the temporary
review tarball has been removed. Initializing a copy of the prepared snapshot
with this release preserved the record/FTS/version counts, bot/budget rows,
backfill progress, source epoch and checkpoint. Event, hashtag-search and RSVP
queries passed on that copy; all 432 web tests, type checks and build passed.
Local release evidence is in `.contrail/release-0.27.0/`.

## Non-reconstructible state

The snapshot includes the old database's 10 bot deduplication records and OG
billing counters. Active OG leases are copied when present. Private Spaces tables
were empty; the old database remains untouched. Cached projection rows from
unavailable repositories were not copied into the new generation.

The deployed Worker's cron automatically resumes record ingestion from the
stored Jetstream checkpoint and retries deferred accounts. A pre-deployment
catch-up only reduces initial lag; it is not a separate recurring maintenance
requirement. The checkpoint must still be within retained source history.

Bot deduplication and OG billing state are not AT Protocol records, and the two
D1 databases do not replicate. Old production can still change that state until
cutover. This is a one-time transfer for the database replacement, not ongoing
manual maintenance. With old writers stopped, repeat it immediately before deployment:

```sh
python3 .contrail/provision-20261029/sync-app-state.py
```

This local-only script writes **only the new DB**, preserving monotonic billing
counters. It is not a substitute for stopping concurrent old writers.

## Local artifacts and cutover

Private data, SQLite snapshots, SQL parts, scripts, manifests, and logs are under
`.contrail/provision-20261029/` and ignored by Git. They are local operational
artifacts, not checked-in source or credentials.

Before deploying:

1. Keep the tested `0.27.0` release pinned; rerun compatibility checks if changing
   the package used to initialize this DB.
2. Confirm remote import/count/content verification and a recent remote catch-up.
   If staging outlasts the source's retained history, revalidate continuity and
   rebuild if necessary; never reset the cursor to conceal a gap.
   Local evidence files are `remote-count-verification.json`,
   `remote-content-verification.json`, and `remote-status.json`.
3. Stop old writers, refresh bot/budget state, then deploy the reviewed Worker
   against the new bindings. Do not deploy the old Worker code against the new DB.
4. Verify public queries, checkpoint advancement, and scheduled retries. Keep
   report buttons hidden until reporting is intentionally enabled; moderator DIDs
   are still empty. Purge old public OG/CDN caches once for visibility enforcement.
5. Keep the old Worker/database tuple for rollback. Never roll old code onto the
   new projection. Reports remain in the same stable `REPORTS_DB` either way.

No public report UI or moderator identity is enabled by database creation.
