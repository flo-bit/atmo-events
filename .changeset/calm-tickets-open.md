---
'@atmo-dev/events-ui': minor
---

Event pages now promote an explicit ticket link to a prominent **Buy tickets**
action above the RSVP controls. Ticket links are detected by their label or by
the `events.atmosphere.tickets` host and are removed from the sidebar link list
to avoid rendering the same destination twice.
