# atmo.rsvp

Events for the open social web, built on AT Protocol.

https://atmo.rsvp

Uses `community.lexicon.calendar.event` and `community.lexicon.calendar.rsvp`.
Create events, RSVP, subscribe to calendars and share previews. Create
automatically updated Bluesky starter packs from an event's attendees, host and
description mentions; see [starter packs](docs/starter-packs.md).
Attach Grain photo albums and Streamplace streams through the dedicated
[linked-record pickers](docs/linked-records.md).
Use [Meet](docs/meet.md) under Tools to exchange QR codes and save public,
reciprocal meeting records compatible with You & Me.

[Notifications](docs/notifications.md) adds a private inbox, event reminders,
event-change alerts and host RSVPs in the existing Worker. Push is optional and
requires VAPID bindings; in-app notifications work without them. No invites or
new lexicons are included.

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

Installs use the published `@atmo-dev/kit@0.22.0` and `@atmo-dev/contrail@0.33.0` releases without local patches. Until `@atmo-dev/notify` is published, this branch uses a portable snapshot in `vendor/` (see [notification setup](docs/notifications.md)), so clean installs do not require sibling checkouts. Event pages render the hydrated attendee preview and load the larger lists only when a list is opened. For local changes, build Kit with `pnpm prepack`, then run `pnpm kit:local` here. `pnpm kit:registry` restores the published version from the lockfile. Restart the dev server after switching modes.

## Contributing

Open for contributions.
