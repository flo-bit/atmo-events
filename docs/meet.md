# Meet

`/tools` links to `/tools/meet`. Sign-in and signup started on the Meet page include
meeting-record creation in the initial OAuth request, avoiding a second PDS approval
after returning from a scanned link. Existing sessions without that permission can
still enable meetings progressively. Ordinary event login/signup permissions are unchanged.
The **Meet** tab contains the QR code, camera scan button and account lookup;
**History** contains saved meetings and older incoming confirmations. Live incoming
meetings join the same confirmation queue on either tab. Scanned people appear
in a modal without changing the page layout. Confirming saves only that person
and immediately advances to the next; Not now skips them without writing.
Success messages dismiss after three seconds, as do already-saved encounters.
Pending confirmations and errors never auto-dismiss. The queue is local to this
page and clears on reload or account changes; saved records remain in History.

## Records and interoperability

Uses `at.youandme.connection`, verified through
<https://lex.atmo.tools/lexicons/at.youandme.connection>. Its authority is
`did:plc:zfgfhm7mpslcdc3mk3z6sebw`; the record has a TID key and requires:

```json
{
	"$type": "at.youandme.connection",
	"subject": "did:plc:the-other-person",
	"createdAt": "2026-10-31T12:00:00.000Z"
}
```

Each person owns their own record. Scanning opens a confirmation; “Yes, we met”
creates a record in the authenticated account, not the scanned person's account.
The other person's open Meet page receives the event and offers the same explicit
confirmation. No reciprocal writes, follows, or Bluesky posts happen automatically.
Sequential repeat confirmations reuse an existing record; simultaneous writes from
separate devices can still create duplicate records, which the UI groups by DID.

New meetings use the current time. Confirming an incoming meeting copies the
original record's exact `createdAt`, including for older encounters in History.
The browser sends the source record URI, never a trusted timestamp. The server
reads that public record through Slingshot's fixed-origin `com.atproto.repo.getRecord`
gateway and checks the URI, collection, subject (the viewer), and datetime before
writing. If the source is unavailable or invalid, confirmation fails instead of
silently substituting today's date. Existing outgoing records are not re-dated.

Our QR codes use `/tools/meet?actor=your.handle`, falling back to `?did=…` if a
handle is unavailable. Legacy DID links and `https://youandme.at/connect?did=…`
codes still work. The lookup accepts handles (with or without `@`), DIDs and
meeting links. It reuses the login's `ActorSearchField` and public AppView
suggestions; URLs and DIDs are never sent to account search. Handles resolve to
DIDs on the server before displaying the confirmation, and records always store
DIDs. Handle links follow the current owner of the handle; use a DID link for a
stable identity across handle changes.

Our records are readable by You & Me, but its scanner may not recognize our URL;
scanning a You & Me code from atmo.rsvp works. Phone camera apps can open our QR
links directly. In-page camera scanning requires a secure browser context and
camera permission; account lookup is a fallback. The camera replaces your QR code
in the same preview slot and keeps running while scans are queued and confirmed.
Repeated scans and aliases of the same DID are deduplicated. Handle resolution
runs in capture order through `/api/meet/resolve`, without page navigation or
camera restarts. Each queued incoming meeting retains its original record URI,
even if a later backlink refresh lags behind. Closing the camera restores your
code without discarding queued confirmations. The compact layout sizes
the preview to the available screen height and keeps lookup on one row so the
main view fits small mobile screens. Switching to History stops the camera
without closing the live subscription.

The QR is a locally generated SVG with gently irregular ink edges and rounded
finder corners, using the app's neutral ink/page colours in light and dark mode.
It retains the standard QR grid, finder geometry, high error correction, and a
five-module quiet zone. Theme changes only change colours, not the encoded data
or geometry. The camera scanner accepts both normal and inverted codes.

## Permissions and live updates

- Client metadata declares `repo:at.youandme.connection?action=create`.
- Sign-in/signup on `/tools/meet` includes it in the first grant and preserves the
  scanned link across the authorization redirect. The login permission list makes
  public meeting writes explicit. Other routes do not request this permission.
- Existing sessions can add it progressively, preserving prior OAuth grants.
- A dedicated server action checks authentication, create permission, subject DID,
  self-scans, and existing records before writing. Meeting records are not added
  to the generic record-write allowlist.
- Both devices subscribe to `at.youandme.connection` through public Jetstream.
  The subscription cannot filter to the viewer's DID: incoming records belong to
  other users. Records are filtered locally by owner/subject.
- Reconnects use bounded exponential backoff and cursor overlap. URI-based merging
  deduplicates replay, reflects updates/deletes, and closes the socket on navigation.
  Successful history refreshes discard older live overrides, so missed deletions do
  not linger. Events and saves received during the refresh remain overlaid; a failed
  history source keeps its existing overrides until a successful retry.
- The authenticated PDS supplies outgoing history. Constellation backlinks recover
  incoming encounters missed while the page was closed; indexing can lag. PDS and
  backlink failures are shown separately, not interpreted as an empty history.
- Live prompts work while the Meet page is open, not as background push notifications.

Connections are **public assertions**, not proof of physical proximity, identity,
or consent by the other person. Anyone who knows a DID can record a connection to
it. A mutual meeting means both accounts independently created a record.
Jetstream and backlinks are notification/discovery sources, not repository proofs.

## Validation

From `apps/web`:

```sh
pnpm check
pnpm exec vitest run src/lib/meet src/routes/\(app\)/tools/meet/page.server.test.ts src/lib/atproto/settings.test.ts src/lib/atproto/auth.svelte.test.ts
pnpm exec vitest run --config vitest.browser.config.ts src/lib/meet/meet.browser.spec.ts
```

Browser tests use mocked account, form-action and WebSocket boundaries. They check
QR decoding (including actual light/dark screenshots and phone-size rendering),
consent-before-write, both sides' live mutual status, replay/delete
handling, disconnect cleanup, history-tab isolation, original-date confirmations,
handle-based QR codes, typeahead selection, handle/DID/link input, incremental
authorization, mobile overflow and accessibility. Real two-account OAuth/PDS testing is still
needed before release.
