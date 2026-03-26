import { dev } from '$app/environment';
import { scope } from '@atcute/oauth-node-client';

// writable collections
export const collections = [
	'community.lexicon.calendar.event',
	'community.lexicon.calendar.rsvp'
] as const;

export type AllowedCollection = (typeof collections)[number];

// OAuth scope — add scope.blob(), scope.rpc(), etc. as needed
const OPENMEET_SERVICE_DID = import.meta.env.VITE_OPENMEET_SERVICE_DID;
export const scopes = [
	'atproto',
	scope.repo({ collection: [...collections] }),
	scope.blob({ accept: ['image/*'] }),
	// aud=* is required — PDS doesn't support specific-DID rpc scoping:
	// bare DID gets silently dropped from consent, DID#fragment shows in consent
	// but getServiceAuth rejects fragments as invalid DIDs. Security is enforced
	// API-side: verifyAndExchange() validates aud matches SERVICE_DID.
	...(OPENMEET_SERVICE_DID
		? [scope.rpc({ lxm: ['net.openmeet.auth'], aud: '*' })]
		: [])
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
