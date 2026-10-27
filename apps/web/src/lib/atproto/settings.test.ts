import { describe, expect, it } from 'vitest';
import { resolveLoginOptions } from '@atmo-dev/kit';
import { hasCapability } from '@svelte-atproto/oauth/permissions';
import Calendar from '@sketchyicons/svelte/icons/calendar';
import MessageCircle from '@sketchyicons/svelte/icons/message-circle';
import {
	allowedCollections,
	collections,
	scopes,
	requiredScopes,
	blueskyPostingScope,
	loginPermissions,
	getLoginScopes,
	blueskyPostCapability
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
	it('does not include the legacy permission set that grants private Spaces access', () => {
		expect(scopes).toContain('include:community.lexicon.calendar.authFull');
		expect(scopes.some((value) => value.startsWith('repo'))).toBe(false);
		expect(scopes).not.toContain('include:rsvp.atmo.permissionSet');
		expect(scopes.join(' ')).not.toMatch(/rsvp\.atmo\.(?:space|authFull)/);
		expect(scopes.join(' ')).not.toContain('pub.atmo.');
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
	it('uses a calendar icon for events and a speech bubble for Bluesky', () => {
		expect(loginPermissions.map((permission) => permission.icon)).toEqual([
			Calendar,
			MessageCircle
		]);
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

describe('configured Bluesky posting capability', () => {
	it.each([
		['atproto'],
		['atproto', blueskyPostingScope],
		['atproto', 'repo:app.bsky.feed.post?action=update'],
		['atproto', 'repo:app.bsky.feed.post?action=delete'],
		['atproto', 'repo:community.lexicon.calendar.event'],
		['atproto', 'repo:app.bsky.feed.post?action=create&unknown=restriction']
	])('denies absent, opaque, or insufficient grants: %j', (...grant) => {
		expect(hasCapability(grant, blueskyPostCapability)).toBe(false);
	});
	it.each([
		'repo:app.bsky.feed.post?action=create',
		'repo?collection=app.bsky.feed.post&action=create',
		'repo:app.bsky.feed.post',
		'repo:*?action=create'
	])('accepts a concrete create grant: %s', (grant) => {
		expect(hasCapability(['atproto', grant], blueskyPostCapability)).toBe(true);
	});
});
