# Linked event records

The editor’s **Add linked record** menu supports Grain albums and Streamplace streams. These remain ordinary named links in `community.lexicon.calendar.event.uris`, so other calendar clients can open them without implementing either integration.

- Grain: browse the signed-in actor’s public albums (with pagination), or paste another person’s gallery URL and confirm its preview. New selections use DID-based Grain URLs; existing handle-based URLs also render.
- Streamplace: add your own channel, or another actor’s handle/channel URL. The picker validates handles and explicitly replaces the previous stream; it does not create or start a broadcast.
- Generic links still use **Add link**. Existing Grain/Streamplace URLs are recognized automatically when editing.

The event page places albums in **Photos**, alongside About and Comments. Gallery reads happen on the first Photos visit, independently of the event page load. Album links remain available on errors. Full-size images load only in the borderless fullscreen lightbox; arrow keys navigate and Escape closes it. Content warnings gate album/photo images, including picker covers. Streamplace retains its existing live-player placement and event-time rules.

## Ownership

`@atmo-dev/kit` owns the reusable PhotoGrid, PhotoLightbox, GrainAlbumPicker, GrainAlbumView and StreamplacePicker. Components take data/callbacks and never import event types, EditorAdapter, app routes or Cloudflare code. Grain parsing, normalized data types and the current XRPC adapter live in Kit’s framework-free `@atmo-dev/kit/grain` entry point.

RSVP owns the linked-record menu, event `uris` updates, deduplication, one-stream replacement, tab composition and `EditorAdapter.linkedRecords`. The web app’s `createLinkedRecordsClient` calls its own `/api/linked-records` route. That route wraps Kit’s `createGrainXrpcClient` with Cloudflare caching. Both the signed-in app and Blento embed use this HTTP adapter; other event-UI hosts can supply their own reads.

The shared `GrainClient` contract uses `getGallery(reference)` and `listAlbums(actor, cursor?)`. It is independent of Grain.social’s wire format: atmo.pics can supply a Contrail-backed implementation later without changing the UI or event records. For now, reads still use Grain.social’s public XRPC endpoints:

- `social.grain.unspecced.getGallery?gallery=at://…`
- `dev.hatk.getFeed?feed=actor&actor=did:…&limit=24&cursor=…`

Only these fixed upstream endpoints are fetched. Responses are normalized, image hosts restricted to Grain’s CDN, and requests have a five-second timeout with redirects disabled. RSVP caches public successes for 60 seconds; upstream failures are not cached. No Grain session, new OAuth permission, photo upload, appview indexing or database migration is required.

## Coordinated Kit development

These new Kit APIs require a coordinated Kit release before switching RSVP back to registry dependencies. Until published, build and use the packaged local checkout (no source aliases or committed file dependencies):

```sh
# From 11-atproto/
(cd 00-atmo-kit/kit && corepack pnpm prepack)
cd 08-atmo-rsvp/atmo-rsvp
ATMO_KIT_PATH=../../00-atmo-kit/kit corepack pnpm kit:local
```

Restart any running RSVP dev server after changing Kit mode. Local mode changes `node_modules` only and preserves the registry lockfile. After Kit publication, update the app dependency and events-ui peer range to that published version, then use `corepack pnpm kit:registry`.
