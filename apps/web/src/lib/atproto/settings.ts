import { dev } from '$app/environment';
import { scope } from '@atcute/oauth-node-client';

// writable collections — declared as a standalone scope because their NSIDs
// (`community.lexicon.*`) sit outside our namespace, so they can't go in
// `rsvp.atmo.permissionSet` (permission sets can only reference NSIDs in their
// own namespace).
export const collections = [
	'community.lexicon.calendar.event',
	'community.lexicon.calendar.rsvp'
] as const;

export const allowedCollections = [...collections, 'app.bsky.feed.post'];

export type AllowedCollection = (typeof allowedCollections)[number];

// OAuth scopes. `include:rsvp.atmo.permissionSet?aud=*` bundles every rpc method
// the deployment exposes; `aud=*` lets the same consent cover dev (tunnel DID)
// and prod (published DID) without re-consenting. Repo writes and blob uploads
// live as standalone scopes since they reference NSIDs (or resource kinds)
// outside the `rsvp.atmo` namespace.
export const scopes = [
	'atproto',
	scope.repo({ collection: [...collections] }),
	scope.blob({ accept: ['image/*'] }),
	'include:rsvp.atmo.permissionSet',
	'include:app.bsky.authCreatePosts'
];

// set to false to disable signup
export const ALLOW_SIGNUP = true;

// which PDS to use for signup (change to your preferred PDS)
const devPDS = 'https://pds.rip/';
const prodPDS = 'https://selfhosted.social/';
export const signUpPDS = dev ? devPDS : prodPDS;

// where to redirect after oauth login/signup
export const REDIRECT_PATH = '/oauth/callback';

// redirect the user back to the page they were on before login
export const REDIRECT_TO_LAST_PAGE_ON_LOGIN = true;

export const DOH_RESOLVER = 'https://mozilla.cloudflare-dns.com/dns-query';
