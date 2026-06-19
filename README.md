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

**populating the index.** backfill and refresh now feed the sink, so `pnpm backfill` fills meili as it walks each user's pds. on an existing deployment the event records are usually already in d1, so `pnpm meili:reindex` is faster: it replays the stored `community.lexicon.calendar.event` rows straight from d1 into the index with no network walk and no d1 writes (add `:remote` to target the deployed d1). both paths apply the same discoverable filter as live ingest, so re-running either is idempotent.

## contributing

open for contributions by all :)

