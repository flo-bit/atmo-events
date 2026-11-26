# Notifications

RSVP embeds `@atmo-dev/notify` in the existing SvelteKit Worker. There is no relay,
extra Worker, queue, email service, new lexicon or invite implementation.

## Storage and access

Notifications have their own stable D1 database, bound as **NOTIFY_DB**. It holds
the library's private `notify_*` tables and RSVP's `rsvp_watched_events` and
`rsvp_pending_rsvps`. `DB` remains the disposable Contrail projection and
`REPORTS_DB` holds only moderation reports. Never swap, rebuild or backfill
NOTIFY_DB as though it were a projection. Tables are created idempotently on first
use; there is no migration command.

Create the production database once and put its id in `apps/web/wrangler.jsonc`
(the committed id is a placeholder, so this branch cannot deploy until then):

```sh
pnpm --filter web exec wrangler d1 create atmo-events-notifications
```

Signed-in page loads enroll the viewer through `GET /api/notify/inbox`; a direct
visit to `/notifications` also enrolls server-side. Only enrolled DIDs receive an
inbox. Anonymous callers cannot initialize or read storage through this API.
Every operation uses the request's session DID. Inbox, read-state, preference and
subscription responses are `private, no-store`; none are public cached projections.
Mutation requests require JSON and reject cross-origin browser origins.

`/notifications` shows the postbox, read state and pagination. `/settings/notifications`
uses Kit's `NotificationSettings` and `NotificationPushToggle`. `NotificationList`
is also shared Kit UI; RSVP owns only data fetching, routing and browser wiring.

Categories can be off (future sends dropped), in-app only, or in-app plus push.
Existing inbox entries remain when a category is disabled. Queued delivery retries
also respect current channel settings. Preferences/read state are private app DB
data, not public records. Re-enabling restores the app default without replaying
skipped notifications. The first badge request enrolls the account; subsequent
badge polls read only the unread count.

## Triggers

The existing every-minute cron runs triggers after ingestion, then delivery, which
continues even if triggers fail. Work follows the records that changed and the
events enrolled accounts care about, not the number of accounts or of events on
the network. Code is in `apps/web/src/lib/notifications/`:

- `feed.ts` reads Contrail's `record_versions` for rows indexed since the last
  tick, one indexed query per operation. It is the only code that knows Contrail's
  tables. Only live sources (Jetstream and PDS notify) are read, and a new
  projection epoch restarts the feed from now, so backfills and rebuilds notify
  nobody. Rows become visible once they are 45 seconds old.
- `watched.ts` owns `rsvp_watched_events`: one row per event that an enrolled
  account responded to, or hosts with at least one response. A new account's
  existing upcoming events are added by the cron, five accounts per tick.
- `triggers.ts` holds the three rules below. Content is always loaded through the
  public Contrail API, so moderation decides what is visible.
- `process.ts` runs one tick: feed, then triggers.

The rules:

- **Reminders:** hosts and attendees (going or interested) of a watched event in
  its last 15 minutes, unless cancelled or postponed. One per event and start
  time; a moved start allows another. Attendees are paged 200 per event per tick.
  Responses that arrive after an event's audience was processed get no reminder.
  Push stops at the event start; the inbox keeps the item.
- **Changes:** a watched event's new version is compared with one stored snapshot
  per event: name, start/end, locations, links, mode and status. Other edits do
  not notify. Attendees are told, not the host. The first sighting of an event is
  a baseline. Events stay watched for seven days after they start.
- **Host RSVPs:** a new or edited positive response to an enrolled host's event.
  Excludes the host's own response and declines. One notification per attendee
  and event, however many records they wrote.

Per tick: up to 2,000 feed rows per operation, 25 event checks, 10 change
fan-outs, 25 due reminders, 30 host RSVPs, and 50 push attempts (earliest deadline
first; in-app-only items need none). A failed event check, fan-out page or host
RSVP is retried on later ticks, least recently tried first, without holding up
the rest; host RSVPs are dropped after seven days. Inbox and delivery history are
kept 90 days.

