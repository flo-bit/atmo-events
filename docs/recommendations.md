# Homepage event recommendations

Signed-in visitors who authorize **Event recommendations** can see up to six
upcoming or ongoing events in **Events you might be interested in**, above the
popular-events list. The section appears only when at least two eligible events
are available. It streams independently of the rest of the homepage and is absent
while loading or when the integration is unavailable. The **Powered by For You**
link opens in a new tab. Ranking comes
from [For You](https://foryou.club/atmosphere), based on public activity, not on
geographic proximity. The follow-based activity section remains separate.

## Authentication

The client metadata declares this optional, method-specific permission:

```text
rpc:club.foryou.feed.getFeedSkeleton?aud=*
```

The OAuth audience is a wildcard; this authorizes only the named method but for
any service audience. The app checks that this scope is actually granted and
mints service JWTs only for `did:web:foryou.club`, not `*`. The scope check uses
`hasScopes`: the current OAuth library's RPC capability check requires a
`DID#service` audience, whereas For You's JWT audience is a bare DID.

The sign-in permission review selects it by default; users can deselect it.
Signup requests it along with the existing default permissions. Existing OAuth
sessions are not upgraded automatically or redirected: the section stays absent
until a subsequent authorization grants the permission.

The server checks the actual granted scope, then calls the viewer's PDS:

```text
com.atproto.server.getServiceAuth
  aud=did:web:foryou.club
  lxm=club.foryou.feed.getFeedSkeleton
  exp=<now + 60 seconds>
```

Only the resulting service JWT is sent as a Bearer token to
`https://foryou.club/xrpc/club.foryou.feed.getFeedSkeleton`, with
`nsid=community.lexicon.calendar.event&limit=100`. Redirects are refused. OAuth
credentials, JWTs and `feedContext` are never stored in the recommendation cache,
returned to the browser or included in logs. The privacy-policy draft describes
the external service and private ranking cache.

## Caching and refresh

A dedicated **local or production** `RECOMMENDATIONS_DB` D1 binding uses one
lazily initialized private table, `for_you_cache`, for DID-keyed ranked event
URIs and refresh/backoff state. No new secret is needed.

This binding must remain separate from both the rebuildable public index (`DB`)
and moderation storage (`REPORTS_DB`). Recommendations never read or write the
reports database. If dedicated storage is missing or aliased to either existing
binding, the integration fails closed instead of falling back or making an
uncached request. Its tables are not exposed through public Contrail queries.

Successful responses, **including empty feeds**, are cached for 24 hours per
viewer. Each refresh makes exactly one skeleton request; there is no pagination,
background polling, scheduler, or automatic retry. Failed refreshes keep previous
rankings and back off for one hour. Inactive users aren't refreshed.

Atomic D1 conditional writes deduplicate same-viewer refreshes across Workers.
Concurrent requests for the same viewer use cached ranks or an empty result
while the refresh is in progress. A crashed refresh also backs off for one hour.
Both HTTP requests have four-second timeouts. Primary-first D1 sessions keep
cache/refresh reads off stale replicas.

Different viewers may refresh concurrently. There is no global request gate,
queue, cooldown, or strict cross-user QPS limit; the daily per-user cache keeps
overall traffic low but does not prevent short bursts.

The actual OAuth grant is checked before reading cached recommendations too.
This deliberately retains the permission lookup on fresh cache hits: a reduced
grant must not keep showing previously cached personalized recommendations.

## Current event eligibility

Only bounded, syntactically valid DID-based event URIs are accepted, deduplicated
in rank order. On every homepage read, even a daily-cache hit, the app checks the
current Contrail index for:

- record existence;
- discovery preference;
- current record/account moderation hides;
- upcoming starts or an end time that has not passed.

The visibility query passes the entire URI list as one JSON parameter through
`json_each(?)`, plus two date parameters. Even a full 100-URI feed therefore uses
only three bound parameters, below D1's limit of 100. It then hydrates the first
six eligible records through the existing in-process Contrail client. No
arbitrary PDS hydration or remote backfill runs on page loads. Missing records
are skipped. Signed-in homepage responses are `private, no-store`;
rankings never use the shared public edge cache.

## Storage setup and deployment

`apps/web/wrangler.jsonc` binds `RECOMMENDATIONS_DB` to the provisioned
`atmo-events-recommendations` D1 database and pins its production `database_id`.
The binding keeps `remote: false`, so local development uses its own local D1
storage, not the production database.

Keep this database separate from the index and reports databases. Schema
creation is lazy; no manual schema migration or backfill is required. Creating
the database does not deploy the app. Reports and moderation records remain
untouched.

## Local development and verification

Vite development leaves the external integration off unless explicitly enabled.
To test real recommendations locally, add this to `apps/web/.env` and restart the
dev server:

```dotenv
FOR_YOU_ENABLED=true
```

Then sign in with **Event recommendations** selected. This contacts the public
For You service using your public-network account, but the cache still uses
**local D1**. Leave the setting unset for private Snowglobe
networks. `FOR_YOU_ENABLED=false` disables the integration in any environment;
production is enabled by default when the setting is absent.

Unit tests use mocked HTTP/PDS responses and real local SQLite for
cache/lease/visibility logic; browser tests use fixture events to exercise the
signed-in, signed-out, loading, populated and empty homepage states.

Run from the repository root:

```sh
corepack pnpm check
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

No production migration, backfill, or deployment is performed by these commands.
An authenticated live smoke test needs either a production-mode deployment or
local opt-in, and a viewer who has granted the new permission. Don't use
production sessions in fixtures.
