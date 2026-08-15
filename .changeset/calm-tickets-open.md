---
'@atmo-dev/events-ui': minor
---

The event view can now show a branded **Buy tickets** action for a canonical
Atmosphere Tickets page supplied by verified protocol discovery. Organizer-added
links remain unchanged in the ordinary Links section. The atmo.rsvp web app can
discover organizer-owned `tickets.atmosphere.ticketedEvent` records through its
explicitly enabled, fail-soft ATM AppView integration and link to the stable
hosted event page. Ticket discovery remains independent from admission policy:
the pilot event is explicitly configured as ticket-required rather than that
policy being inferred from every ticketedEvent record. For that pilot,
signed-out viewers see the ticket action without a competing RSVP prompt, while
signed-in viewers can mark themselves Interested and existing RSVP state remains
visible, manageable, and clearly labelled as ticketed. Discovery uses bounded
edge caching and shows an explicit temporary-unavailability message instead of
leaving required events without context during an AppView failure. This presentation
does not prove ticket ownership or enforce admission; those remain authoritative
in the ticket service until the protocol-native admission model is added.
