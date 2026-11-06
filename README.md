# atmo.rsvp

Events for the open social web, built on AT Protocol.

https://atmo.rsvp

Uses `community.lexicon.calendar.event` and `community.lexicon.calendar.rsvp`.
Create events, RSVP, subscribe to calendars, share previews and see what people
you follow are attending. Create automatically updated Bluesky starter packs from
an event's attendees, host and description mentions; see [starter packs](docs/starter-packs.md).
Attach Grain photo albums and Streamplace streams through the dedicated
[linked-record pickers](docs/linked-records.md).
Use [Meet](docs/meet.md) under Tools to exchange QR codes and save public,
reciprocal meeting records compatible with You & Me.
Public event and profile pages expose [AT Tags](docs/at-tags.md) for AT record and identity discovery.

## Development

```sh
corepack pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env
pnpm --filter web env:setup-dev
pnpm dev
```

D1 runs locally by default. Optionally fetch events with `pnpm --filter web backfill`.
Run `pnpm check`, `pnpm test`, and `pnpm build` to validate changes.
Shared event UI, types and helpers live in `@atmo-dev/kit/events` and `@atmo-dev/kit/events-data`, maintained in `00-atmo-kit/kit`. This repo owns the web app, adapters, routes and backend integrations; it no longer publishes a UI package.

Installs use the published `@atmo-dev/kit@0.7.1` security release. For local changes, build Kit with `pnpm prepack`, then run `pnpm kit:local` here. `pnpm kit:registry` restores the published version from the lockfile. Restart the dev server after switching modes.

`patches/@atmo-dev__kit@0.7.1.patch` preserves configurable AppView/CDN URLs until these changes are published in Kit. pnpm applies it automatically on install. External event poster support is now upstream and no longer patched. Remove the remaining patch once a published Kit release includes network configuration; local Kit checkouts also need `configureAtproto` exported from `events-data`.

Event descriptions are plain text with validated AT Protocol facet links, rendered by Kit without HTML or Markdown interpretation. Existing HTML/Markdown syntax is displayed literally; line breaks are preserved. Descriptions without facets detect plain-text links, mentions and hashtags. This fixes the former server-side sanitizer bypass. No record migration or backfill is needed.

Preferred social-app selections are cached per DID in browser `localStorage` for seven days, with an in-memory fallback when storage is blocked. Ordinary pages render without a PDS preference read; missing/expired entries refresh in the background, retaining stale values on failure. Settings always reads fresh data and updates the browser cache after a successful save. Changes made in another app appear after expiry or when opening Settings. Only the public preference is cached, never OAuth/session data; `/api/preferred-client` responses are private and `no-store`.

Event images prefer native `media`, then an HTTPS `poster.url`, then a URI named `Event Image` (used by laugh.town). The shared Kit helper validates external display URLs; OG rendering additionally limits server-side fetches to known laugh.town poster CDN paths without redirects. No scrape or backfill is required for records already containing these fields.

`pnpm test:e2e` runs atmo end to end on a private atproto network on your machine, in Docker.
A new person signs up at the network's PDS, publishes an event and shares it to Bluesky, others
RSVP, and the event's starter pack lists them. The network is described in
[snowglobe.yml](snowglobe.yml); the tests are in `apps/web/e2e`.

## Contributing

Open for contributions.
