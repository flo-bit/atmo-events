# AT Tags

Public event and profile pages expose [AT Tags](https://tangled.org/chrisshank.com/at-tags)
metadata in the server-rendered HTML head. The proposal is a draft; it uses
`<meta name="at:…" content="at://…">`, not `<link>` tags.

- Event pages and both event embeds identify the event record with `at:canonical`
  and its repository's DID with `at:author`.
- Loaded parent events and conference talks shown on an event page are
  `at:alternate` records.
- Profile pages identify the account with `at:me`. The Bluesky profile record,
  when present, is `at:alternate`: the account's events page can still exist
  without it. Hosting and past-event sections also identify the account with
  `at:me`. The dedicated ATmosphereConf schedule lists its events as alternates.
- Discovery, creation and error pages do not claim a canonical AT record.

Record URIs come from resolved appview records, never a route handle or viewer
query parameter. Identity tags use `at://<DID>`, without a collection or record key.
There is no site-wide `at:me`: event authors and signed-in viewers do not own the
whole site.

Routes return an optional `AtTagMetadata` object from `@atmo-dev/kit/at-tags`.
Event loaders use Kit's server-safe `recordAtTags(record, relatedRecords)` helper;
`src/lib/at-tags.ts` only owns RSVP's profile-page relationships. The root layout
renders Kit's `AtTags` component, including for embeds, and suppresses it on errors.
Each property is an array and produces one meta tag per unique value. Client-side
navigation replaces or removes these tags with the page data.

For adoption in another app, see the self-contained
[AT Tags guide in Kit](https://github.com/flo-bit/atmo-kit#at-record-metadata-at-tags).
Kit owns the reusable rendering, helper and types; RSVP owns which records and
identities each route represents.
