import { describe, expect, it } from 'vitest';
import { resolveLoginOptions } from '@atmo-dev/kit';
import { canPostToBluesky, getLoginScopes, loginPermissions } from './permissions';
import { blueskyPostingScope, requiredScopes } from './settings';

describe('permission selection', () => {
	it('requires events/RSVPs and images, but leaves Bluesky posting off by default', () => {
		const options = resolveLoginOptions(loginPermissions, {});
		expect(options.permissionIds).toEqual(['calendar']);
		expect(options.scopes).toEqual(requiredScopes);
		expect(getLoginScopes(options.scopes)).toEqual(requiredScopes);
	});

	it('cannot deselect calendar access', () => {
		expect(resolveLoginOptions(loginPermissions, { calendar: false }).scopes).toEqual(
			requiredScopes
		);
		expect(getLoginScopes([])).toEqual(requiredScopes);
	});

	it('adds Bluesky only when explicitly selected, without dropping required scopes', () => {
		const options = resolveLoginOptions(loginPermissions, { calendar: false, bluesky: true });
		expect(options.permissionIds).toEqual(['calendar', 'bluesky']);
		expect(getLoginScopes(options.scopes)).toEqual([...requiredScopes, blueskyPostingScope]);
		expect(getLoginScopes([blueskyPostingScope])).toEqual([...requiredScopes, blueskyPostingScope]);
	});

	it('does not accept unrelated scopes from a caller', () => {
		expect(getLoginScopes(['transition:generic', 'repo:*'])).toEqual(requiredScopes);
	});
});

describe('actual Bluesky grants', () => {
	it.each([
		['atproto'],
		['atproto', blueskyPostingScope],
		['atproto', 'repo:app.bsky.feed.post?action=update'],
		['atproto', 'repo:app.bsky.feed.post?action=delete'],
		['atproto', 'repo:community.lexicon.calendar.event'],
		['atproto', 'repo:app.bsky.feed.post?action=create&unknown=restriction']
	])('denies absent, opaque, or insufficient grants: %j', (...grant) => {
		expect(canPostToBluesky(grant)).toBe(false);
	});

	it.each([
		'repo:app.bsky.feed.post?action=create',
		'repo?collection=app.bsky.feed.post&action=create',
		'repo:app.bsky.feed.post',
		'repo:*?action=create'
	])('accepts a concrete create grant: %s', (grant) => {
		expect(canPostToBluesky(['atproto', grant])).toBe(true);
	});
});
