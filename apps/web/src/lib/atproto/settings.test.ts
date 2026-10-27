import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: false }));

import { allowedCollections, collections, scopes } from './settings';

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
