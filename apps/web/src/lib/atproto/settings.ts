// Pure configuration, shared with Vite (no SvelteKit/runtime imports).
export const DEV_PORT = 5454;

// Writable calendar collections for the server-side record allowlist.
// OAuth access is granted by community.lexicon.calendar.authFull below.
export const collections = [
	'community.lexicon.calendar.event',
	'community.lexicon.calendar.rsvp'
] as const;

export const allowedCollections = [...collections, 'app.bsky.feed.post'];

export type AllowedCollection = (typeof allowedCollections)[number];

// Request only the permissions needed for publishing.
// Event RPCs are public; the old rsvp.atmo.permissionSet include also grants
// obsolete private Spaces methods and must not be requested.
export const requiredScopes = [
	'atproto',
	// No audience: we need the repo grants, not the set's inherited RPC grants.
	'include:community.lexicon.calendar.authFull',
	'blob?accept=image/*'
];

export const blueskyPostingScope = 'include:app.bsky.authCreatePosts';

// Metadata declares all supported permissions. Each login explicitly requests
// only requiredScopes plus the optional permissions selected by the user.
export const scopes = [...requiredScopes, blueskyPostingScope];

// set to false to disable signup
export const ALLOW_SIGNUP = true;

// which PDS to use for signup (change to your preferred PDS)
export const signUpPDS = {
	development: 'https://pds.rip/',
	production: 'https://selfhosted.social/'
};

// where to redirect after oauth login/signup
export const REDIRECT_PATH = '/oauth/callback';

// redirect the user back to the page they were on before login
export const REDIRECT_TO_LAST_PAGE_ON_LOGIN = true;

export const DOH_RESOLVER = 'https://mozilla.cloudflare-dns.com/dns-query';
