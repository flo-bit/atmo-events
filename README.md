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

Installs use the published `@atmo-dev/kit@0.10.0` release without local patches. For local changes, build Kit with `pnpm prepack`, then run `pnpm kit:local` here. `pnpm kit:registry` restores the published version from the lockfile. Restart the dev server after switching modes.

## Contributing

Open for contributions.
