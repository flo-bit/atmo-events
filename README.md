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
See [development notes](docs/development.md) and [operations](docs/operations.md) for details.

`pnpm test:e2e` runs atmo end to end on a private atproto network on your machine, in Docker.
A new person signs up at the network's PDS, publishes an event and shares it to Bluesky, others
RSVP, and the event's starter pack lists them. The network is described in
[snowglobe.yml](snowglobe.yml); the tests are in `apps/web/e2e`.

## Contributing

Open for contributions.
