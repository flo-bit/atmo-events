# Event starter packs

The **Starter pack** button above attendees creates a Bluesky pack on first click
and opens the same pack thereafter. Anyone can click it: no login, attendee
opt-in or organizer OAuth grant. The button is shown when `BOT_IDENTIFIER` and
`BOT_APP_PASSWORD` are configured. It reuses the reply bot and `BOT_PDS_URL`.

## Membership

Members are the host, description mentions, and both Going and Interested RSVPs
(not Not going). Mention facets supply stable DIDs; unfaceted `@handle` tokens
are resolved as a fallback, including partially-faceted imported descriptions.

Membership is deduplicated and silently capped at **500**: host and mentions
have priority, followed by existing eligible members, then remaining attendees.
Vacancies are filled on refresh. Bluesky's reference-list opt-out records are
never modified or bypassed; an eligible opted-out person's existing listitem
is not deleted/recreated just because the AppView omits them.

## Storage and refresh

All pack-management state lives in the bot's atproto repository, not new D1/KV
tables. The existing event/RSVP projection is still used as the read source.

- `rsvp.atmo.eventStarterPack/<sha256>` maps the full canonical DID-based event URI
  to its list and pack, plus attempt/success timestamps. Its Lexicon is checked
  in at `apps/web/lexicons/custom/rsvp/atmo/eventStarterPack.json`.
- Pack, reference list and listitems use ordinary Bluesky TID keys. An atomic
  repository batch with a commit precondition prevents concurrent first clicks
  from publishing duplicates. All bot reads go directly to its PDS, not the
  eventually consistent Bluesky AppView.
- The one-minute cron lists the mapping collection and refreshes up to five due
  packs per tick, with a five-minute refresh interval. It fully paginates RSVPs
  and bot repository records. Writes are batched at no more than 200 operations;
  interrupted changes resume on the next refresh.
- Source reads share a ten-second budget, with at most four mention resolutions
  in flight and five seconds per resolution. Results retain description order.
  Each pack operation shares a twenty-second budget across retries/batches;
  each cron refresh shares thirty seconds across mapping reads and all packs.
  Expiry cancels outstanding requests and fails closed, with a separate bounded
  attempt to persist retry backoff before continuing the other cron jobs.

Refresh adds/removes people and updates the event name/link without changing the
pack URL. Failed/incomplete source reads never trigger membership removals.
Failed attempts get retry backoff in the mapping record. Deleted/hidden source
events or manually deleted managed packs are not automatically republished;
refresh fails safely and leaves existing bot records unchanged. Existing pack
links remain openable during an RSVP-index outage.

Keep the bot's DID/repository stable across deployments. Changing accounts means
a separate registry. Existing mappings require no database migration/backfill.

## Operations

`STARTER_PACK_RATE_LIMITER` in `wrangler.jsonc` limits the public command to ten
requests per minute per client IP. The server accepts only a canonical event URI,
never client-supplied bot record contents, repositories or membership.

Read-only clicks do not rewrite the bot's KV session. New/rotated credentials
are saved once; writes are serialized and spaced within an isolate, with up to
three jittered retries for KV throttling from other isolates.

Tests use an in-memory PDS and callbacks and never create live packs. The first
Bluesky visit waits briefly for AppView indexing before opening the pack. If the
AppView is slow/unavailable, the published URL is still returned without creating
another pack; it may need reloading once indexing catches up.
No live starter packs are created by building or deploying the app.
