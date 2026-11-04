---
'@atmo-dev/events-ui': minor
---

`configureAtproto({ appview, cdn })` points the components at another atproto
network's Bluesky API and image CDN. Comments, the post dialog's handle search
and the image URLs the package builds use them. Call it once, before any component renders, on the
server and in the browser alike. Unset, both stay the public network's, so
nothing changes for an app that doesn't call it.
