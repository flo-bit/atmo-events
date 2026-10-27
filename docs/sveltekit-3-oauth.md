# SvelteKit 3 and OAuth

## Runtime and dependencies

Use Node.js 22.17 or newer and the pnpm version in the root manifest.

The web app uses SvelteKit 3.1, adapter-cloudflare 8, Vite 8, Svelte 5.57, TypeScript 6, and Vitest 5. The events UI is a standalone Svelte package, not a SvelteKit app. Its check/package scripts no longer run `svelte-kit sync`.

Direct dependencies were updated along with the framework. The patched Contrail 0.12.2 stack is intentionally retained: moving to the newer Contrail architecture is a separate backend migration. TypeScript stays on the supported 6.x line rather than adopting the native TypeScript 7 compiler in the same change. Upstream peer-range warnings remain for Runed's optional Kit 2 peer and some transitive dependencies; checks, tests, and the Cloudflare build are the compatibility checks here.

SvelteKit configuration now lives in `apps/web/vite.config.ts`. Source imports use `#lib`, route helpers use the Kit 3 paths API, remote functions live outside `/server/` directories, and Worker code reads `env`/`waitUntil` from `cloudflare:workers` rather than `event.platform`. Unit tests alias that Worker module to `src/test/cloudflare.ts`.

## Authentication

`apps/web/src/lib/atproto/server/oauth.ts` lazily configures `@svelte-atproto/oauth@0.4.1`. `hooks.server.ts` delegates routing, session restoration, signed cookies, and revocation to it. The library serves:

- `GET /oauth-client-metadata.json`
- `GET /oauth/jwks.json`
- `GET /oauth/callback`
- `POST /oauth/login`
- `POST /oauth/logout`
- `POST /oauth/permissions`

Existing configuration is retained:

- `COOKIE_SECRET` signs the existing `did` cookie using the same HMAC format.
- `OAUTH_PUBLIC_URL` and `CLIENT_ASSERTION_KEY` configure production or a public dev tunnel.
- Development without a public origin uses loopback on port 5454.
- `OAUTH_SESSIONS` retains DID-keyed sessions; `OAUTH_STATES` retains a 600-second TTL.
- Signup uses the configured development/production PDS.

Two small compatibility adaptations are necessary with OAuth 0.4.1:

1. Its server bundle still imports `$app/environment`. Vite aliases this to Kit 3's `$app/env`.
2. Its name-based Cloudflare adapter still reads `event.platform`. The app instead passes the actual Worker bindings to `cloudflareKV`, through lazy factories. Missing local bindings use the library's memory fallback.

Return destinations travel in the individual authorization state, validated by the library. The client no longer writes a shared `oauth_return_to` cookie. The old full-scope equality cookie check is gone: optional grants do not invalidate an otherwise valid login. The library can migrate signed legacy scope cookies into stored request history.

The network feed is prewarmed in the background on the first authenticated layout load, rather than replacing the library's callback handler.

The old `methods.ts` facade, unused image/Microcosm helpers, and setup scripts are removed. Public AT Protocol reads and CDN URLs use the library's `/helper` and `/bsky` exports directly. The editor adapter calls the secured remote writes directly, without a second set of wrappers. Actor caching/retry remains in the app's existing `actor.ts`; cached Contrail profile loading remains app-specific.

`pnpm --filter web env:setup-dev`, `env:generate-key`, and `env:generate-secret` now call the library CLI. They keep the existing command names but no longer maintain local copies of key/secret generation.

For a public development tunnel, run `pnpm --filter web tunnel` (requires `cloudflared`), set `OAUTH_PUBLIC_URL` in `apps/web/.env` to its URL, and restart Vite. Allowed hosts are derived from that setting. The tunnel command no longer edits `.env` or source/config files, and stopping it does not clear the setting.

## Permission selection

`atproto/permissions.ts` defines the choices used by the login dialog and signup screen:

| Choice           | Required           | Request                                                              |
| ---------------- | ------------------ | -------------------------------------------------------------------- |
| Events and RSVPs | Yes                | `include:community.lexicon.calendar.authFull` plus image blob upload |
| Post to Bluesky  | No; off by default | `include:app.bsky.authCreatePosts`                                   |

Metadata declares all supported scopes. Each login/signup explicitly sends only the required scopes plus optional selections. Calendar access cannot be deselected. No Spaces or atmo.pub permissions are requested.

Requested scopes are not evidence of access. The server reads the current token through the library's capability API and forwards `canPostToBluesky` to the viewer. `ShareModal` shows the direct composer only for an authenticated viewer with this explicit capability. Removing it closes any open composer; missing permission still permits manual `bsky.app/intent/compose` sharing. The server independently checks the token before creating/updating/deleting Bluesky posts, so hiding the button is not the only enforcement.

Existing sessions with a concrete post-creation grant continue to work. An `include:` token alone is not treated as proof of a concrete grant. No forced logout or database cleanup is performed.

## Reply bot

The Bluesky RSVP reply bot remains enabled. Password authentication now uses `@atcute/password-session`, the replacement for the removed `CredentialManager` API. Its existing KV key and stored sessions remain usable.

OAuth 0.4.1 exposes the current browser session, but no arbitrary-DID background restoration API. `lib/bot/oauth.ts` therefore keeps a narrow SDK bridge for cron RSVP writes on behalf of previously signed-in users. It obtains metadata from the library and shares its KV layout and process-local refresh lock. Its session adapter preserves the library's request history and login generation when rotating tokens.

Like the library's default, the shared lock is process-local; Cloudflare KV is not a strongly consistent distributed session store. This migration does not claim cross-Worker refresh/upgrade serialization.

## Verification

```sh
pnpm check
pnpm test
pnpm build
pnpm package:ui
```

Unit/browser coverage includes required and optional selections, signup scope forwarding, concrete versus opaque grants, server-side post enforcement, permission loss while the composer is open, legacy bot history preservation, Worker storage configuration, and fail-closed permission snapshots.

For a manual check, open Log in, enter a handle, and continue to the permission screen. Events/RSVPs should be checked and disabled; Bluesky posting should be unchecked and selectable. Repeat from Sign up. Authorizing against a real PDS is needed to test actual grant issuance; local UI verification can intercept `/oauth/login` without authenticating or publishing anything.
