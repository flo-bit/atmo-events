# api.atmo.rsvp

Standalone public Contrail Worker for atmo.rsvp calendar events, RSVPs, profiles, and personalized network feeds.

## Status

The API contract and Worker are implemented against `@atmo-dev/contrail` 0.19.0. **Do not deploy the scheduled Worker yet:** production activation remains gated on the bounded scheduled-ingestion release described by Contrail Plan 27.

`wrangler.jsonc` deliberately contains a placeholder D1 generation. Create and verify a fresh immutable D1 generation before deployment; do not attach the web app's existing Contrail database.

## Public contract

Discovery endpoints:

```text
https://api.atmo.rsvp/.well-known/contrail
https://api.atmo.rsvp/.well-known/did.json
https://api.atmo.rsvp/lexicons
https://api.atmo.rsvp/status
```

Anonymous XRPC methods:

```text
rsvp.atmo.getCursor
rsvp.atmo.getProfile
rsvp.atmo.event.getRecord
rsvp.atmo.event.listRecords
rsvp.atmo.event.listDiscoverable
rsvp.atmo.event.listDiscoverableByUris
rsvp.atmo.event.listAuthored
rsvp.atmo.event.listTalks
rsvp.atmo.rsvp.getRecord
rsvp.atmo.rsvp.listRecords
```

Protected AT Protocol service-auth methods:

```text
rsvp.atmo.getFeed
rsvp.atmo.notifyOfUpdate
```

The base service DID is `did:web:api.atmo.rsvp`; the exact OAuth and JWT audience is `did:web:api.atmo.rsvp#contrail`. The generated least-privilege OAuth permission is:

```text
rpc?aud=did:web:api.atmo.rsvp%23contrail&lxm=rsvp.atmo.getFeed&lxm=rsvp.atmo.notifyOfUpdate
```

`notifyOfUpdate` is an authenticated immediate-indexing hint. The API has no user sessions and never writes records to a user's PDS.

## Development

From the repository root:

```bash
pnpm --filter api lexicons:all
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api dev
```

The checked-in custom query Lexicons intentionally mirror the generated event `listRecords` response and parameters. `tests/lexicons.test.ts` detects drift if the base event query contract changes.

## Deployment preparation

After the bounded-ingestion release lands:

1. bump Contrail and rerun the API checks;
2. create a fresh D1 generation and replace the placeholder binding;
3. backfill and replay into that generation;
4. verify record, FTS, relation, cursor, discovery, CORS, and service-auth behavior;
5. configure the `api.atmo.rsvp` custom domain; and
6. activate the Worker and D1 binding together while retaining the old generation for rollback.
