# Linked event records

The editor’s **Add linked record** menu supports Grain albums, Streamplace streams and Semble collections. These remain ordinary named links in `community.lexicon.calendar.event.uris`, so other calendar clients can open them without implementing any of these integrations.

- Grain: browse the signed-in actor’s public albums (with pagination), or paste another person’s gallery URL and confirm its preview. New selections use DID-based Grain URLs; existing handle-based URLs also render.
- Streamplace: add your own channel, or another actor’s handle/channel URL. The picker validates handles and explicitly replaces the previous stream; it does not create or start a broadcast.
- Semble: browse the signed-in actor’s collections (with pagination), or paste any collection URL and confirm its preview. New selections use DID-based Semble URLs; handle-based URLs also render.
- Generic links still use **Add link**. Existing Grain/Streamplace/Semble URLs are recognized automatically when editing.

The event page places albums in **Photos**, alongside About and Comments. Gallery reads happen on the first Photos visit, independently of the event page load. Album links remain available on errors. Full-size images load only in the borderless fullscreen lightbox; arrow keys navigate and Escape closes it. Content warnings gate album/photo images, including picker covers. Streamplace retains its existing live-player placement and event-time rules.

Semble collections get a **Collections** tab, also read on its first visit. It lists the collection’s 50 most recently updated cards (preview image, title, site, description or note) and links to Semble for the rest. Preview images are the linked pages' own, loaded by the browser directly from their HTTPS hosts without a referrer, as on Semble itself. Anyone can add cards to an open collection, so cards from other people name who added them.

## Ownership

`@atmo-dev/kit` owns the reusable PhotoGrid, PhotoLightbox, GrainAlbumPicker, GrainAlbumView, SembleCollectionPicker, SembleCollectionView and StreamplacePicker. Components take data/callbacks and never import event types, EditorAdapter, app routes or Cloudflare code. Grain parsing, normalized data types and the current XRPC adapter live in Kit’s framework-free `@atmo-dev/kit/grain` entry point; `@atmo-dev/kit/semble` is its Semble counterpart.

`@atmo-dev/kit/events` owns the linked-record menu, event `uris` updates, deduplication, one-stream replacement and tab composition. Its adapter contract is exported from `@atmo-dev/kit/events-data`. RSVP supplies `EditorAdapter.linkedRecords`: the web app’s `createLinkedRecordsClient` calls its own `/api/linked-records` route. That route wraps Kit’s `createGrainXrpcClient` and `createSembleXrpcClient` with Cloudflare caching. Both the signed-in app and Blento embed use this HTTP adapter; other event-UI hosts can supply their own reads.

The shared `GrainClient` contract uses `getGallery(reference)` and `listAlbums(actor, cursor?)`. It is independent of Grain.social’s wire format: atmo.pics can supply a Contrail-backed implementation later without changing the UI or event records. For now, reads still use Grain.social’s public XRPC endpoints:

- `social.grain.unspecced.getGallery?gallery=at://…`
- `dev.hatk.getFeed?feed=actor&actor=did:…&limit=24&cursor=…`

Semble reads use its public API on `api.semble.so`:

- `network.cosmik.collection.getByAtUri?handle=…&recordKey=…&limit=50`
- `network.cosmik.collection.listByUser?identifier=did:…&limit=24&page=…`

Only these fixed upstream endpoints are fetched. Responses are normalized, image hosts restricted to Grain’s CDN; Semble preview images are limited to HTTPS URLs, and requests have a five-second timeout with redirects disabled. RSVP caches public successes for 60 seconds; upstream failures are not cached. No Grain or Semble session, new OAuth permission, photo upload, appview indexing or database migration is required.

## Coordinated Kit development

RSVP uses the published `@atmo-dev/kit@0.13.0` release. For local iteration, build and use the packaged checkout without changing the committed dependency:

```sh
# From 11-atproto/
(cd 00-atmo-kit/kit && corepack pnpm prepack)
cd 08-atmo-rsvp/atmo-rsvp
ATMO_KIT_PATH=../../00-atmo-kit/kit corepack pnpm kit:local
```

Restart any running RSVP dev server after changing Kit mode. Local mode changes `node_modules` only and preserves the committed lockfile. `corepack pnpm kit:registry` restores the published version from the lockfile. There is no separate events-ui package or peer range to maintain.

## Posts in descriptions

A link to a Bluesky post alone on its own line of an event description is shown as the post itself, also for mu, Blacksky and Witchsky links (the clients in Kit’s `socialClients`). The browser reads the post from the public AppView, as it does for comments. Posts that are missing, hidden from logged-out viewers, or carry a moderation label (on the post, its author, or anything it quotes) stay ordinary links, as do labeled links and links inside a sentence. Clicking the post opens it in the viewer’s preferred client. The event record is unchanged.

The comments tab follows the same rule: a reply with a moderation label, or quoting a labeled post, is left out along with the replies beneath it.

A link to a profile on one of those clients, alone on its own line, becomes a small card with avatar, name and handle that opens in the viewer’s preferred client. Labeled or missing profiles stay links.

## Events in descriptions

A link to another event page on atmo.rsvp (`/p/<handle or DID>/e/<rkey>`), alone on its own line, is shown as an event card. The card reads `/api/linked-records/event?actor=…&rkey=…`, which uses the same indexed read as the event page, and is never cached, so hidden, private and missing events stay ordinary links. A link to the event itself is not embedded.
