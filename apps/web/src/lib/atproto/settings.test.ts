import { describe, expect, it } from 'vitest';
import { resolveLoginOptions } from '@atmo-dev/kit';
import {
	allowedCollections,
	collections,
	scopes,
	requiredScopes,
	blueskyPostingScope,
	loginPermissions,
	getLoginScopes
} from './settings';

describe('OAuth permissions', () => {
	it('requests only event/RSVP publishing, images, and Bluesky posts', () => {
		expect(scopes).toEqual([
			'atproto',
			'include:community.lexicon.calendar.authFull',
			'blob?accept=image/*',
			'include:app.bsky.authCreatePosts'
		]);
	});
	it('allows writes only to calendar records and Bluesky posts', () => {
		expect(collections).toEqual([
			'community.lexicon.calendar.event',
			'community.lexicon.calendar.rsvp'
		]);
		expect(allowedCollections).toEqual([...collections, 'app.bsky.feed.post']);
	});
});

describe('permission selection', () => {
	it('requires calendar access and selects optional Bluesky posting by default', () => {
		const options = resolveLoginOptions(loginPermissions, {});
		expect(options.permissionIds).toEqual(['calendar', 'bluesky']);
		expect(options.scopes).toEqual([...requiredScopes, blueskyPostingScope]);
		expect(getLoginScopes(options.scopes)).toEqual(options.scopes);
	});
	it('lets the user turn Bluesky posting off without dropping required permissions', () => {
		const options = resolveLoginOptions(loginPermissions, { bluesky: false });
		expect(options.permissionIds).toEqual(['calendar']);
		expect(getLoginScopes(options.scopes)).toEqual(requiredScopes);
	});
	it('cannot deselect calendar access', () => {
		expect(
			resolveLoginOptions(loginPermissions, { calendar: false, bluesky: false }).scopes
		).toEqual(requiredScopes);
		expect(getLoginScopes([])).toEqual(requiredScopes);
	});
	it('keeps Bluesky selected without dropping required scopes', () => {
		const options = resolveLoginOptions(loginPermissions, { calendar: false, bluesky: true });
		expect(options.permissionIds).toEqual(['calendar', 'bluesky']);
		expect(getLoginScopes(options.scopes)).toEqual([...requiredScopes, blueskyPostingScope]);
		expect(getLoginScopes([blueskyPostingScope])).toEqual([...requiredScopes, blueskyPostingScope]);
	});
	it('does not accept unrelated scopes from a caller', () => {
		expect(getLoginScopes(['transition:generic', 'repo:*'])).toEqual(requiredScopes);
	});
});
