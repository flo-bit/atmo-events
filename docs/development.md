# Development notes

For local setup, see the [README](../README.md#development). The app uses SvelteKit 3 and `@svelte-atproto/oauth`.

Contrail runs in the same Cloudflare Worker as the app. Server queries call it in-process; no separate API Worker is needed. See [operations](operations.md) for ingestion, moderation, and deployment notes.

The UI uses the published `@atmo-dev/kit`. A normal install or CI build needs no sibling kit checkout.

For co-development, run the kit's `svelte-package --watch` and use `corepack pnpm kit:local` here before starting the app. `corepack pnpm kit:registry` restores the published version. Neither command changes manifests or the committed lockfile.

The app pins published Kit `0.2.1`, including `ReportDialog`, `LegalDocument`,
`LegalFooter`, the `@atmo-dev/kit/legal` authoring entry, and the Bluesky DID-link
fix. The event UI requires Kit `^0.2.1`. Normal frozen installs use this registry
release; no local override is needed. For further Kit co-development from this
nested checkout, build Kit and select it with
`ATMO_KIT_PATH=../../00-atmo-kit/kit corepack pnpm kit:local`.
See [legal pages](legal.md) for footer switches, app-owned policy snapshots, and
publication checks. The current policy pages are unpublished drafts.

Page titles have one owner: the root `apps/web/src/routes/+layout.svelte` uses the kit's `PageTitle` with `page.data.pageTitle` and `siteName="atmo.rsvp"`. Return `pageTitle` alongside existing route load data for a custom title; omit it for the site-name fallback (as on home). The root also selects error titles from `page.error`. Do not add `<title>` or `PageTitle` to individual pages, nested layouts, or `EventView`. Likewise, `apps/web/src/routes/(app)/+layout.svelte` owns the description and social meta tags: return `pageDescription` and `ogImage` from the route load instead of adding `<meta>` tags to pages, so link previews never see a generic tag before the page's own.

The app defaults to zinc + pink. Existing event-specific colors/backgrounds are retained. The event-specific UI stays in `packages/ui`; reusable controls, login, inline editing, post composition and comment presentation live in Atmo Kit.

Regenerate the favicon assets with `pnpm generate:favicons`. The script at `apps/web/scripts/generate-favicons.mjs` uses the logo's Sketchy Icons `CalendarDays` geometry on a pink-600 background. It writes the SVG, multi-size ICO (16/32/48), PNG fallback, Apple touch icon (180), web-app icons (192/512), maskable icon (512) and manifest to `apps/web/static/`. These generated files are committed; no image tooling runs in production. If changing the background color, also update `theme-color` in `apps/web/src/app.html`. Run `pnpm --filter web test:favicons` to check the assets.

Regenerate the default Open Graph image with `pnpm generate:og`. The script at `apps/web/scripts/generate-og.ts` combines the header's calendar icon and Figtree wordmark, the homepage's baked globe artwork, and its tagline into `apps/web/static/og.png` (1200 × 630). The PNG is committed and served statically; event-specific previews are unchanged. Install the generation browser once with `pnpm --filter web exec playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chrome/Chromium executable.

Checks:

```sh
pnpm check
pnpm test       # app tests + Chromium event UI / accessibility tests
pnpm build
pnpm package:ui
```

For a fresh browser-test installation, run `pnpm --filter @atmo-dev/events-ui exec playwright install chromium` once. The UI tests use in-memory adapters: they never publish events, posts or RSVPs. `VITE_REVIEW_SCREENSHOTS=1 pnpm --filter @atmo-dev/events-ui test` also captures event editor/detail screenshots in both themes and at mobile/desktop sizes.

The shared kit is MIT-licensed. Publish a compatible kit version before updating the app dependency/lockfile or publishing `@atmo-dev/events-ui`. CI always uses the committed registry dependency graph.

## Search

Text search uses Contrail's D1 FTS5 index. User-entered terms are escaped as
literal, all-terms queries; topic expressions retain their server-owned OR
semantics. No external search service, near-me index, geocode drip or search
reindex job is required. The optional Nominatim-compatible geocoder remains
available for interactive address entry and maps; see
[`.env.example`](../apps/web/.env.example).

## Cities

`/cities` shows the **top 20 cities by upcoming event count**, highest first. The limit is `TOP_CITIES_LIMIT` in `apps/web/src/lib/cities.ts`. The existing cron builds one **global daily snapshot** of the catalog and each city's ordered `[event URI, startsAt]` membership. There is no new event index, geocoder, or backfill. Cron self-creates `city_snapshot_state` and `city_snapshot_data`; a persisted lease prevents overlapping builders, and the current-version pointer is published only after all payloads have been written. A failed refresh preserves the last good snapshot.

Only an address's supplied `locality` is used (including untyped legacy addresses). A small snapshot-time normalization layer merges Unicode case/whitespace, ISO country codes/names, and known regional abbreviations (US states, Canadian provinces, Dutch provinces, and UK constituent countries). Recognizable locality suffixes such as `Boulder, Colorado, 80302` become `Boulder / US / Colorado`. Conflicting suffixes, unparseable comma-addresses, and obvious placeholders are omitted rather than guessed. A missing region can join a known region only when the supplied city/country has exactly one known region among current upcoming events; different known regions/countries remain separate.

Normalization happens **before** ranking and limiting. Original address variants are grouped in D1, then their event URIs are unioned so an event counts only once per normalized city, even with several equivalent addresses. Catalog metadata and per-city membership are stored separately in bounded text chunks. Immutable snapshot payloads are edge-cached for 24 hours; the small current-version pointer is cached for five minutes. An edge miss reads snapshot rows, never rebuilds the catalog or scans upcoming events. Production requests do not create schema or refresh snapshots; before the first successful cron, the overview reports unavailable and city lists remain empty. Vite bootstraps snapshots locally because it has no scheduled invocations.

City pages paginate the cached membership and hydrate only the page's candidate URIs through existing primary keys. Event bodies, RSVP counts, and profiles remain live; live time, discoverability, physical-mode, and address checks remove records that were deleted, hidden, moved away, or made virtual. Refilling is bounded to 60 candidate URIs per request, so a short/empty page can still offer load-more. New events, newly matching cities/addresses, counts, and date ordering wait for the next daily snapshot (plus up to five minutes for the head cache); membership/order can therefore be stale even though card details are current.

City cursors contain a snapshot ID and offset, scoped by city/country/region. Old snapshots are retained for three days so a daily refresh never shifts an in-flight pagination walk; expired or malformed cursors end pagination rather than restart. The original no-URI city pipeline remains available for older API consumers, but the UI uses only bounded URI hydration.

Blank localities, explicitly virtual events, events hidden from discovery, and moderated records/accounts are excluded. Aggregate counts and snapshot membership apply moderation at refresh time; card hydration always checks current visibility. Upcoming means `startsAt >= now`, not ongoing, and does not require `endsAt`. City pages use snapshot start-time order with URI tie-breaking, carrying the city/country/region through load-more. No publisher records are modified. Coordinates, H3, venue names, and street text do not supply a missing city. This is text cleanup, not a geographic gazetteer: unrelated spellings such as `Munich` versus `München` and unrecognized region aliases are not guessed. Events without a usable city remain available elsewhere in discovery.

## Load-more pagination

Every paginated list — the home feed, a profile's hosting and past events, a topic, a city, and search — is defined once in `queries.ts` and continued by one shared mechanism.

**One definition, two entry points.** Page 1 runs in a route's `load()`, which has `url`/`params`; load-more runs in a remote command, which has only a cursor. A keyset is specific to the query that produced it, so page 2 is adjacent to page 1 only while every filter, sort, bound and limit agrees. Both entry points therefore call the same definition, which also owns any post-filter and mints the envelope that continues it.

**The envelope.** The continuation cursor is an opaque `base64url(JSON { v, q, args?, raw })`. `q` names the server-side query (`events`, `happening-now`, `hosting`, `past-events`, `topic`, `city`, `search-d1`); `args` carries only public-safe scope (profile actor, topic slug, city/country/region, popular toggle); `raw` is a Contrail keyset or a city snapshot ID/offset. The client echoes the whole token back unchanged and supplies no filters of its own. Retired Meilisearch cursors end pagination without a read.

**Why that's safe.** Every filter value lives in the query definition, so a tampered token can only name another already-public query or fail to decode; the unlisted-inclusive plain `listRecords` pipeline has no registry entry, so no cursor reaches it. `decodeCursor` never throws — anything malformed, including a pre-envelope `meili:`/`d1:` cursor, just ends pagination. A deep-linked `?cursor=` resumes only when the envelope was minted for the same `q` **and** the same scope, since a `/topics/ai` keyset indexes a different result set than a `/topics/technology` one. Search never resumes a deep link at all: its term rides `?q=`, not the envelope, so an inbound cursor can't be proven to match the route's term.

**Stable ties.** Published Contrail includes the record URI as the final tie-breaker for record-field sorts (such as `startsAt`); no package patch is needed. Backfilled events can share both `startsAt` and `time_us`; without the URI, a page boundary silently skips some of them. Native cursors carry that URI; pre-migration native cursors without it restart at page one under the published release. This requires no schema change or reindex.

**The pieces.** `queries.ts` defines each list and mints its envelope. `cursor.ts` encodes/decodes envelopes and validates public scope. `events-load-more.ts` holds the resumer registry: it validates a decoded envelope's args and names which query to continue. Each route's `+page.server.ts` calls its query for page 1 and adds whatever else that page renders; `EventList.svelte` echoes the token on "load more" — keyed on the cursor, not on the page having events, since a query with a post-filter (`past-events`) can return a short or empty page while more pages remain. Adding a list means defining its query and registering it.
