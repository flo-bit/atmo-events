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

// OAuth scopes for the records the web app writes. Contrail RPC permissions
// will be added separately with its exact service audience.
export const scopes = [
	'atproto',
	scope.repo({ collection: [...collections] }),
	scope.blob({ accept: ['image/*'] }),
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
