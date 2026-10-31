import type { LoginPermission } from '@atmo-dev/kit';
import { PREFERRED_CLIENT_SCOPE } from '@atmo-dev/kit/social';
import Calendar from '@sketchyicons/svelte/icons/calendar';
import MessageCircle from '@sketchyicons/svelte/icons/message-circle';
import type { Capability } from '@svelte-atproto/oauth/permissions';

// Shared with Vite: import only framework-free helpers, types and icon data.
export const DEV_PORT = 5454;

// Writable calendar collections for the server-side record allowlist.
// OAuth access is granted by community.lexicon.calendar.authFull below.
export const collections = [
	'community.lexicon.calendar.event',
	'community.lexicon.calendar.rsvp'
] as const;

export const allowedCollections = [...collections, 'app.bsky.feed.post'] as const;

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
// Declared in metadata, requested only by moderators from /mod. Reporting itself
// needs no additional OAuth permissions and never writes to the reporter's PDS.
export const moderationActionScope =
	'repo:tools.atmo.moderation.action?action=create&action=delete';
// Client-selection writes are requested progressively from /settings, never at login/signup.
export const scopes = [
	...requiredScopes,
	blueskyPostingScope,
	moderationActionScope,
	PREFERRED_CLIENT_SCOPE
];

export const loginPermissions: readonly LoginPermission[] = [
	{
		id: 'calendar',
		icon: Calendar,
		label: 'Events and RSVPs',
		description: 'Create and edit events and RSVPs.',
		scopes: requiredScopes.slice(1),
		required: true
	},
	{
		id: 'bluesky',
		icon: MessageCircle,
		label: 'Post to Bluesky',
		description: 'Share events directly from your account.',
		scopes: [blueskyPostingScope],
		defaultSelected: true
	}
];

/** Always retain required permissions, including for signup and direct callers. */
export function getLoginScopes(selected: readonly string[] = []): string[] {
	return [
		...requiredScopes,
		...(selected.includes(blueskyPostingScope) ? [blueskyPostingScope] : [])
	];
}

export const blueskyPostCapability = {
	type: 'repo',
	collection: 'app.bsky.feed.post',
	action: 'create'
} as const satisfies Capability;

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
