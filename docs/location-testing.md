# Testing event locations

These are real public events, not synthetic fixtures. Open the local links to test the new UI; the public site won't show these changes until deployed.

| Coverage                           | Event                            | Local link                                                                              | Public record                                                                    |
| ---------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Coordinates + address + Foursquare | A Zine of One's Own              | [Open locally](http://localhost:5454/p/laugh.town/e/3mwbuwrpiv2tb)                      | [atmo.rsvp](https://atmo.rsvp/p/laugh.town/e/3mwbuwrpiv2tb)                      |
| Geo only, no address               | Mother & Daughter Women's Circle | [Open locally](http://localhost:5454/p/dandelion.events/e/3myuxrry2jw2c)                | [atmo.rsvp](https://atmo.rsvp/p/dandelion.events/e/3myuxrry2jw2c)                |
| Address + H3 cell                  | Talking to the Sun               | [Open locally](http://localhost:5454/p/curator.boulderevents.directory/e/3myumi6xhskfx) | [atmo.rsvp](https://atmo.rsvp/p/curator.boulderevents.directory/e/3myumi6xhskfx) |
| URI + coordinates + address        | Phantom Freakout (Day 3)         | [Open locally](http://localhost:5454/p/almanac.scenius.social/e/3myl4ynfasuzw)          | [atmo.rsvp](https://atmo.rsvp/p/almanac.scenius.social/e/3myl4ynfasuzw)          |

Check that:

- Venue names and addresses share one pin: names above, muted addresses below, including postal codes.
- Raw GPS coordinates appear only when no more useful location is available. Named geo-only events show their name and map, without a geocoding request.
- H3 events map the cell's approximate center, marked “Approximate area”. Raw cell IDs are only a text fallback when no name or address is available.
- HTTP(S) locations are clickable. AT place references are folded into the physical location by their supplied name; raw AT URIs are never displayed. Phantom Freakout should show “The Domino” once, with its address underneath and one pin linking to the map. Standalone AT references show their name as text; unnamed references stay hidden until resolution is supported.
- Long location names and URIs wrap on mobile without horizontal scrolling.
- Navigating between events updates both the locations and map.

The four records have been cached in the local development database. After resetting it, fetch them again through the **local** app's indexing endpoint (this does not publish or edit any PDS records):

```sh
base=http://localhost:5454
for uri in \
  'at://did:plc:k6owgpe2rkkchoiivxhzp2t4/community.lexicon.calendar.event/3mwbuwrpiv2tb' \
  'at://did:plc:l4fwwgqgc5gdvtebisdumf4x/community.lexicon.calendar.event/3myuxrry2jw2c' \
  'at://did:plc:7ucd6qjmlenanyswjx5hcvko/community.lexicon.calendar.event/3myumi6xhskfx' \
  'at://did:plc:wwd3t4coccvqtxkjsf6cfsrv/community.lexicon.calendar.event/3myl4ynfasuzw'
do
  curl --fail-with-body "$base/xrpc/rsvp.atmo.notifyOfUpdate" \
    -H 'content-type: application/json' --data "{\"uri\":\"$uri\"}"
done
```

If a handle isn't resolved yet, use the corresponding DID in the local URL instead of the handle. Adjust port `5454` to match your dev server. Restart Vite after installing the new H3 dependency if its optimizer reports stale dependencies.

Automated coverage (all variants, multiple locations, safe links, invalid data, map resolution, navigation races, mobile layout, and accessibility):

```sh
pnpm --filter @atmo-dev/events-ui exec vitest run tests/event-locations.svelte.spec.ts tests/event-card.svelte.spec.ts
```