Limits to know:

- `record_versions` keeps one row per record, so several edits between ticks
  arrive as one, and an edit that is reverted in between is not seen.
- A deleted or hidden event is never treated as a cancellation; only an explicit
  cancelled status is.
- Newly created events are not read from the feed, since nobody can have
  responded yet. A record deleted and recreated under the same key is therefore
  not rechecked until its next edit.
- Latency is about one to two minutes plus push delivery. Faster needs Contrail's
  change log, which currently requires a fresh projection.

Query plans and row counts were checked against a local copy of the projection
(106,000 events, 8,400 responses), not production: the feed and audience queries
use existing indexes and read only new or matching rows.

## Web push setup

In-app notifications work without VAPID. Push UI/routes are available only when all
three bindings are present:

- `VAPID_PUBLIC_KEY`: base64url P-256 public key (safe for browsers).
- `VAPID_PRIVATE_JWK`: secret JSON private JWK.
- `VAPID_SUBJECT`: an operator contact URI, e.g. `mailto:you@example.com`.

Generate once with the package's `notify-vapid` CLI (from the notify workspace:
`node packages/notify/bin/vapid.js`). Keep the key pair stable;
rotating it requires devices to unsubscribe and subscribe again. For local testing,
put these bindings in untracked `apps/web/.dev.vars` (not just `.env`). For local
loopback login, also set `OAUTH_PUBLIC_URL=` **empty** in `.dev.vars` to override
the production Wrangler var. Do not set it to `http://127.0.0.1:5454`: any explicit
origin selects confidential OAuth, which requires publicly reachable HTTPS
metadata. Copy the generated OAuth secrets from `.env` into `.dev.vars` if needed.
Open `http://127.0.0.1:5454`, not `localhost`, and fully restart Vite after changing
bindings (HMR does not reliably reset the cached auth client). Only set an explicit
HTTPS origin when intentionally using a public dev tunnel. For production,
configure the public key/contact as Worker vars and set the private JWK with
`wrangler secret put VAPID_PRIVATE_JWK`. Do not commit generated values.
No production secret/resource changes have been made by this branch.

SvelteKit builds `/service-worker.js`, but automatic registration is disabled.
The signed-in app registers it when VAPID is configured. The worker handles pushes
and clicks, not page caching or fetch interception. Clicking a push opens its
destination without replacing an unrelated tab. Browser permission is requested
only on an explicit enable click. Existing subscriptions follow the active account.
Sign-out waits for in-flight push setup, unsubscribes locally first, and attempts
server cleanup without requiring it to succeed. The push service can later report
revoked endpoints as gone. Pending deliveries cannot follow a reassigned target. Already displayed or
push-service-accepted notifications cannot be recalled. On shared devices, use
separate browser profiles when notification content must not be visible to others.

Use a secure origin (loopback works for local development). iOS/iPadOS generally
requires an installed Home Screen web app. Safari/Firefox/iOS and real deployed
Worker push delivery still need platform verification; unit/browser fixtures are
not evidence of those platforms. RSVP's authenticated OAuth-to-push end-to-end
flow is not yet verified with a real account (the package's separate example had
local Chrome push verification). Push payloads contain event titles/details, not
blanket-stripped content. All current sources here are public; private Spaces
notifications need their own authorization and data integration first.

## Unpublished dependencies

This branch includes a small, portable snapshot of `@atmo-dev/notify` under
`vendor/` so a clean `pnpm install --frozen-lockfile` works without
machine-specific links or publishing `@atmo-dev/notify` yet. See
`vendor/README.md`. Replace the `file:` dependency with the registry release
once `@atmo-dev/notify` is published. Do not deploy with a stale snapshot after
editing the notify library.

Local Kit iteration still supports `ATMO_KIT_PATH=/absolute/path pnpm kit:local`
and `pnpm kit:registry`. Repack notify after changes; neither application build
nor local Kit switching automatically rebuilds library distributions.
