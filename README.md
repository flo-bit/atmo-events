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

Requires Node.js **22.17+** and the pinned pnpm version. The app uses SvelteKit 3 and `@svelte-atproto/oauth`.

The UI uses the published `@atmo-dev/kit@0.0.2`. A normal install or CI build needs no sibling kit checkout:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

For co-development, run the kit's `svelte-package --watch` and use `corepack pnpm kit:local` here before starting the app. `corepack pnpm kit:registry` restores the published version. Neither command changes manifests or the committed lockfile.

Page titles have one owner: the root `apps/web/src/routes/+layout.svelte` uses the kit's `PageTitle` with `page.data.pageTitle` and `siteName="atmo.rsvp"`. Return `pageTitle` alongside existing route load data for a custom title; omit it for the site-name fallback (as on home). The root also selects error titles from `page.error`. Do not add `<title>` or `PageTitle` to individual pages, nested layouts, or `EventView`. Likewise, `apps/web/src/routes/(app)/+layout.svelte` owns the description and social meta tags: return `pageDescription` and `ogImage` from the route load instead of adding `<meta>` tags to pages, so link previews never see a generic tag before the page's own.

The app defaults to zinc + pink. Existing event-specific colors/backgrounds are retained. The event-specific UI stays in `packages/ui`; reusable controls, login, inline editing, post composition and comment presentation live in Atmo Kit.

Regenerate the favicon assets with `pnpm generate:favicons`. The script at `apps/web/scripts/generate-favicons.mjs` uses the logo's Sketchy Icons `CalendarDays` geometry on a pink-600 background. It writes the SVG, multi-size ICO (16/32/48), PNG fallback, Apple touch icon (180), web-app icons (192/512), maskable icon (512) and manifest to `apps/web/static/`. These generated files are committed; no image tooling runs in production. If changing the background color, also update `theme-color` in `apps/web/src/app.html`. Run `pnpm --filter web test:favicons` to check the assets.

Checks:

```sh
pnpm check
pnpm test       # app tests + Chromium event UI / accessibility tests
pnpm build
pnpm package:ui
```

For a fresh browser-test installation, run `pnpm --filter @atmo-dev/events-ui exec playwright install chromium` once. The UI tests use in-memory adapters: they never publish events, posts or RSVPs. `VITE_REVIEW_SCREENSHOTS=1 pnpm --filter @atmo-dev/events-ui test` also captures event editor/detail screenshots in both themes and at mobile/desktop sizes.

The shared kit is MIT-licensed. Publish a compatible kit version before updating the app dependency/lockfile or publishing `@atmo-dev/events-ui`; its kit peer dependency currently targets `^0.0.2`. CI always uses the committed registry dependency graph.

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

