---
'@atmo-dev/events-ui': minor
---

`EventCard` now shows when a live event **ends** rather than when it started.

A card for an event already under way used to print its start time beside the
"Live" badge — "Wed, Jul 1 · Live" reads as a bug, and in a list ordered by
finishing time the start dates look shuffled. Such a card now reads "Ends 9:30 PM",
dropping the weekday and date when the event ends today, since the only thing a
reader wants then is how long they have left. The year is kept when the event does
not end this year: long-running events are exactly what this surfaces, and a
year-long journey ending in July 2027 rendered as "Ends Sun, Jul 4", which reads as
a date that has already passed.

Cards for events that have not started are unchanged.
