---
'web': patch
---

Use Atmo Kit's read-only Bluesky profile header on account and conference pages. Show banners, safely linkified descriptions, pronouns, modern profile links, and all-time created-event and RSVP totals without duplicating create-event, settings, or logout controls next to the profile. Use supported JPEG avatars and smaller WebP cover images. Omit the joined date and the top brand header on profile/event pages while preserving mobile navigation. Hydrate from the public AppView only after local moderation, with a bounded timeout and graceful fallback. Requires the kit release containing UserProfile (0.3.0); use kit:local until that release is published and the registry dependency can be updated.
