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

## contributing

open for contributions by all :)

