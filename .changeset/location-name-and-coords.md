---
"@atmo-dev/events-ui": minor
---

Keep the place name and the coordinates when picking an event location. The editor and the recurring event modal now write a `community.lexicon.location.geo` entry carrying the coordinates, so a park saves as the park instead of as its city and the event gets coordinates for radius search. A pick the geocoder gave no ISO country code for still writes its address entry, incomplete, rather than dropping it: `country` is required, but the alternative deletes the street, locality and region along with it, and nothing else in the record can hold them.

Readers show the place name and then the town. A card or an embed leads with the name and adds locality and region; the event page and both calendar exports show the whole location, including the country. Nothing shortens the name: recovering a town from a reverse-geocoded string written by another client means guessing which comma segment is a street and which is a settlement, and that guess is wrong too often to be worth making. A record saved as usable bare coordinates shows its point instead of rendering nothing. Records authored before this change are not rewritten, but they are read by the same rules, so an existing record that already had a place name now displays it.

A point of `0,0` is read as the "no data" sentinel it conventionally is: a record carrying it shows its address rather than a position in the Gulf of Guinea, and a record that is nothing but the sentinel shows no location. This is a display rule only — stored coordinates are left as they are.

Adds `locationShortLabel`, `locationShortParts`, `locationFullLabel`, `locationSummary`, and `formatPoint` for reading a display location out of a record's `locations[]`, on a new `@atmo-dev/events-ui/location-summary` subpath. `locationShortParts` is the short label unjoined, so a card can elide a long place name without eliding the town off the end of it — `EventCard` now renders the two separately.

Declares the package's subpath exports. `./conference` and `./date-format` were already imported by subpath but were not in the `exports` map, so both threw `ERR_PACKAGE_PATH_NOT_EXPORTED` when resolved from the packed package rather than through the monorepo's Vite aliasing. All three are now declared.
