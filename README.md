# atmo.rsvp

events for the open social web, built on atproto.

https://atmo.rsvp

uses `community.lexicon.calendar.event` and `community.lexicon.calendar.rsvp`.

features:

- event creation
- rsvp to events
- add your events to any ical compatible calendar
  (go to calendar/ when signed in and click "Add to your calendar")
- post your events/rsvps to bluesky or anywhere else with nice open-graph images
- display comments
- show what events your bsky follows are going to

## development

clone repo

```
pnpm install
```

set remote to false in `wrangler.jsonc` L22:

```
"remote": false
```

optionally if you want all current events to be displayed run this: (will take a few minutes)

```
pnpm backfill
```

start dev server:

```
pnpm run dev
```

## search (optional)

text search and "near me" are an opt-in feature backed by [meilisearch](https://www.meilisearch.com/). when it's not configured the app falls back to a d1 `LIKE` query for search and hides near-me, so you can skip this entirely.

to enable it locally, run a meili instance:

```
docker run -p 7700:7700 getmeili/meilisearch:v1.10
```

then set the search vars in `.env` (see `.env.example`):

- `SEARCH_URL` / `SEARCH_API_KEY` — the read path (search + near-me). use a read-only key. `SEARCH_INDEX` defaults to `events` and is the single index var shared by both paths.
- `SEARCH_SINK_URL` / `SEARCH_SINK_API_KEY` — the write path; the cron ingest forwards event records into the index. use the admin key. the index is `SEARCH_INDEX` (the sink writes the same index the read path reads).

the read and write keys are kept separate on purpose so the browser-facing read path never holds the admin key. the index is populated by the same cron ingest that fills d1, so once configured a `pnpm backfill` (or normal ingest) will fill it.

**rollout order on an existing deployment.** the sink only indexes records applied _after_ it's enabled, so don't turn on the read path first or existing upcoming events vanish from search until they're next touched. instead: (1) set the write vars and let the sink arm, (2) populate the index (see below) and confirm the meili `events` index count looks right, then (3) set the read vars (`SEARCH_URL` / `SEARCH_API_KEY`). until step 3 the app keeps using the d1 fallback, so search stays working throughout.

**populating the index.** backfill and refresh now feed the sink, so `pnpm backfill` fills meili as it walks each user's pds. on an existing deployment the event records are usually already in d1, so `pnpm meili:reindex` is faster: it replays the stored `community.lexicon.calendar.event` rows straight from d1 into the index with no network walk and no d1 writes. both paths apply the same discoverable filter as live ingest, and the sink applies the index settings on its first write, so a fresh index gets the right filterable fields and re-running either is idempotent. `pnpm meili:reindex:remote` targets the deployed d1 and needs the same wrangler `env.production` that `pnpm backfill:remote` uses.

### Near-me geocoding (optional)

Many events carry only a street address, no coordinates — so they never surface in near-me, which filters on the Meilisearch document's `_geo`. This resolves those addresses to coordinates and writes `_geo` back into the same index, making address-only events near-me-visible. It layers on top of the sink above: no extra service — it rides the existing cron and writes the same index. Leave it untouched and it runs keyless against public [Nominatim](https://nominatim.org/) at a safe trickle; until an address resolves, that event simply stays out of near-me.

**How it runs.** The cron already calls a geocode "drip" every minute; it self-throttles to once per ~30 min via a D1 marker, resolves up to 50 new addresses per run (25 on public Nominatim), and `PATCH`es `_geo` into Meilisearch. Every result is cached — including negative results, so an ungeocodable address isn't retried every run. There is nothing to set up: like the app's other D1 tables, the geocode cache and its cadence marker are defined in code and self-heal on first run. The drip no-ops entirely until the **write sink** above is configured, so enabling search is the only switch.

**Picking a geocoder.** The default is keyless public OSM Nominatim — fine for the steady-state drip's low volume. Set `GEOCODER_USER_AGENT` to a string identifying your deployment (Nominatim's [usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires a real contact; on the public host the per-run cap is held to 25 and the throttle floored to ≥1 req/s). For real volume — and for the bulk backfill below — use [LocationIQ](https://locationiq.com/) (an API-compatible hosted Nominatim): set `GEOCODER_URL=https://us1.locationiq.com/v1/search` and `GEOCODER_KEY`, which lifts the per-run cap to 50 and honors your `GEOCODE_SLEEP_MS` (minimum ms between calls, default 1100). A key with an unset or public `GEOCODER_URL` is *ignored* — you stay on public Nominatim — so always set the URL too.

**Backfilling an existing corpus.** The drip only trickles, so to resolve a backlog run the off-Cloudflare CLI against the deployed D1: `pnpm -C apps/web geocode:backfill --limit 50`. It reaches D1 over the REST API, so it needs `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` / `D1_DATABASE_ID` and `MEILI_URL` / `MEILI_KEY` (plus `SEARCH_INDEX` if not `events`), and a LocationIQ `GEOCODER_URL` / `GEOCODER_KEY`. It refuses a bulk or uncapped run against public Nominatim (keyless is capped to `--limit 1..25`). Useful flags: `--limit N` (`0` = no cap), `--dry-run`, `--retry-negative` (re-attempt negatively-cached addresses), and `--allow-public-nominatim` (override the public-host guard). Like search itself, geocoding only helps once the sink is feeding the index, so run this after the rollout steps above.

## contributing

open for contributions by all :)
