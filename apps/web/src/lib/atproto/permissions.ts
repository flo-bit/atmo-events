import type { LoginPermission } from '@atmo-dev/kit';
import { hasCapability, type Capability, type Scope } from '@svelte-atproto/oauth/permissions';
import { blueskyPostingScope, requiredScopes } from './settings';

export const loginPermissions: readonly LoginPermission[] = [
	{
		id: 'calendar',
		label: 'Events and RSVPs',
		description: 'Create and edit events, RSVP, and upload event images.',
		scopes: requiredScopes.slice(1),
		required: true
	},
	{
		id: 'bluesky',
		label: 'Post to Bluesky',
		description: 'Share events directly from your account.',
		scopes: [blueskyPostingScope],
		defaultSelected: false
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

/** Only concrete token grants count; include: requests alone prove nothing. */
export function canPostToBluesky(grantedScope: Scope): boolean {
	return hasCapability(grantedScope, blueskyPostCapability);
}