**Picking a geocoder.** The default is keyless public OSM Nominatim — fine for the steady-state drip's low volume. Set `GEOCODER_USER_AGENT` to a string identifying your deployment (Nominatim's [usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires a real contact; on the public host the per-run cap is held to 25 and the throttle floored to ≥1 req/s). For real volume — and for the bulk backfill below — use [LocationIQ](https://locationiq.com/) (an API-compatible hosted Nominatim): set `GEOCODER_URL=https://us1.locationiq.com/v1/search` and `GEOCODER_KEY`, which lifts the per-run cap to 50 and honors your `GEOCODE_SLEEP_MS` (minimum ms between calls, default 1100). A key with an unset or public `GEOCODER_URL` is _ignored_ — you stay on public Nominatim — so always set the URL too.

**Backfilling an existing corpus.** The drip only trickles, so to resolve a backlog run the off-Cloudflare CLI against the deployed D1: `pnpm -C apps/web geocode:backfill --limit 50`. It reaches D1 over the REST API, so it needs `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` / `D1_DATABASE_ID` and `MEILI_URL` / `MEILI_KEY` (plus `SEARCH_INDEX` if not `events`), and a LocationIQ `GEOCODER_URL` / `GEOCODER_KEY`. It refuses a bulk or uncapped run against public Nominatim (keyless is capped to `--limit 1..25`). Useful flags: `--limit N` (`0` = no cap), `--dry-run`, `--retry-negative` (re-attempt negatively-cached addresses), and `--allow-public-nominatim` (override the public-host guard). Like search itself, geocoding only helps once the sink is feeding the index, so run this after the rollout steps above.

## Cities

`/cities` shows the **top 20 cities by upcoming event count**, highest first. The limit is `TOP_CITIES_LIMIT` in `apps/web/src/lib/cities.ts`. It reads the existing event records in D1 and caches the ranking at the edge for five minutes; there are no city tables, migrations, backfills, geocoders, or scheduled refresh jobs.

Only an address's supplied `locality` is used (including untyped legacy addresses). A small request-time normalization layer merges Unicode case/whitespace, ISO country codes/names, and known regional abbreviations (US states, Canadian provinces, Dutch provinces, and UK constituent countries). Recognizable locality suffixes such as `Boulder, Colorado, 80302` become `Boulder / US / Colorado`. Conflicting suffixes, unparseable comma-addresses, and obvious placeholders are omitted rather than guessed. A missing region can join a known region only when the supplied city/country has exactly one known region among current upcoming events; different known regions/countries remain separate.

Normalization happens **before** ranking and limiting. Original address variants are grouped in D1, then their event URIs are unioned so an event counts only once per normalized city, even with several equivalent addresses. The cached catalog contains only labels, counts, and original address variants—not event URIs or records. Ranking and city pages share that one cache. City filtering uses its variants in SQL **before** keyset pagination, not just cosmetic deduplication of the tiles.

Blank localities, explicitly virtual events, and events hidden from discovery are excluded. Upcoming means `startsAt >= now`, not ongoing, and does not require `endsAt`. City pages list the same set, soonest first, carrying the city/country/region through load-more. No publisher records are modified. Coordinates, H3, venue names, and street text do not supply a missing city. This is text cleanup, not a geographic gazetteer: unrelated spellings such as `Munich` versus `München` and unrecognized region aliases are not guessed. Events without a usable city remain available elsewhere in discovery.

## Load-more pagination

Every paginated list — the home feed, a profile's hosting and past events, a topic, a city, and search — is defined once in `queries.ts` and continued by one shared mechanism.

**One definition, two entry points.** Page 1 runs in a route's `load()`, which has `url`/`params`; load-more runs in a remote command, which has only a cursor. A keyset is specific to the query that produced it, so page 2 is adjacent to page 1 only while every filter, sort, bound and limit agrees. Both entry points therefore call the same definition, which also owns any post-filter and mints the envelope that continues it.

**The envelope.** The continuation cursor is an opaque `base64url(JSON { v, q, args?, raw })`. `q` names the server-side query (`events`, `hosting`, `past-events`, `topic`, `city`, `search-d1`, `search-meili`); `args` carries only public-safe scope (profile actor, topic slug, city/country/region, popular toggle); `raw` is the backend-native cursor — a D1 keyset, or a Meilisearch offset that `tagCursor` prefixes as `meili:<n>`. The client echoes the whole token back unchanged and supplies no filters of its own. Naming the query is what keeps a cursor with its backend: read a D1 keyset as a Meili offset and `Number(base64url)` is `NaN`, which collapses to offset 0 — page 1 again, silently.

**Why that's safe.** Every filter value lives in the query definition, so a tampered token can only name another already-public query or fail to decode; the unlisted-inclusive plain `listRecords` pipeline has no registry entry, so no cursor reaches it. `decodeCursor` never throws — anything malformed, including a pre-envelope `meili:`/`d1:` cursor, just ends pagination. A deep-linked `?cursor=` resumes only when the envelope was minted for the same `q` **and** the same scope, since a `/topics/ai` keyset indexes a different result set than a `/topics/technology` one. Search never resumes a deep link at all: its term rides `?q=`, not the envelope, so an inbound cursor can't be proven to match the route's term.

**Stable ties.** The existing Contrail appview patch adds the record URI as the final tie-breaker for record-field sorts (such as `startsAt`). Backfilled events can share both `startsAt` and `time_us`; without the URI, a page boundary silently skips some of them. New native cursors carry that URI, while legacy cursors without it are still accepted. This requires no schema change or reindex.

**The pieces.** `queries.ts` defines each list and mints its envelope. `cursor.ts` encodes/decodes envelopes and tags backend cursors. `events-load-more.ts` holds the resumer registry: it validates a decoded envelope's args and names which query to continue. Each route's `+page.server.ts` calls its query for page 1 and adds whatever else that page renders; `EventList.svelte` echoes the token on "load more" — keyed on the cursor, not on the page having events, since a query with a post-filter (`past-events`) can return a short or empty page while more pages remain. Adding a list means defining its query and registering it.

## contributing

open for contributions by all :)
