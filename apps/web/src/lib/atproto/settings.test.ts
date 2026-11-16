import { describe, expect, it } from 'vitest';
import { resolveLoginOptions } from '@atmo-dev/kit';
import { PREFERRED_CLIENT_SCOPE } from '@atmo-dev/kit/social';
import { CONNECTION_SCOPE } from '../meet/connection';
import { hasScopes } from '@svelte-atproto/oauth/permissions';
import { FOR_YOU_AUDIENCE, FOR_YOU_SCOPE } from './recommendations';
import {
	allowedCollections,
	collections,
	scopes,
	requiredScopes,
	blueskyPostingScope,
	moderationActionScope,
	loginPermissions,
	getLoginPermissions,
	getLoginScopes
} from './settings';

describe('OAuth permissions', () => {
	it('declares moderator writes and only the exact recommendation RPC permission', () => {
		expect(scopes).toEqual([
			'atproto',
			'include:community.lexicon.calendar.authFull',
			'blob?accept=image/*',
			'include:app.bsky.authCreatePosts',
			moderationActionScope,
			PREFERRED_CLIENT_SCOPE,
			CONNECTION_SCOPE,
			FOR_YOU_SCOPE
		]);
	});
	it('requests the exact method with a wildcard OAuth audience, not a wildcard JWT audience', () => {
		expect(FOR_YOU_SCOPE).toBe('rpc:club.foryou.feed.getFeedSkeleton?aud=*');
		expect(FOR_YOU_AUDIENCE).toBe('did:web:foryou.club');
		expect(hasScopes(['atproto', FOR_YOU_SCOPE], FOR_YOU_SCOPE)).toBe(true);
		expect(hasScopes(['atproto', 'rpc:app.bsky.feed.getTimeline?aud=*'], FOR_YOU_SCOPE)).toBe(
			false
		);
	});
	it('uses distinct icons for calendar access and recommendations', () => {
		const calendar = loginPermissions.find(({ id }) => id === 'calendar')!;
		const recommendations = loginPermissions.find(({ id }) => id === 'recommendations')!;
		expect(recommendations.icon).not.toBe(calendar.icon);
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
	it('includes required meeting permission in the first grant when logging in from Meet', () => {
		const context = { meetings: true };
		const permissions = getLoginPermissions(context);
		const options = resolveLoginOptions(permissions, {
			meetings: false,
			bluesky: false,
			recommendations: false
		});
		expect(options.permissionIds).toEqual(['calendar', 'meetings']);
		expect(options.scopes).toContain(CONNECTION_SCOPE);
		expect(getLoginScopes(options.scopes, context)).toEqual([...requiredScopes, CONNECTION_SCOPE]);
		expect(permissions.find((p) => p.id === 'meetings')).toMatchObject({ required: true });
	});
	it('keeps normal login permissions unchanged and tool grants scoped to their context', () => {
		expect(getLoginPermissions()).toEqual(loginPermissions);
		expect(getLoginPermissions({ meetings: false })).toEqual(loginPermissions);
		expect(getLoginScopes([CONNECTION_SCOPE])).toEqual(requiredScopes);
		expect(getLoginScopes([CONNECTION_SCOPE, blueskyPostingScope], { meetings: true })).toEqual([
			...requiredScopes,
			blueskyPostingScope,
			CONNECTION_SCOPE
		]);
	});
	it('does not request meeting access in ordinary login/signup', () => {
		expect(scopes).toContain(CONNECTION_SCOPE);
		expect(requiredScopes).not.toContain(CONNECTION_SCOPE);
		expect(getLoginScopes([CONNECTION_SCOPE])).not.toContain(CONNECTION_SCOPE);
	});
	it('declares client-selection access but never requests it at login or signup', () => {
		expect(scopes).toContain(PREFERRED_CLIENT_SCOPE);
		expect(requiredScopes).not.toContain(PREFERRED_CLIENT_SCOPE);
		expect(resolveLoginOptions(loginPermissions, {}).scopes).not.toContain(PREFERRED_CLIENT_SCOPE);
		expect(getLoginScopes([PREFERRED_CLIENT_SCOPE])).not.toContain(PREFERRED_CLIENT_SCOPE);
	});
	it('selects optional posting and recommendations by default', () => {
		const options = resolveLoginOptions(loginPermissions, {});
		expect(options.permissionIds).toEqual(['calendar', 'bluesky', 'recommendations']);
		expect(options.scopes).toEqual([...requiredScopes, blueskyPostingScope, FOR_YOU_SCOPE]);
		expect(getLoginScopes(options.scopes)).toEqual(options.scopes);
	});
	it('lets the user turn Bluesky posting off without dropping required permissions', () => {
		const options = resolveLoginOptions(loginPermissions, {
			bluesky: false,
			recommendations: false
		});
		expect(options.permissionIds).toEqual(['calendar']);
		expect(getLoginScopes(options.scopes)).toEqual(requiredScopes);
	});
	it('cannot deselect calendar access', () => {
		expect(
			resolveLoginOptions(loginPermissions, {
				calendar: false,
				bluesky: false,
				recommendations: false
			}).scopes
		).toEqual(requiredScopes);
		expect(getLoginScopes([])).toEqual(requiredScopes);
	});
	it('keeps Bluesky selected without dropping required scopes', () => {
		const options = resolveLoginOptions(loginPermissions, {
			calendar: false,
			bluesky: true,
			recommendations: false
		});
		expect(options.permissionIds).toEqual(['calendar', 'bluesky']);
		expect(getLoginScopes(options.scopes)).toEqual([...requiredScopes, blueskyPostingScope]);
		expect(getLoginScopes([blueskyPostingScope])).toEqual([...requiredScopes, blueskyPostingScope]);
	});
	it('lets users authorize recommendations independently of posting', () => {
		const options = resolveLoginOptions(loginPermissions, { bluesky: false });
		expect(options.scopes).toEqual([...requiredScopes, FOR_YOU_SCOPE]);
		expect(getLoginScopes(options.scopes)).toEqual(options.scopes);
		expect(requiredScopes).not.toContain(FOR_YOU_SCOPE);
		expect(getLoginScopes([])).not.toContain(FOR_YOU_SCOPE);
	});
	it('does not accept unrelated scopes from a caller', () => {
		expect(getLoginScopes(['transition:generic', 'repo:*'])).toEqual(requiredScopes);
	});
});
